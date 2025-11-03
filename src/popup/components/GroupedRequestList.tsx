import React, { useEffect, useState } from 'react';
import { RequestRecord, CustomTag } from '../../types';
import { GroupManager } from '../../services/GroupManager';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import JsonEditor from './JsonEditor';
import JsonViewer from './JsonViewer';

interface GroupedRequestListProps {
  records: RequestRecord[];
  loading: boolean;
  selectedRecords: Set<string>;
  onRecordSelection: (recordId: string, selected: boolean) => void;
  onBatchRecordSelection?: (recordIds: string[], selected: boolean) => void;
  onSelectAll: () => void;
  onCopyUrl?: (url: string) => void;
  showTitle?: boolean;
  refreshTrigger?: number;
  onRecordDeleted?: () => void; // 新增：记录删除后的回调
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
  onCopyUrl,
  showTitle = true,
  refreshTrigger = 0,
  onRecordDeleted,
}) => {

  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [groupSections, setGroupSections] = useState<GroupSection[]>([]);
  const [groupManager] = useState(() => GroupManager.getInstance());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  // 新增：记录标题编辑状态
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [editingRecordTitle, setEditingRecordTitle] = useState('');

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

    // 同步到 GroupManager，维持"只展开一个"策略
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
      // 先删除分组和记录
      await groupManager.deleteGroup(groupId);

      // 等待后台脚本处理删除操作
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('删除操作超时')), 10000);
        chrome.runtime.sendMessage(
          { type: 'DELETE_TAG_AND_RECORDS', data: { tagId: groupId } },
          (resp) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) resolve(); else reject(new Error(resp?.error || '删除失败'));
          }
        );
      });

      // 重新加载状态和记录数据
      await groupManager.loadState();

      // 通知父组件刷新记录数据
      if (onRecordDeleted) {
        onRecordDeleted();
      }

      setDeleteConfirmDialog({ isOpen: false, groupId: '', groupName: '', recordCount: 0 });
    } catch (e: any) {
      console.error('删除分组失败:', e);
      showToast('删除分组失败: ' + e.message, 'error');
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmDialog({ isOpen: false, groupId: '', groupName: '', recordCount: 0 });
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
  };

  const getUrlPathWithoutOrigin = (url: string) => {
    try {
      const { pathname, search, hash } = new URL(url);
      return `${pathname}${search}${hash}`;
    } catch {
      return url;
    }
  };

  const [recordDeleteConfirm, setRecordDeleteConfirm] = useState<{ isOpen: boolean; recordId: string | null; title: string }>(
    { isOpen: false, recordId: null, title: '' }
  );

  const openRecordDelete = (recordId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const target = records.find(r => r.id === recordId);
    const title = target ? getUrlPathWithoutOrigin(target.url) : '';
    setRecordDeleteConfirm({ isOpen: true, recordId, title });
  };

  const confirmRecordDelete = async () => {
    if (!recordDeleteConfirm.recordId) {
      setRecordDeleteConfirm({ isOpen: false, recordId: null, title: '' });
      return;
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('通信超时')), 10000);
        chrome.runtime.sendMessage(
          { type: 'DELETE_RECORDS', data: { recordIds: [recordDeleteConfirm.recordId] } },
          (resp) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) resolve(); else reject(new Error(resp?.error || '删除失败'));
          }
        );
      });
      // 本地移除该记录以立即反馈
      setGroupSections(prev => prev.map(section => ({
        ...section,
        records: section.records.filter(r => r.id !== recordDeleteConfirm.recordId)
      })));
      showToast('接口已删除', 'success');

      // 通知父组件记录已删除，需要更新统计信息
      if (onRecordDeleted) {
        onRecordDeleted();
      }
    } catch (e: any) {
      console.error('删除接口失败:', e);
      showToast('删除接口失败，请稍后重试', 'error');
    } finally {
      setRecordDeleteConfirm({ isOpen: false, recordId: null, title: '' });
    }
  };

  const cancelRecordDelete = () => setRecordDeleteConfirm({ isOpen: false, recordId: null, title: '' });

  const handleCopySuccess = (type: string) => showToast(`${type}已复制到剪贴板`, 'success');

  const handleSaveEditGroup = async (groupId: string, event?: React.MouseEvent | React.KeyboardEvent) => {
    if (event) event.stopPropagation();
    if (!editingGroupName.trim()) {
      showToast('分组名称不能为空', 'error');
      return;
    }
    try {
      await groupManager.updateGroup(groupId, { name: editingGroupName.trim() });
      setEditingGroupId(null);
      setEditingGroupName('');
      await groupManager.loadState();

      // 只更新分组名称，保持当前的展开状态
      setGroupSections(prevSections => {
        const newSections = groupManager.organizeRecordsByGroups(records);
        // 保持原有的展开状态
        return newSections.map(newSection => {
          const prevSection = prevSections.find(s =>
            (s.group?.id || null) === (newSection.group?.id || null)
          );
          return {
            ...newSection,
            isExpanded: prevSection ? prevSection.isExpanded : newSection.isExpanded
          };
        });
      });
    } catch (e: any) {
      console.error('更新分组失败:', e);
      showToast('更新分组失败: ' + e.message, 'error');
    }
  };

  const handleCancelEditGroup = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingGroupId(null);
    setEditingGroupName('');
  };

  // 保存记录标题
  const handleSaveRecordTitle = async (recordId: string) => {
    if (!editingRecordTitle.trim()) {
      // 如果标题为空，视为删除自定义标题
      setEditingRecordId(null);
      setEditingRecordTitle('');
      return;
    }

    try {
      // 发送消息到background script更新记录
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('通信超时')), 10000);
        chrome.runtime.sendMessage(
          { type: 'UPDATE_RECORD_TITLE', data: { recordId, customTitle: editingRecordTitle.trim() } },
          (resp) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (resp?.success) resolve(); else reject(new Error(resp?.error || '更新失败'));
          }
        );
      });

      // 本地更新状态以立即反馈
      setGroupSections(prev => prev.map(section => ({
        ...section,
        records: section.records.map(record =>
          record.id === recordId ? { ...record, customTitle: editingRecordTitle.trim() } : record
        )
      })));

      setEditingRecordId(null);
      setEditingRecordTitle('');
      showToast('标题已更新', 'success');

      // 通知父组件刷新数据，确保导出和同步时能获取到最新的标题
      if (onRecordDeleted) {
        onRecordDeleted();
      }
    } catch (e: any) {
      console.error('更新标题失败:', e);
      showToast('更新标题失败: ' + e.message, 'error');
    }
  };

  // 取消编辑记录标题
  const handleCancelEditRecordTitle = () => {
    setEditingRecordId(null);
    setEditingRecordTitle('');
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
                  className="flex items-center space-x-2 w-1/2 hover:bg-white/50 px-3 py-2"
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
                    <div className="flex items-center flex-1">
                      {/* 标题文字区域，只响应双击编辑 */}
                      <span
                        className={`font-medium truncate ${isActive ? 'text-blue-700' : section.group ? 'text-gray-700' : 'text-gray-500'}`}
                        style={{ maxWidth: 'calc(100% - 80px)' }} // 预留空间给非文本区域
                        onClick={(e) => {
                          // 阻止单击事件冒泡到父容器，避免触发展开/折叠
                          e.stopPropagation();
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (section.group) {
                            setEditingGroupId(section.group.id);
                            setEditingGroupName(section.group.name);
                          }
                        }}
                        title={section.group ? '双击编辑分组名称' : '未分组'}
                      >
                        {section.group ? section.group.name : '未分组'}
                      </span>

                      {/* 右侧空白区域，点击触发展开/折叠 */}
                      <div
                        className="flex-1 cursor-pointer h-full"
                        onClick={(e) => {
                          if (editingGroupId === section.group?.id) return;
                          handleExpandClick(section.group?.id || null, e);
                        }}
                        title="单击展开/收起"
                      />
                    </div>
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

                              <button
                                type="button"
                                className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onCopyUrl) {
                                    onCopyUrl(record.url);
                                  } else {
                                    navigator.clipboard.writeText(record.url)
                                      .then(() => showToast('完整URL已复制', 'success'))
                                      .catch(() => showToast('复制失败', 'error'));
                                  }
                                }}
                                title="复制完整URL"
                              >
                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              </button>

                              <span className={`px-2 py-1 text-xs font-medium rounded ${getMethodClass(record.method)}`}>
                                {record.method}
                              </span>

                              {/* 修改标题显示部分 */}
                              <div className="flex items-center flex-1 min-w-0">
                                {editingRecordId === record.id ? (
                                  <div className="flex items-center space-x-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="text"
                                      value={editingRecordTitle}
                                      onChange={(e) => setEditingRecordTitle(e.target.value)}
                                      onKeyDown={(e) => {
                                        e.stopPropagation();
                                        if (e.key === 'Enter') handleSaveRecordTitle(record.id);
                                        else if (e.key === 'Escape') handleCancelEditRecordTitle();
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="flex-1 px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      autoFocus
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSaveRecordTitle(record.id); }}
                                      className="p-1 text-green-600 hover:bg-green-50 rounded flex-shrink-0"
                                      title="保存"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleCancelEditRecordTitle(); }}
                                      className="p-1 text-gray-600 hover:bg-gray-100 rounded flex-shrink-0"
                                      title="取消"
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                      </svg>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center flex-1">
                                    {/* 标题文字区域，只响应双击编辑 */}
                                    <span
                                      className="text-sm text-gray-900 truncate"
                                      style={{ maxWidth: 'calc(100% - 60px)' }} // 预留空间给非文本区域
                                      onClick={(e) => {
                                        // 阻止单击事件冒泡到父容器，避免触发展开/折叠
                                        e.stopPropagation();
                                      }}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        setEditingRecordId(record.id);
                                        setEditingRecordTitle(record.customTitle || formatUrl(record.url));
                                      }}
                                      title="双击编辑接口标题"
                                    >
                                      {record.customTitle || formatUrl(record.url)}
                                    </span>

                                    {/* 右侧空白区域，点击触发展开/折叠 */}
                                    <div
                                      className="flex-1 cursor-pointer h-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // 点击空白区域触发折叠/展开
                                        toggleExpanded(record.id);
                                      }}
                                      title="单击展开/收起详情"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span className={`font-medium ${getStatusClass(record.responseStatus)}`}>{record.responseStatus}</span>
                              <span>{formatResponseTime(record.responseTime)}</span>
                              <span>{formatTime(record.timestamp)}</span>
                              <button
                                type="button"
                                className="flex items-center px-2 py-1 text-xs text-red-600 hover:text-red-800 transition-colors opacity-0 group-hover:opacity-100"
                                onClick={(e) => openRecordDelete(record.id, e)}
                                title="删除接口"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                  <path d="M15 6V4a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
                                </svg>
                              </button>
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
                                  <span className="text-gray-500">请求大小:</span>
                                  <div className="text-gray-900">{formatSize(record.requestBody)}</div>
                                </div>
                                <div>
                                  <span className="text-gray-500 text-xs">分组:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                      {section.group ? section.group.name : '未分组'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {record.responseBody && (
                                <div>
                                  <span className="text-gray-500">响应大小:</span>
                                  <div className="text-gray-900">{formatSize(record.responseBody)}</div>
                                </div>
                              )}

                              {Object.keys(record.headers).length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-xs font-medium text-gray-700">请求头</h5>
                                    <button
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const text = Object.entries(record.headers).map(([k, v]) => `${k}: ${v}`).join('\n');
                                        navigator.clipboard.writeText(text).then(() => showToast('请求头已复制', 'success')).catch(() => showToast('复制失败', 'error'));
                                      }}
                                    >
                                      复制请求头
                                    </button>
                                  </div>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                                    <pre className="text-xs text-gray-600">
                                      {Object.entries(record.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {Object.keys(record.responseHeaders).length > 0 && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-xs font-medium text-gray-700">响应头</h5>
                                    <button
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const text = Object.entries(record.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n');
                                        navigator.clipboard.writeText(text).then(() => showToast('响应头已复制', 'success')).catch(() => showToast('复制失败', 'error'));
                                      }}
                                    >
                                      复制响应头
                                    </button>
                                  </div>
                                  <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
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
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-xs font-medium text-gray-700">JSON Body</h5>
                                    <button
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const text = JSON.stringify(record.requestParameters!.json, null, 2);
                                        navigator.clipboard.writeText(text).then(() => showToast('请求体已复制', 'success')).catch(() => showToast('复制失败', 'error'));
                                      }}
                                    >
                                      复制请求体
                                    </button>
                                  </div>
                                  <JsonViewer
                                    value={JSON.stringify(record.requestParameters.json, null, 2)}
                                    placeholder="无请求体"
                                    instanceId={`request-json-${record.id}`}
                                  />
                                </div>
                              )}

                              {record.requestBody && !record.requestParameters?.json && (
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <h5 className="text-xs font-medium text-gray-700">请求体</h5>
                                    <button
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const text = typeof record.requestBody === 'string' ? record.requestBody : JSON.stringify(record.requestBody, null, 2);
                                        navigator.clipboard.writeText(text).then(() => showToast('请求体已复制', 'success')).catch(() => showToast('复制失败', 'error'));
                                      }}
                                    >
                                      复制请求体
                                    </button>
                                  </div>
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
                                  <JsonViewer
                                    value={typeof record.responseBody === 'string' ? record.responseBody : JSON.stringify(record.responseBody, null, 2)}
                                    placeholder="无响应体"
                                    instanceId={`response-body-${record.id}`}
                                  />
                                </div>
                              )}

                              <InlineReplay
                                record={record}
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

      {/* 删除分组确认对话框 */}
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

      {/* 删除接口确认对话框 */}
      <ConfirmDialog
        isOpen={recordDeleteConfirm.isOpen}
        title="删除接口"
        message={`确定要删除接口：\n${recordDeleteConfirm.title}`}
        confirmText="删除"
        cancelText="取消"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        onConfirm={confirmRecordDelete}
        onCancel={cancelRecordDelete}
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
  onCopyJson: () => void;
  onCopy: (type: string) => void;
}> = ({ record, onCopyJson, onCopy }) => {
  const [show, setShow] = useState(false);

  // 判断请求体类型
  const bodyType = record.requestParameters?.json ? 'json'
    : record.requestParameters?.form ? 'form'
      : record.requestBody ? 'raw'
        : 'none';

  // Query 参数（key-value 格式）
  const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>(() => {
    const query = record.requestParameters?.query || {};
    return Object.entries(query).map(([key, value]) => ({ key, value: String(value) }));
  });

  // Headers（key-value 格式）
  const [headerParams, setHeaderParams] = useState<Array<{ key: string; value: string }>>(() => {
    const headers = record.requestParameters?.allHeaders || record.headers || {};
    return Object.entries(headers).map(([key, value]) => ({ key, value: String(value) }));
  });

  // Body - JSON 格式
  const [bodyJsonText, setBodyJsonText] = useState(() => {
    if (bodyType === 'json') {
      return JSON.stringify(record.requestParameters?.json, null, 2);
    }
    return '{}';
  });

  // Body - Form 格式（key-value）
  const [bodyFormParams, setBodyFormParams] = useState<Array<{ key: string; value: string }>>(() => {
    if (bodyType === 'form') {
      const form = record.requestParameters?.form || {};
      return Object.entries(form).map(([key, value]) => ({ key, value: String(value) }));
    }
    return [];
  });

  // Body - Raw 格式
  const [bodyRawText, setBodyRawText] = useState(() => {
    if (bodyType === 'raw') {
      return typeof record.requestBody === 'string' ? record.requestBody : JSON.stringify(record.requestBody, null, 2);
    }
    return '';
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: number; headers: Record<string, string>; bodySnippet: string; duration: number; timestamp: number } | null>(null);

  const doReplay = async () => {
    try {
      setLoading(true);
      setErr(null);
      setResult(null);

      // 构建请求头（从 key-value 转为对象）
      const headers: Record<string, string> = {};
      headerParams.forEach(({ key, value }) => {
        if (key.trim()) headers[key.trim()] = value;
      });

      // 构建请求体
      let body: any = null;
      if (bodyType === 'json') {
        body = bodyJsonText.trim() ? JSON.parse(bodyJsonText) : null;
      } else if (bodyType === 'form') {
        body = {};
        bodyFormParams.forEach(({ key, value }) => {
          if (key.trim()) body[key.trim()] = value;
        });
      } else if (bodyType === 'raw') {
        body = bodyRawText.trim() || null;
      }

      // 重建 URL（添加 query 参数）
      let finalUrl = record.url;
      try {
        const urlObj = new URL(record.url);
        // 清空原有 query 参数
        urlObj.search = '';
        // 添加编辑后的 query 参数
        queryParams.forEach(({ key, value }) => {
          if (key.trim()) {
            urlObj.searchParams.append(key.trim(), value);
          }
        });
        finalUrl = urlObj.toString();
      } catch (e) {
        console.error('URL 解析失败，使用原始 URL:', e);
      }

      const res = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('通信超时')), 15000);
        chrome.runtime.sendMessage(
          { type: 'REPLAY_REQUEST', data: { method: record.method, url: finalUrl, headers, body } },
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
      <div className="flex items-center justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShow((s) => !s);
          }}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors min-w-[88px]"
          title="编辑请求并回放"
        >
          {show ? '收起回放' : '编辑并回放'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(JSON.stringify(record, null, 2)).then(onCopyJson).catch(() => { });
          }}
          className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
        >
          复制JSON
        </button>
      </div>

      <div className={`${show ? '' : 'hidden'} mt-3 space-y-3`}>
        {/* Query 参数 */}
        {queryParams.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-600">Query 参数</label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setQueryParams([...queryParams, { key: '', value: '' }]);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                + 添加
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
              {queryParams.map((param, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => {
                      const newParams = [...queryParams];
                      newParams[idx].key = e.target.value;
                      setQueryParams(newParams);
                    }}
                    placeholder="key"
                    className="flex-1 px-2 py-1 text-xs border rounded"
                  />
                  <input
                    type="text"
                    value={param.value}
                    onChange={(e) => {
                      const newParams = [...queryParams];
                      newParams[idx].value = e.target.value;
                      setQueryParams(newParams);
                    }}
                    placeholder="value"
                    className="flex-1 px-2 py-1 text-xs border rounded"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setQueryParams(queryParams.filter((_, i) => i !== idx));
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Headers */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-600">请求头</label>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHeaderParams([...headerParams, { key: '', value: '' }]);
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              + 添加
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
            {headerParams.map((param, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <input
                  type="text"
                  value={param.key}
                  onChange={(e) => {
                    const newParams = [...headerParams];
                    newParams[idx].key = e.target.value;
                    setHeaderParams(newParams);
                  }}
                  placeholder="key"
                  className="flex-1 px-2 py-1 text-xs border rounded"
                />
                <input
                  type="text"
                  value={param.value}
                  onChange={(e) => {
                    const newParams = [...headerParams];
                    newParams[idx].value = e.target.value;
                    setHeaderParams(newParams);
                  }}
                  placeholder="value"
                  className="flex-1 px-2 py-1 text-xs border rounded"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setHeaderParams(headerParams.filter((_, i) => i !== idx));
                  }}
                  className="text-red-600 hover:text-red-800"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Body - JSON 格式 */}
        {bodyType === 'json' && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">请求体（JSON）</label>
            <JsonEditor
              value={bodyJsonText}
              onChange={setBodyJsonText}
              placeholder='{"key": "value"}'
              instanceId="replay-json-body"
            />
          </div>
        )}

        {/* Body - Form 格式 */}
        {bodyType === 'form' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-gray-600">请求体（Form Data）</label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBodyFormParams([...bodyFormParams, { key: '', value: '' }]);
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                + 添加
              </button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2 bg-gray-50">
              {bodyFormParams.map((param, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={param.key}
                    onChange={(e) => {
                      const newParams = [...bodyFormParams];
                      newParams[idx].key = e.target.value;
                      setBodyFormParams(newParams);
                    }}
                    placeholder="key"
                    className="flex-1 px-2 py-1 text-xs border rounded"
                  />
                  <input
                    type="text"
                    value={param.value}
                    onChange={(e) => {
                      const newParams = [...bodyFormParams];
                      newParams[idx].value = e.target.value;
                      setBodyFormParams(newParams);
                    }}
                    placeholder="value"
                    className="flex-1 px-2 py-1 text-xs border rounded"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBodyFormParams(bodyFormParams.filter((_, i) => i !== idx));
                    }}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Body - Raw 格式 */}
        {bodyType === 'raw' && (
          <div>
            <label className="block text-xs text-gray-600 mb-1">请求体（Raw）</label>
            <textarea
              value={bodyRawText}
              onChange={(e) => setBodyRawText(e.target.value)}
              className="w-full h-28 text-xs p-2 border rounded font-mono"
              placeholder="Raw body content"
            />
          </div>
        )}
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
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${result.status >= 200 && result.status < 300 ? 'bg-green-100 text-green-800' :
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
                    navigator.clipboard.writeText(text).then(() => onCopy('响应头')).catch(() => { });
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
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-700">响应片段（最多 32KB）</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const text = typeof result.bodySnippet === 'string' 
                      ? result.bodySnippet 
                      : JSON.stringify(result.bodySnippet, null, 2);
                    navigator.clipboard
                      .writeText(text)
                      .then(() => onCopy('响应体'))
                      .catch(() => { });
                  }}
                  className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                >
                  复制响应体
                </button>
              </div>
              <JsonViewer
                value={typeof result.bodySnippet === 'string' 
                  ? result.bodySnippet 
                  : JSON.stringify(result.bodySnippet, null, 2)}
                placeholder="无响应体"
                instanceId={`replay-response-${record.id}`}
              />
            </div>

          </div>
        )}
      </div>
    </div>
  );
};

export default GroupedRequestList;