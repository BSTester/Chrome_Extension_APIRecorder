import React, { useEffect, useState } from 'react';
import { RequestRecord, CustomTag } from '../../types';
import { GroupManager } from '../../services/GroupManager';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';

interface GroupedRequestListProps {
  records: RequestRecord[];
  loading: boolean;
  selectedRecords: Set<string>;
  onRecordSelection: (recordId: string, selected: boolean) => void;
  onBatchRecordSelection?: (recordIds: string[], selected: boolean) => void;
  onSelectAll: () => void;
  showTitle?: boolean;
  refreshTrigger?: number;
}

interface GroupSection {
  group: CustomTag | null;
  records: RequestRecord[];
  isExpanded: boolean;
}

const GroupedRequestList: React.FC<GroupedRequestListProps> = ({
  records,
  loading,
  selectedRecords,
  onRecordSelection,
  onBatchRecordSelection,
  onSelectAll,
  showTitle = true,
  refreshTrigger = 0,
}) => {
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [groupSections, setGroupSections] = useState<GroupSection[]>([]);
  const [groupManager] = useState(() => GroupManager.getInstance());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{
    isOpen: boolean;
    groupId: string;
    groupName: string;
    recordCount: number;
  }>({
    isOpen: false,
    groupId: '',
    groupName: '',
    recordCount: 0,
  });

  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'success',
  });

  // 未使用的入参规避TS未使用告警
  void showTitle;
  void onSelectAll;

  useEffect(() => {
    const loadAndOrganize = async () => {
      await groupManager.loadState();
      const organized = groupManager.organizeRecordsByGroups(records);
      setGroupSections(organized);
    };
    loadAndOrganize();
  }, [records, groupManager, refreshTrigger]);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.activeGroupId || changes.customTags) {
        (async () => {
          await groupManager.loadState();
          const organized = groupManager.organizeRecordsByGroups(records);
          setGroupSections(organized);
        })();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [groupManager, records]);

  const getMethodClass = (m: string) => {
    switch (m.toLowerCase()) {
      case 'get': return 'method-get';
      case 'post': return 'method-post';
      case 'put': return 'method-put';
      case 'patch': return 'method-patch';
      case 'delete': return 'method-delete';
      case 'options': return 'method-options';
      default: return 'method-options';
    }
  };

  const getStatusClass = (status: number) => {
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return 'status-info';
  };

  const formatUrl = (url: string, maxLength: number = 50) => {
    try {
      const u = new URL(url);
      const path = u.pathname + u.search;
      return path.length > maxLength ? path.substring(0, maxLength) + '...' : path;
    } catch {
      return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
    }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString();

  const formatResponseTime = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  const formatSize = (data: any) => {
    if (!data) return '-';
    const size = JSON.stringify(data).length;
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  const toggleExpanded = (recordId: string) => {
    setExpandedRecord(expandedRecord === recordId ? null : recordId);
  };

  const handleExpandClick = async (groupId: string | null, event: React.MouseEvent) => {
    event.stopPropagation();
    const currentSection = groupSections.find(s => (s.group?.id || null) === groupId);
    if (!currentSection) return;

    // 本地立即切换（可折叠）
    setGroupSections(prev => prev.map(s => {
      const sid = s.group?.id || null;
      return sid === groupId ? { ...s, isExpanded: !s.isExpanded } : s;
    }));

    // 同步到 GroupManager，维持“只展开一个”策略
    if (!currentSection.isExpanded) {
      for (const section of groupSections) {
        const sid = section.group?.id || null;
        if (sid !== groupId && section.isExpanded) {
          await groupManager.toggleGroupExpanded(sid);
        }
      }
      await groupManager.toggleGroupExpanded(groupId);
    } else {
      await groupManager.toggleGroupExpanded(groupId);
    }

    await groupManager.loadState();
    setGroupSections(groupManager.organizeRecordsByGroups(records));
  };

  const handleActivateClick = async (groupId: string | null, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      if (groupId === null) {
        await groupManager.setActiveGroup(null);
      } else {
        await groupManager.setActiveGroup(groupId);
      }
      // 收起所有
      for (const section of groupSections) {
        const sid = section.group?.id || null;
        if (section.isExpanded) await groupManager.toggleGroupExpanded(sid);
      }
      // 展开目标
      const target = groupSections.find(s => (s.group?.id || null) === groupId);
      if (target && !target.isExpanded) await groupManager.toggleGroupExpanded(groupId);

      await groupManager.loadState();
      setGroupSections(groupManager.organizeRecordsByGroups(records));
      setTimeout(() => {
        setGroupSections(groupManager.organizeRecordsByGroups(records));
      }, 100);
    } catch (e) {
      console.error('激活分组失败:', e);
    }
  };

  const handleDeleteGroup = (groupId: string, groupName: string, recordCount: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeleteConfirmDialog({
      isOpen: true,
      groupId,
      groupName,
      recordCount,
    });
  };

  const handleConfirmDelete = async () => {
    const { groupId } = deleteConfirmDialog;
    try {
      await groupManager.deleteGroup(groupId);
      await groupManager.loadState();
      setGroupSections(groupManager.organizeRecordsByGroups(records));
      setDeleteConfirmDialog({ isOpen: false, groupId: '', groupName: '', recordCount: 0 });
    } catch (e: any) {
      console.error('删除分组失败:', e);
      alert('删除分组失败: ' + e.message);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmDialog({ isOpen: false, groupId: '', groupName: '', recordCount: 0 });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
  };

  const handleCopySuccess = (type: string) => showToast(`${type}已复制到剪贴板`, 'success');

  const handleStartEditGroup = (groupId: string, groupName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingGroupId(groupId);
    setEditingGroupName(groupName);
  };

  const handleSaveEditGroup = async (groupId: string, event?: React.MouseEvent | React.KeyboardEvent) => {
    if (event) event.stopPropagation();
    if (!editingGroupName.trim()) {
      alert('分组名称不能为空');
      return;
    }
    try {
      await groupManager.updateGroup(groupId, { name: editingGroupName.trim() });
      setEditingGroupId(null);
      setEditingGroupName('');
      await groupManager.loadState();
      setGroupSections(groupManager.organizeRecordsByGroups(records));
    } catch (e: any) {
      console.error('更新分组失败:', e);
      alert('更新分组失败: ' + e.message);
    }
  };

  const handleCancelEditGroup = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (records.length === 0 && groupSections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500">
        <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">暂无录制记录</p>
        <p className="text-xs text-gray-400 mt-1">开始录制以查看HTTP请求</p>
        <p className="text-xs text-gray-400 mt-2">💡 提示：先创建分组，录制的接口会自动归类到激活的分组</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto scrollbar-thin">
        {groupSections.map((section) => {
          const isActive = section.group ? (section.group.isActive || false) : (groupManager.getActiveGroupId() === null);

          return (
            <div key={section.group?.id || 'ungrouped'} className={`group mb-2 border rounded-lg overflow-hidden ${isActive ? 'border-blue-500 shadow-sm' : 'border-gray-200'}`}>
              <div className={`flex items-center border-b ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                {/* 左侧：展开/收起 + 选择 */}
                <div
                  className="flex items-center space-x-2 w-1/2 hover:bg-white/50 px-3 py-2 cursor-pointer"
                  onClick={(e) => {
                    if (editingGroupId === section.group?.id) return;
                    handleExpandClick(section.group?.id || null, e);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={section.records.length > 0 && section.records.every(r => selectedRecords.has(r.id))}
                    ref={(el) => {
                      if (el && section.records.length > 0) {
                        const selectedCount = section.records.filter(r => selectedRecords.has(r.id)).length;
                        const someSelected = selectedCount > 0 && selectedCount < section.records.length;
                        el.indeterminate = someSelected;
                      }
                    }}
                    onChange={(e) => {
                      e.stopPropagation();
                      const allSelected = section.records.every(r => selectedRecords.has(r.id));
                      const shouldSelect = !allSelected;
                      if (onBatchRecordSelection) {
                        onBatchRecordSelection(section.records.map(r => r.id), shouldSelect);
                      } else {
                        section.records.forEach(record => onRecordSelection(record.id, shouldSelect));
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 flex-shrink-0"
                    title="选择/取消选择该分组下的所有接口"
                  />

                  <svg className={`w-3 h-3 flex-shrink-0 transition-transform ${section.isExpanded ? 'rotate-90' : ''} ${isActive ? 'text-blue-600' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {section.group ? (
                    <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                  ) : (
                    <svg className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                    </svg>
                  )}

                  {section.group && editingGroupId === section.group.id ? (
                    <div className="flex items-center space-x-1 flex-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') handleSaveEditGroup(section.group!.id);
                          else if (e.key === 'Escape') handleCancelEditGroup(e as any);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={(e) => handleSaveEditGroup(section.group!.id, e)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded flex-shrink-0"
                        title="保存"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={handleCancelEditGroup}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded flex-shrink-0"
                        title="取消"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`font-medium truncate flex-1 ${isActive ? 'text-blue-700' : section.group ? 'text-gray-700' : 'text-gray-500'}`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (section.group) handleStartEditGroup(section.group.id, section.group.name, e);
                      }}
                      title={section.group ? '双击编辑，单击展开/收起' : '单击展开/收起'}
                    >
                      {section.group ? section.group.name : '未分组'}
                    </span>
                  )}
                </div>

                {/* 右侧：激活 + 操作 */}
                <div
                  className="flex items-center justify-end space-x-2 w-1/2 hover:bg-white/50 px-3 py-2 cursor-pointer"
                  onClick={(e) => handleActivateClick(section.group?.id || null, e)}
                >
                  {section.group && (
                    <button
                      onClick={(e) => handleDeleteGroup(section.group!.id, section.group!.name, section.records.length, e)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="删除分组"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}

                  {isActive && (
                    <span className="flex items-center space-x-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span>激活分组</span>
                    </span>
                  )}

                  <span className={`text-xs px-2 py-1 rounded-full ${isActive ? 'bg-blue-200 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
                    {section.records.length}
                  </span>
                </div>
              </div>

              {/* 分组内容 */}
              {section.isExpanded && (
                <div className="bg-white">
                  {section.records.length === 0 ? (
                    <div className="px-6 py-4 text-center text-gray-500 text-sm">
                      <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      暂无接口
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {section.records.map((record) => (
                        <div key={record.id} className={`px-4 py-2 transition-colors border-l-2 ${selectedRecords.has(record.id) ? 'bg-blue-50 border-blue-400' : 'hover:bg-gray-50 border-transparent hover:border-blue-200'}`}>
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => toggleExpanded(record.id)}
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <input
                                type="checkbox"
                                checked={selectedRecords.has(record.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  onRecordSelection(record.id, e.target.checked);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                title="选择/取消选择该接口"
                              />

                              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>

                              <span className={`px-2 py-1 text-xs font-medium rounded ${getMethodClass(record.method)}`}>
                                {record.method}
                              </span>

                              <span className="text-sm text-gray-900 truncate flex-1" title={record.url}>
                                {formatUrl(record.url)}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span className={`font-medium ${getStatusClass(record.responseStatus)}`}>{record.responseStatus}</span>
                              <span>{formatResponseTime(record.responseTime)}</span>
                              <span>{formatTime(record.timestamp)}</span>
                              <svg className={`w-3 h-3 transition-transform ${expandedRecord === record.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {expandedRecord === record.id && (
                            <div className="mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <span className="text-gray-500">完整URL:</span>
                                  <div className="text-gray-900 break-all">{record.url}</div>
                                </div>
                                <div>
                                  <span className="text-gray-500">页面:</span>
                                  <div className="text-gray-900 break-all">{record.pageUrl}</div>
                                </div>
                                <div>
                                  <span className="text-gray-500">响应大小:</span>
                                  <div className="text-gray-900">{formatSize(record.responseBody)}</div>
                                </div>
                                <div>
                                  <span className="text-gray-500">请求大小:</span>
                                  <div className="text-gray-900">{formatSize(record.requestBody)}</div>
                                </div>
                              </div>

                              {record.customTags && record.customTags.length > 0 && (
                                <div>
                                  <span className="text-gray-500 text-xs">分组:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {record.customTags.map((tag, index) => (
                                      <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">{tag}</span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {Object.keys(record.headers).length > 0 && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">请求头</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {Object.entries(record.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {Object.keys(record.responseHeaders).length > 0 && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">响应头</h5>
                                  <div className="bg白 rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {Object.entries(record.responseHeaders).map(([key, value]) => `${key}: ${value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {record.requestParameters?.query && Object.keys(record.requestParameters.query).length > 0 && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">Query参数</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {Object.entries(record.requestParameters.query).map(([key, value]) => `${key}: ${value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {record.requestParameters?.path && record.requestParameters.path.length > 0 && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">Path参数</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {record.requestParameters.path.map(p => `${p.name} (${p.type}): ${p.value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {record.requestParameters?.form && Object.keys(record.requestParameters.form).length > 0 && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">Form Data</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {Object.entries(record.requestParameters.form).map(([key, value]) => `${key}: ${value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {record.requestParameters?.json && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">JSON Body</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">{JSON.stringify(record.requestParameters.json, null, 2)}</pre>
                                  </div>
                                </div>
                              )}

                              {record.requestBody && !record.requestParameters?.json && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">请求体</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {typeof record.requestBody === 'string' ? record.requestBody : JSON.stringify(record.requestBody, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {record.responseBody && (
                                <div>
                                  <h5 className="text-xs font-medium text-gray-700 mb-2">响应体</h5>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {typeof record.responseBody === 'string' ? record.responseBody : JSON.stringify(record.responseBody, null, 2)}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              <InlineReplay
                                record={record}
                                onCopyUrl={() => handleCopySuccess('URL')}
                                onCopyJson={() => handleCopySuccess('JSON')}
                                onCopy={(type) => handleCopySuccess(type)}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={deleteConfirmDialog.isOpen}
        title="删除分组"
        message={
          deleteConfirmDialog.recordCount > 0
            ? `确定要删除分组"${deleteConfirmDialog.groupName}"吗？\n\n该分组下有 ${deleteConfirmDialog.recordCount} 个接口，删除后这些接口将被移除。`
            : `确定要删除分组"${deleteConfirmDialog.groupName}"吗？`
        }
        confirmText="删除"
        cancelText="取消"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* Toast提示 */}
      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, show: false })}
        />
      )}
    </div>
  );
};

const InlineReplay: React.FC<{
  record: RequestRecord;
  onCopyUrl: () => void;
  onCopyJson: () => void;
  onCopy: (type: string) => void;
}> = ({ record, onCopyUrl, onCopyJson, onCopy }) => {
  const [show, setShow] = useState(false);
  const [headersText, setHeadersText] = useState(() => JSON.stringify(record.requestParameters?.allHeaders || record.headers || {}, null, 2));
  const [bodyText, setBodyText] = useState(() => JSON.stringify(record.requestParameters?.json ?? record.requestParameters?.form ?? record.requestBody ?? null, null, 2));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: number; headers: Record<string, string>; bodySnippet: string; duration: number; timestamp: number } | null>(null);

  // 递归渲染 JSON 为树形结构（使用原生 details/summary）
  const renderJson = (val: any, level: number = 0): JSX.Element => {
    if (val !== null && typeof val === 'object') {
      const isArray = Array.isArray(val);
      const entries = isArray ? (val as any[]).map((v: any, i: number) => [i, v]) : Object.entries(val);
      return (
        <div style={{ paddingLeft: Math.min(level, 4) * 12 }}>
          {entries.map(([k, v]: any, idx: number) => (
            <details key={idx} open={level < 1} className="mb-1">
              <summary className="cursor-pointer text-gray-700">
                <span className="font-mono">{String(k)}</span>
                {typeof v === 'object' ? (
                  <span className="text-gray-400"> {Array.isArray(v) ? '[...]' : '{...}'}</span>
                ) : (
                  <span className="text-gray-600">: {String(v)}</span>
                )}
              </summary>
              <div className="pl-2">{renderJson(v, level + 1)}</div>
            </details>
          ))}
        </div>
      );
    }
    return <span className="font-mono text-gray-700">{String(val)}</span>;
  };

  const doReplay = async () => {
    try {
      setLoading(true);
      setErr(null);
      setResult(null);
      const headers = headersText.trim() ? JSON.parse(headersText) : {};
      const body = bodyText.trim() ? JSON.parse(bodyText) : null;
      const res = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('通信超时')), 15000);
        chrome.runtime.sendMessage(
          { type: 'REPLAY_REQUEST', data: { method: record.method, url: record.url, headers, body } },
          (r) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (r?.success) resolve(r);
            else reject(new Error(r?.error || '回放失败'));
          }
        );
      });
      setResult(res.result);
    } catch (e: any) {
      setErr(e?.message || '回放出错');
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="pt-2 border-t border-gray-200">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(record.url).then(onCopyUrl).catch(() => {});
          }}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
        >
          复制URL
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(JSON.stringify(record, null, 2)).then(onCopyJson).catch(() => {});
          }}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
        >
          复制JSON
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShow((s) => !s);
          }}
          className="ml-1 px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors min-w-[88px]"
          title="编辑请求并回放"
        >
          {show ? '收起回放' : '编辑并回放'}
        </button>
      </div>

      <div className={`${show ? '' : 'hidden'} mt-3 space-y-3`}>
        <div>
          <label className="block text-xs text-gray-600 mb-1">请求头（JSON）</label>
          <textarea
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            className="w-full h-20 text-xs p-2 border rounded font-mono"
            placeholder='{"Authorization": "Bearer xxx"}'
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">请求体（JSON，可为空）</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            className="w-full h-28 text-xs p-2 border rounded font-mono"
            placeholder='{"key": "value"}'
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); doReplay(); }}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '回放中...' : '回放接口'}
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
        {result && (
          <div className="bg-white border rounded p-3">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                result.status >= 200 && result.status < 300 ? 'bg-green-100 text-green-800' :
                result.status >= 400 ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>{result.status}</span>
              <span className="text-xs text-gray-600">耗时: {result.duration}ms</span>
              <span className="text-xs text-gray-600">时间: {new Date(result.timestamp).toLocaleString()}</span>
            </div>
            <details className="mb-2">
              <summary className="text-xs text-gray-700 cursor-pointer">响应头</summary>
              <div className="mt-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join('\
');
                    navigator.clipboard.writeText(text).then(() => onCopy('响应头')).catch(() => {});
                  }}
                  className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                >
                  复制响应头
                </button>
                <div className="mt-2">
                  {Object.entries(result.headers).map(([k, v]) => (
                    <div key={k} className="flex border-b border-gray-100 py-1">
                      <span className="font-medium text-gray-700 w-1/3 text-xs">{k}:</span>
                      <span className="text-gray-600 w-2/3 text-xs break-all">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </details>
            <div>
              <div className="text-xs text-gray-700 mb-1">响应片段（最多 32KB）</div>
              {(() => {
                try {
                  const json = JSON.parse(result.bodySnippet as any);
                  return (
                    <div className="text-xs bg-gray-50 p-2 rounded">
                      {renderJson(json)}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard
                            .writeText(JSON.stringify(json, null, 2))
                            .then(() => onCopy('响应JSON'))
                            .catch(() => {});
                        }}
                        className="mt-2 px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                      >
                        复制响应JSON
                      </button>
                    </div>
                  );
                } catch {
                  return (
                    <div>
                      <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
                        {result.bodySnippet}
                      </pre>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard
                            .writeText(String(result.bodySnippet ?? ''))
                            .then(() => onCopy('响应原文'))
                            .catch(() => {});
                        }}
                        className="mt-2 px-2 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                      >
                        复制响应原文
                      </button>
                    </div>
                  );
                }
              })()}
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default GroupedRequestList;