import React, { useState, useEffect } from 'react';
import { CustomTag, RequestRecord } from '../../types';

interface TagsManagerProps {
  records: RequestRecord[];
  selectedRecords: string[];
  onTagsUpdate: (recordIds: string[], tags: string[]) => void;
}

const TagsManager: React.FC<TagsManagerProps> = ({
  records,
  selectedRecords,
  onTagsUpdate
}) => {
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTagsForRecords, setSelectedTagsForRecords] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedRecordsForBulk, setSelectedRecordsForBulk] = useState<string[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);

  // 预定义的标签颜色
  const tagColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
  ];

  useEffect(() => {
    loadCustomTags();
    loadActiveTag();
  }, []);

  const loadCustomTags = async () => {
    try {
      const result = await chrome.storage.local.get(['customTags']);
      if (result.customTags) {
        // 按 order 排序，order 值小的在前面（新分组在最上面）
        const sortedTags = result.customTags.sort((a: CustomTag, b: CustomTag) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          return orderA - orderB;
        });
        setCustomTags(sortedTags);
      }
    } catch (error) {
      console.error('Failed to load custom tags:', error);
    }
  };

  const loadActiveTag = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAG' });
      if (response.success && response.activeTag) {
        setActiveTagId(response.activeTag.id);
      }
    } catch (error) {
      console.error('Failed to load active tag:', error);
    }
  };

  const saveCustomTags = async (tags: CustomTag[]) => {
    try {
      await chrome.storage.local.set({ customTags: tags });
      setCustomTags(tags);
    } catch (error) {
      console.error('Failed to save custom tags:', error);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // 获取最小的 order 值，新分组将显示在最上面
      const minOrder = customTags.length > 0 ? Math.min(...customTags.map(tag => tag.order || 0)) : 0;
      
      const newTag: CustomTag = {
        id: `tag_${Date.now()}`,
        name: newTagName.trim(),
        color: tagColors[customTags.length % tagColors.length],
        description: '',
        createdAt: Date.now(),
        requestIds: [],
        isExpanded: true,
        isActive: false,
        order: minOrder - 1 // 新分组的 order 更小，显示在最上面
      };

      const updatedTags = [newTag, ...customTags]; // 新分组放在数组开头
      await saveCustomTags(updatedTags);
      setNewTagName('');
    } catch (error) {
      console.error('Failed to create tag:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const setAsActiveTag = async (tagId: string) => {
    try {
      await chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_TAG',
        data: { tagId }
      });
      setActiveTagId(tagId);
      
      // 更新本地标签状态
      const updatedTags = customTags.map(tag => ({
        ...tag,
        isActive: tag.id === tagId
      }));
      setCustomTags(updatedTags);
      await saveCustomTags(updatedTags);
    } catch (error) {
      console.error('Failed to set active tag:', error);
    }
  };

  const deleteTag = async (tagId: string) => {
    const tagToDelete = customTags.find(tag => tag.id === tagId);
    if (!tagToDelete) return;
    
    const recordCount = tagToDelete.requestIds?.length || 0;
    const confirmMessage = recordCount > 0 
      ? `确定要删除标签 "${tagToDelete.name}" 吗？\n这将同时删除该标签下的 ${recordCount} 个接口记录。`
      : `确定要删除标签 "${tagToDelete.name}" 吗？`;
    
    if (confirm(confirmMessage)) {
      try {
        // 发送删除消息给background script
        await chrome.runtime.sendMessage({
          type: 'DELETE_TAG_AND_RECORDS',
          data: { tagId }
        });
        
        // 刷新数据
        await loadCustomTags();
        
        // 通知父组件刷新记录列表
        window.location.reload(); // 临时解决方案
      } catch (error) {
        console.error('Failed to delete tag and records:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const addTagsToSelectedRecords = () => {
    if (selectedRecords.length === 0 || selectedTagsForRecords.length === 0) {
      alert('请选择要添加标签的记录和标签');
      return;
    }

    onTagsUpdate(selectedRecords, selectedTagsForRecords);
    
    // 更新标签的请求关联
    const updatedTags = customTags.map(tag => {
      if (selectedTagsForRecords.includes(tag.name)) {
        const newRequestIds = [...new Set([...tag.requestIds, ...selectedRecords])];
        return { ...tag, requestIds: newRequestIds };
      }
      return tag;
    });
    
    saveCustomTags(updatedTags);
    setSelectedTagsForRecords([]);
  };

  const bulkAddTagsToRecords = () => {
    if (selectedRecordsForBulk.length === 0 || selectedTagsForRecords.length === 0) {
      alert('请选择要添加标签的记录和标签');
      return;
    }

    onTagsUpdate(selectedRecordsForBulk, selectedTagsForRecords);
    
    // 更新标签的请求关联
    const updatedTags = customTags.map(tag => {
      if (selectedTagsForRecords.includes(tag.name)) {
        const newRequestIds = [...new Set([...tag.requestIds, ...selectedRecordsForBulk])];
        return { ...tag, requestIds: newRequestIds };
      }
      return tag;
    });
    
    saveCustomTags(updatedTags);
    setSelectedTagsForRecords([]);
    setSelectedRecordsForBulk([]);
    setBulkMode(false);
  };

  const removeTagFromRecords = (tagName: string, recordIds: string[]) => {
    updateRecordTags(recordIds, tagName, 'remove');
    
    // 更新标签的请求关联
    const updatedTags = customTags.map(tag => {
      if (tag.name === tagName) {
        const newRequestIds = tag.requestIds.filter(id => !recordIds.includes(id));
        return { ...tag, requestIds: newRequestIds };
      }
      return tag;
    });
    
    saveCustomTags(updatedTags);
  };

  const updateRecordTags = (recordIds: string[], tagName: string, action: 'add' | 'remove') => {
    // 通过消息更新记录的标签
    chrome.runtime.sendMessage({
      type: action === 'add' ? 'ADD_CUSTOM_TAGS' : 'REMOVE_CUSTOM_TAGS',
      data: { recordIds, tagNames: [tagName] }
    });
  };

  const getRecordTags = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    return record?.customTags || [];
  };

  const toggleRecordSelection = (recordId: string) => {
    setSelectedRecordsForBulk(prev => {
      if (prev.includes(recordId)) {
        return prev.filter(id => id !== recordId);
      } else {
        return [...prev, recordId];
      }
    });
  };

  const selectAllRecords = () => {
    if (selectedRecordsForBulk.length === records.length) {
      setSelectedRecordsForBulk([]);
    } else {
      setSelectedRecordsForBulk(records.map(r => r.id));
    }
  };

  const getTagStats = (tag: CustomTag) => {
    return {
      count: tag.requestIds.length,
      selectedCount: tag.requestIds.filter(id => selectedRecords.includes(id)).length
    };
  };

  return (
    <div className="space-y-4">
      <div className="border-b pb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">标签管理</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setBulkMode(!bulkMode)}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                bulkMode 
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {bulkMode ? '退出批量模式' : '批量模式'}
            </button>
          </div>
        </div>
        
        {/* 创建新标签 */}
        <div className="flex space-x-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && createTag()}
            placeholder="输入新标签名称"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={isCreating}
          />
          <button
            onClick={createTag}
            disabled={!newTagName.trim() || isCreating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {isCreating ? '创建中...' : '创建标签'}
          </button>
        </div>
      </div>

      {/* 现有标签列表 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">现有标签</h4>
        
        {customTags.length === 0 ? (
          <p className="text-sm text-gray-500 italic">暂无自定义标签</p>
        ) : (
          <div className="space-y-2">
            {customTags.map((tag) => {
              const stats = getTagStats(tag);
              return (
                <div key={tag.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: tag.color }}
                    ></div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">{tag.name}</span>
                      <div className="text-xs text-gray-500">
                        {stats.count} 个请求
                        {stats.selectedCount > 0 && ` (${stats.selectedCount} 个已选中)`}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        if (selectedTagsForRecords.includes(tag.name)) {
                          setSelectedTagsForRecords(prev => prev.filter(t => t !== tag.name));
                        } else {
                          setSelectedTagsForRecords(prev => [...prev, tag.name]);
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded ${
                        selectedTagsForRecords.includes(tag.name)
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {selectedTagsForRecords.includes(tag.name) ? '已选择' : '选择'}
                    </button>
                    
                    <button
                      onClick={() => setAsActiveTag(tag.id)}
                      className={`px-2 py-1 text-xs rounded ${
                        tag.isActive || activeTagId === tag.id
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                      }`}
                      title="设置为活跃标签，新录制的接口会自动归入此标签"
                    >
                      {tag.isActive || activeTagId === tag.id ? '活跃中' : '设为活跃'}
                    </button>
                    
                    <button
                      onClick={() => deleteTag(tag.id)}
                      className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                    >
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 为选中记录添加标签 */}
      {(selectedRecords.length > 0 || bulkMode) && (
        <div className="border-t pt-4">
          {bulkMode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">
                  批量选择记录 ({selectedRecordsForBulk.length} / {records.length})
                </h4>
                <button
                  onClick={selectAllRecords}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {selectedRecordsForBulk.length === records.length ? '取消全选' : '全选'}
                </button>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2">
                {records.map(record => {
                  const isSelected = selectedRecordsForBulk.includes(record.id);
                  const tags = getRecordTags(record.id);
                  
                  return (
                    <div key={record.id} className="flex items-center space-x-3 p-2 border rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRecordSelection(record.id)}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">
                          <span className="font-medium">{record.method}</span> {new URL(record.url).pathname}
                        </div>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tags.map(tagName => {
                              const tag = customTags.find(t => t.name === tagName);
                              return (
                                <span 
                                  key={tagName}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                                  style={{ 
                                    backgroundColor: tag?.color + '20', 
                                    color: tag?.color 
                                  }}
                                >
                                  {tagName}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              为选中的记录添加标签 ({selectedRecords.length} 个记录)
            </h4>
          )}
          
          {selectedTagsForRecords.length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-gray-600 mb-2">选中的标签:</div>
              <div className="flex flex-wrap gap-2">
                {selectedTagsForRecords.map(tagName => {
                  const tag = customTags.find(t => t.name === tagName);
                  return (
                    <span 
                      key={tagName}
                      className="inline-flex items-center px-2 py-1 rounded text-xs"
                      style={{ 
                        backgroundColor: tag?.color + '20', 
                        color: tag?.color 
                      }}
                    >
                      {tagName}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          
          <button
            onClick={bulkMode ? bulkAddTagsToRecords : addTagsToSelectedRecords}
            disabled={selectedTagsForRecords.length === 0 || (bulkMode ? selectedRecordsForBulk.length === 0 : selectedRecords.length === 0)}
            className="w-full py-2 px-4 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {bulkMode 
              ? `批量添加标签到选中记录 (${selectedRecordsForBulk.length}个)`
              : `添加标签到选中记录`
            }
          </button>
        </div>
      )}

      {/* 已标记的记录概览 */}
      {selectedRecords.length > 0 && !bulkMode && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">选中记录的标签</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {selectedRecords.slice(0, 5).map(recordId => {
              const record = records.find(r => r.id === recordId);
              const tags = getRecordTags(recordId);
              
              if (!record) return null;
              
              return (
                <div key={recordId} className="text-xs">
                  <div className="text-gray-600 truncate">
                    {record.method} {new URL(record.url).pathname}
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map(tagName => {
                        const tag = customTags.find(t => t.name === tagName);
                        return (
                          <span 
                            key={tagName}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                            style={{ 
                              backgroundColor: tag?.color + '20', 
                              color: tag?.color 
                            }}
                          >
                            {tagName}
                            <button
                              onClick={() => removeTagFromRecords(tagName, [recordId])}
                              className="ml-1 text-red-500 hover:text-red-700"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {selectedRecords.length > 5 && (
              <div className="text-xs text-gray-500 italic">
                还有 {selectedRecords.length - 5} 个记录...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TagsManager;