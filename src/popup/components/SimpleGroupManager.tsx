import React, { useState, useEffect, useRef } from 'react';
import { CustomTag } from '../../types';

interface SimpleGroupManagerProps {
  onGroupChange?: (groupId: string | null) => void;
}

const SimpleGroupManager: React.FC<SimpleGroupManagerProps> = ({ onGroupChange }) => {
  const [customTags, setCustomTags] = useState<CustomTag[]>([]);
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  // 正在切换的激活分组（用于抵御并发/回写为null的竞态），记录名称用于渲染兜底
  const pendingActiveRef = useRef<{ id: string; name?: string; expire: number } | null>(null);

  // 预定义的标签颜色
  const tagColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
  ];

  useEffect(() => {
    loadCustomTags();
    loadActiveTag();
  }, []);

  // 监听 chrome.storage 的变化，实时更新激活分组（并在边界态主动拉齐）
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('Not running in Chrome extension environment');
      return;
    }
    
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.activeGroupId) {
        const newActiveGroupId = changes.activeGroupId.newValue as string | null;
        const now = Date.now();
        const pending = pendingActiveRef.current;

        // 若回写为 null 但本地存在未过期的 pending 激活，忽略本次回写，避免回退“未分组”
        if (newActiveGroupId === null && pending && pending.expire > now) {
          // 忽略
        } else {
          setActiveTagId(newActiveGroupId);
          // 如果是我们期望的激活 id，清除 pending
          if (pending && newActiveGroupId && pending.id === newActiveGroupId) {
            pendingActiveRef.current = null;
          }
        }

        // 若切到具体分组但本地列表未包含该分组，主动拉取后台与列表，避免渲染成“未分组”
        if (newActiveGroupId) {
          chrome.runtime?.sendMessage({ type: 'GET_ACTIVE_TAG' }).then((resp: any) => {
            if (resp?.success && resp.activeTag) {
              const exists = customTags.some(t => t.id === resp.activeTag.id);
              if (!exists) {
                loadCustomTags();
              }
            }
          }).catch(() => {});
        }
      }
      if (changes.customTags) {
        const newTags = changes.customTags.newValue as CustomTag[] | undefined;
        if (newTags) {
          const sortedTags = newTags.sort((a: CustomTag, b: CustomTag) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            return orderA - orderB;
          });
          setCustomTags(sortedTags);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [customTags, activeTagId]);

  const loadCustomTags = async () => {
    try {
      console.log('loadCustomTags 被调用');
      
      // 检查是否在Chrome扩展环境中
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Not running in Chrome extension environment');
        return;
      }
      
      const result = await chrome.storage.local.get(['customTags']);
      console.log('从 chrome.storage.local 读取的数据:', result);
      
      if (result.customTags) {
        console.log('找到 customTags，数量:', result.customTags.length);
        // 按 order 排序，order 值小的在前面（新分组在最上面）
        const sortedTags = result.customTags.sort((a: CustomTag, b: CustomTag) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          return orderA - orderB;
        });
        setCustomTags(sortedTags);
        console.log('已设置 customTags，数量:', sortedTags.length);
      } else {
        console.log('未找到 customTags');
      }
    } catch (error) {
      console.error('Failed to load custom tags:', error);
    }
  };

  const loadActiveTag = async () => {
    try {
      // 检查是否在Chrome扩展环境中
      if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.warn('Not running in Chrome extension environment');
        return;
      }
      
      const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAG' });
      const pending = pendingActiveRef.current;
      if (response.success && response.activeTag) {
        setActiveTagId(response.activeTag.id);
        // 命中预期激活则清理 pending
        if (pending && response.activeTag.id === pending.id) {
          pendingActiveRef.current = null;
        }
      } else if (pending && pending.expire > Date.now()) {
        // 返回为空但仍在保护期，忽略，避免回退“未分组”
      }
    } catch (error) {
      console.error('Failed to load active tag:', error);
    }
  };



  const createTag = async () => {
    if (!newTagName.trim() || isCreating) {
      console.log('创建分组被阻止:', { newTagName: newTagName.trim(), isCreating });
      return;
    }

    console.log('开始创建分组:', newTagName.trim());
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

      console.log('新分组对象:', newTag);
      console.log('当前分组列表:', customTags);

      const updatedTags = [newTag, ...customTags]; // 新分组放在数组开头
      console.log('更新后的分组列表:', updatedTags);
      
      // 统一通过 APPLY_ACTIVE_GROUP 原子应用：激活+互斥展开
      const appliedTags = updatedTags.map(t => ({
        ...t,
        isActive: t.id === newTag.id,
        isExpanded: t.id === newTag.id
      }));
      await chrome.runtime?.sendMessage({
        type: 'APPLY_ACTIVE_GROUP',
        data: { activeGroupId: newTag.id, customTags: appliedTags }
      });
      setActiveTagId(newTag.id);
      setCustomTags(appliedTags);
      setNewTagName('');
      setShowCreateForm(false);
      console.log('新分组已激活并展开（原子应用）');
      
      // 通知父组件分组已变化
      console.log('通知父组件分组变化');
      onGroupChange?.(newTag.id);
      console.log('分组创建完成');
    } catch (error) {
      console.error('Failed to create tag:', error);
    } finally {
      setIsCreating(false);
    }
  };



  const activeTag = customTags.find(tag => tag.id === activeTagId);

  return (
    <div className="flex items-center space-x-3">
      {/* 当前激活的分组显示 - 只读，不可操作（以 activeTagId 是否为 null 为准） */}
      {/* 渲染优先级：
          1) activeTagId !== null -> 显示对应分组
          2) activeTagId === null 且存在未过期 pending -> 显示 pending.name
          3) 其他 -> 显示“未分组”
        */}
      {activeTagId !== null ? (
        <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: activeTag?.color || '#3B82F6' }}
          />
          <span className="text-sm font-semibold text-blue-700">
            {activeTag?.name || '加载中...'}
          </span>
        </div>
      ) : (() => {
        const pending = pendingActiveRef.current;
        const now = Date.now();
        const showPending = pending && pending.expire > now && pending.name;
        return (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
            <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-semibold text-blue-700">
              {showPending ? pending!.name : '未分组'}
            </span>
          </div>
        );
      })()}

      {/* 添加分组按钮 */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          title="添加新分组"
        >
          <svg className="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          添加分组
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                createTag();
              } else if (e.key === 'Escape') {
                setShowCreateForm(false);
                setNewTagName('');
              }
            }}
            placeholder="分组名称"
            className="text-sm border border-gray-300 rounded px-2 py-1 w-24"
            disabled={isCreating}
            autoFocus
          />
          <button
            onClick={createTag}
            disabled={!newTagName.trim() || isCreating}
            className="px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
          >
            {isCreating ? '...' : '确定'}
          </button>
          <button
            onClick={() => {
              setShowCreateForm(false);
              setNewTagName('');
            }}
            className="px-2 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
};

export default SimpleGroupManager;