import React, { useState, useEffect } from 'react';
import DeleteConfirm from './DeleteConfirm';
import Toast from './Toast';

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  instanceId?: string; // 组件实例 ID，用于避免多个实例之间的冲突
}

interface JsonNode {
  key: string;
  value: any;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  path: string;
  level: number;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ value, onChange, placeholder, className, instanceId = 'default' }) => {
  const [jsonData, setJsonData] = useState<any>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [editingKeyPath, setEditingKeyPath] = useState<string | null>(null);
  const [editingKeyValue, setEditingKeyValue] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; path: string; key: string }>({
    isOpen: false,
    path: '',
    key: '',
  });
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'info',
  });
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; key: string; value: any; matchType: 'key' | 'value' }>>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  const isInternalUpdateRef = React.useRef(false);

  // 显示提示
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
  };

  // 全局快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F3 或 Ctrl+G: 查找下一个
      if ((e.key === 'F3' || (e.ctrlKey && e.key === 'g')) && searchResults.length > 0) {
        e.preventDefault();
        if (e.shiftKey) {
          handlePrevResult();
        } else {
          handleNextResult();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, currentResultIndex]);

  // 查找功能
  const handleSearch = () => {
    if (!searchText.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(0);
      return;
    }

    const results: Array<{ path: string; key: string; value: any; matchType: 'key' | 'value' }> = [];
    const searchLower = searchText.toLowerCase();

    const searchInObject = (obj: any, parentPath = '') => {
      if (obj === null || typeof obj !== 'object') return;

      const entries = Array.isArray(obj) ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);

      entries.forEach(([key, value]) => {
        const path = parentPath ? `${parentPath}.${key}` : key;

        // 搜索键名
        if (key.toLowerCase().includes(searchLower)) {
          results.push({ path, key, value, matchType: 'key' });
        }

        // 搜索值（基本类型）
        if (value !== null && typeof value !== 'object') {
          const valueStr = String(value).toLowerCase();
          if (valueStr.includes(searchLower)) {
            results.push({ path, key, value, matchType: 'value' });
          }
        }

        // 递归搜索
        if (value !== null && typeof value === 'object') {
          searchInObject(value, path);
        }
      });
    };

    searchInObject(jsonData);
    setSearchResults(results);
    setCurrentResultIndex(0);

    if (results.length === 0) {
      showToast('未找到匹配项', 'info');
    } else {
      showToast(`找到 ${results.length} 个匹配项`, 'success');
      // 自动展开第一个匹配项的路径
      if (results.length > 0) {
        expandToPath(results[0].path);
        scrollToMatch(results[0].path);
      }
    }
  };

  // 展开到指定路径
  const expandToPath = (targetPath: string) => {
    const newExpanded = new Set(expandedPaths);
    const parts = targetPath.split('.');
    
    // 展开所有父路径
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('.');
      newExpanded.add(path);
    }
    
    setExpandedPaths(newExpanded);
  };

  // 滚动到匹配项
  const scrollToMatch = (path: string) => {
    // 等待 DOM 更新后再滚动
    setTimeout(() => {
      // 使用实例 ID 和 data-path 属性查找元素，避免多个实例冲突
      const element = document.querySelector(`[data-instance="${instanceId}"][data-path="${path}"]`);
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }, 100);
  };

  // 上一个匹配项
  const handlePrevResult = () => {
    if (searchResults.length === 0) return;
    const newIndex = currentResultIndex > 0 ? currentResultIndex - 1 : searchResults.length - 1;
    setCurrentResultIndex(newIndex);
    expandToPath(searchResults[newIndex].path);
    scrollToMatch(searchResults[newIndex].path);
  };

  // 下一个匹配项
  const handleNextResult = () => {
    if (searchResults.length === 0) return;
    const newIndex = currentResultIndex < searchResults.length - 1 ? currentResultIndex + 1 : 0;
    setCurrentResultIndex(newIndex);
    expandToPath(searchResults[newIndex].path);
    scrollToMatch(searchResults[newIndex].path);
  };

  // 替换当前匹配项
  const handleReplaceOne = () => {
    if (searchResults.length === 0 || !searchText.trim()) {
      showToast('请先执行查找', 'info');
      return;
    }

    const result = searchResults[currentResultIndex];
    const newData = JSON.parse(JSON.stringify(jsonData));
    const keys = result.path.split('.');
    
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    const lastKey = keys[keys.length - 1];
    let replaced = false;

    if (result.matchType === 'key') {
      // 替换键名，保持键的顺序
      const newKey = result.key.replace(new RegExp(searchText, 'gi'), replaceText);
      if (newKey !== result.key && !current.hasOwnProperty(newKey)) {
        // 保持键的顺序
        const entries = Object.entries(current);
        const newEntries = entries.map(([k, v]) => 
          k === lastKey ? [newKey, v] : [k, v]
        );
        
        // 清空对象
        Object.keys(current).forEach(k => delete (current as any)[k]);
        
        // 按原顺序重新添加
        newEntries.forEach(([k, v]) => {
          (current as any)[k as string] = v;
        });
        
        replaced = true;
      }
    } else {
      // 替换值
      const oldValue = String(current[lastKey]);
      const newValue = oldValue.replace(new RegExp(searchText, 'gi'), replaceText);
      if (newValue !== oldValue) {
        current[lastKey] = newValue;
        replaced = true;
      }
    }

    if (replaced) {
      updateData(newData);
      showToast('已替换 1 处', 'success');
      // 重新搜索并移动到下一个
      setTimeout(() => {
        handleSearch();
      }, 100);
    } else {
      showToast('无法替换该项', 'error');
    }
  };

  // 替换全部
  const handleReplaceAll = () => {
    if (!searchText.trim() || searchResults.length === 0) {
      showToast('请先执行查找', 'info');
      return;
    }

    const newData = JSON.parse(JSON.stringify(jsonData));
    let replaceCount = 0;

    // 按对象分组，收集需要替换的键名
    const keyReplacements = new Map<any, Map<string, string>>();

    searchResults.forEach(result => {
      const keys = result.path.split('.');
      let current = newData;

      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }

      const lastKey = keys[keys.length - 1];

      if (result.matchType === 'key') {
        // 收集键名替换
        const newKey = result.key.replace(new RegExp(searchText, 'gi'), replaceText);
        if (newKey !== result.key && !current.hasOwnProperty(newKey)) {
          if (!keyReplacements.has(current)) {
            keyReplacements.set(current, new Map());
          }
          keyReplacements.get(current)!.set(lastKey, newKey);
        }
      } else {
        // 直接替换值
        const oldValue = String(current[lastKey]);
        const newValue = oldValue.replace(new RegExp(searchText, 'gi'), replaceText);
        if (newValue !== oldValue) {
          current[lastKey] = newValue;
          replaceCount++;
        }
      }
    });

    // 批量替换键名，保持顺序
    keyReplacements.forEach((replacements, obj) => {
      const entries = Object.entries(obj);
      const newEntries = entries.map(([k, v]) => {
        const newKey = replacements.get(k);
        if (newKey) {
          replaceCount++;
          return [newKey, v];
        }
        return [k, v];
      });

      // 清空对象
      Object.keys(obj).forEach(k => delete (obj as any)[k]);

      // 按原顺序重新添加
      newEntries.forEach(([k, v]) => {
        (obj as any)[k as string] = v;
      });
    });

    if (replaceCount > 0) {
      updateData(newData);
      showToast(`已替换 ${replaceCount} 处`, 'success');
      // 重新搜索
      setTimeout(() => handleSearch(), 100);
    } else {
      showToast('没有可替换的内容', 'info');
    }
  };

  // 初始化数据
  useEffect(() => {
    // 如果是内部更新，跳过重新初始化
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false;
      return;
    }

    // 外部更新，重新初始化
    try {
      const parsed = JSON.parse(value || '{}');
      setJsonData(parsed);
      setParseError(null);
      
      // 初始化时展开第一层
      const firstLevelPaths = new Set<string>();
      if (typeof parsed === 'object' && parsed !== null) {
        Object.keys(parsed).forEach(key => {
          if (typeof parsed[key] === 'object' && parsed[key] !== null) {
            firstLevelPaths.add(key);
          }
        });
      }
      setExpandedPaths(firstLevelPaths);
    } catch (e: any) {
      setParseError(e.message);
    }
  }, [value]);

  // 内部更新数据（不触发重新初始化）
  const updateData = (newData: any) => {
    setJsonData(newData);
    isInternalUpdateRef.current = true;
    onChange(JSON.stringify(newData, null, 2));
  };

  // 解析 JSON 为树形结构
  const parseJsonToTree = (obj: any, parentPath = '', level = 0): JsonNode[] => {
    const result: JsonNode[] = [];

    if (obj === null || typeof obj !== 'object') {
      return [];
    }

    const isArray = Array.isArray(obj);
    const entries = isArray ? obj.map((v, i) => [String(i), v]) : Object.entries(obj);

    entries.forEach(([key, val]) => {
      const path = parentPath ? `${parentPath}.${key}` : key;
      const type = val === null ? 'null'
        : Array.isArray(val) ? 'array'
        : typeof val === 'object' ? 'object'
        : typeof val as any;

      const node: JsonNode = {
        key,
        value: val,
        type,
        path,
        level,
      };

      result.push(node);

      // 如果是对象或数组且已展开，递归添加子节点
      if ((type === 'object' || type === 'array') && expandedPaths.has(path)) {
        result.push(...parseJsonToTree(val, path, level + 1));
      }
    });

    return result;
  };

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const expandAll = () => {
    const allPaths = new Set<string>();
    const collectPaths = (obj: any, parentPath = '') => {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(key => {
          const path = parentPath ? `${parentPath}.${key}` : key;
          allPaths.add(path);
          collectPaths(obj[key], path);
        });
      }
    };
    collectPaths(jsonData);
    setExpandedPaths(allPaths);
  };

  const collapseAll = () => {
    setExpandedPaths(new Set());
  };

  const startEdit = (node: JsonNode) => {
    if (node.type === 'object' || node.type === 'array') return;
    setEditingPath(node.path);
    setEditingValue(node.type === 'string' ? node.value : String(node.value));
  };

  // 开始编辑（同时编辑 key 和 value）
  const startEditBoth = (node: JsonNode) => {
    // 检查是否可以编辑键名
    const keys = node.path.split('.');
    let canEditKey = false;
    
    if (keys.length > 1) {
      const parentPath = keys.slice(0, -1).join('.');
      const parentKeys = parentPath.split('.');
      let parent = jsonData;
      for (const k of parentKeys) {
        parent = parent[k];
      }
      canEditKey = !Array.isArray(parent);
    } else {
      canEditKey = !Array.isArray(jsonData);
    }

    if (canEditKey) {
      setEditingKeyPath(node.path);
      setEditingKeyValue(node.key);
    }

    if (node.type !== 'object' && node.type !== 'array') {
      setEditingPath(node.path);
      setEditingValue(node.type === 'string' ? node.value : String(node.value));
    }
  };

  // 智能类型推断函数
  const parseValueByFormat = (input: string): any => {
    const trimmed = input.trim();
    
    // 空字符串
    if (trimmed === '') {
      return '';
    }
    
    // null
    if (trimmed === 'null') {
      return null;
    }
    
    // boolean
    if (trimmed === 'true') {
      return true;
    }
    if (trimmed === 'false') {
      return false;
    }
    
    // 数字（不带引号）
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }
    
    // 尝试解析 JSON（对象、数组、带引号的字符串等）
    try {
      const parsed = JSON.parse(trimmed);
      return parsed;
    } catch {
      // 解析失败，作为普通字符串处理
      return trimmed;
    }
  };

  const saveEdit = (node: JsonNode) => {
    let success = true;
    const keys = node.path.split('.');
    const newData = JSON.parse(JSON.stringify(jsonData));

    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    const oldKey = node.key;
    let finalKey = oldKey;

    // 保存键名
    if (editingKeyPath === node.path) {
      const newKey = editingKeyValue.trim();
      if (newKey && newKey !== oldKey) {
        if (typeof current === 'object' && !Array.isArray(current)) {
          if (current.hasOwnProperty(newKey) && newKey !== oldKey) {
            showToast('该字段名已存在', 'error');
            success = false;
          } else {
            // 重命名键，保持键的顺序
            const entries = Object.entries(current);
            const newEntries = entries.map(([k, v]) => 
              k === oldKey ? [newKey, v] : [k, v]
            );
            
            // 清空对象
            Object.keys(current).forEach(k => delete (current as any)[k]);
            
            // 按原顺序重新添加
            newEntries.forEach(([k, v]) => {
              (current as any)[k as string] = v;
            });
            
            finalKey = newKey;
          }
        }
      }
    }

    // 保存值
    if (success && editingPath === node.path) {
      let parsedValue: any = editingValue;
      
      // 判断是否是新增字段的首次赋值（原值为空字符串）
      const isNewField = node.value === '' && node.type === 'string';
      
      if (isNewField) {
        // 新增字段首次赋值：智能类型推断
        parsedValue = parseValueByFormat(editingValue);
      } else {
        // 二次编辑：根据原始类型转换值
        if (node.type === 'number') {
          parsedValue = Number(editingValue);
          if (isNaN(parsedValue)) {
            showToast('请输入有效的数字', 'error');
            success = false;
          }
        } else if (node.type === 'boolean') {
          parsedValue = editingValue === 'true';
        } else if (node.type === 'null') {
          parsedValue = null;
        }
        // string 类型保持原样
      }
      
      if (success) {
        // 使用最终的键名来设置值
        current[finalKey] = parsedValue;
      }
    }

    if (success) {
      // 如果键名改变了，更新展开路径
      if (finalKey !== oldKey) {
        const newExpandedPaths = new Set<string>();
        expandedPaths.forEach(path => {
          // 如果路径包含旧键名，替换为新键名
          if (path === node.path) {
            // 当前节点的路径
            const parentPath = keys.slice(0, -1).join('.');
            const newPath = parentPath ? `${parentPath}.${finalKey}` : finalKey;
            newExpandedPaths.add(newPath);
          } else if (path.startsWith(node.path + '.')) {
            // 子节点的路径
            const parentPath = keys.slice(0, -1).join('.');
            const newNodePath = parentPath ? `${parentPath}.${finalKey}` : finalKey;
            const suffix = path.substring(node.path.length);
            newExpandedPaths.add(newNodePath + suffix);
          } else {
            newExpandedPaths.add(path);
          }
        });
        setExpandedPaths(newExpandedPaths);
      }

      updateData(newData);
      setEditingPath(null);
      setEditingValue('');
      setEditingKeyPath(null);
      setEditingKeyValue('');
    }
  };

  const cancelEdit = () => {
    setEditingPath(null);
    setEditingValue('');
    setEditingKeyPath(null);
    setEditingKeyValue('');
  };

  // 显示删除确认
  const showDeleteConfirm = (path: string, key: string) => {
    setDeleteConfirm({ isOpen: true, path, key });
  };

  // 确认删除字段
  const confirmDelete = () => {
    const { path } = deleteConfirm;
    const keys = path.split('.');
    const newData = JSON.parse(JSON.stringify(jsonData));
    
    let current = newData;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    
    const lastKey = keys[keys.length - 1];
    if (Array.isArray(current)) {
      current.splice(Number(lastKey), 1);
    } else {
      delete current[lastKey];
    }
    
    updateData(newData);
    setDeleteConfirm({ isOpen: false, path: '', key: '' });
  };

  // 取消删除
  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, path: '', key: '' });
  };

  // 添加字段到对象
  const addFieldToObject = (path: string) => {
    const keys = path.split('.');
    const newData = JSON.parse(JSON.stringify(jsonData));
    
    let current = newData;
    for (let i = 0; i < keys.length; i++) {
      current = current[keys[i]];
    }
    
    if (typeof current === 'object' && !Array.isArray(current)) {
      // 生成临时键名
      let newKey = 'newField';
      let counter = 1;
      while (current.hasOwnProperty(newKey)) {
        newKey = `newField${counter}`;
        counter++;
      }
      
      current[newKey] = '';
      updateData(newData);
      
      // 自动展开父节点
      setExpandedPaths(prev => new Set([...prev, path]));
      
      // 进入编辑状态
      const newPath = path ? `${path}.${newKey}` : newKey;
      setEditingKeyPath(newPath);
      setEditingKeyValue(newKey);
      setEditingPath(newPath);
      setEditingValue('');
    }
  };

  // 添加元素到数组
  const addItemToArray = (path: string) => {
    const keys = path.split('.');
    const newData = JSON.parse(JSON.stringify(jsonData));
    
    let current = newData;
    for (let i = 0; i < keys.length; i++) {
      current = current[keys[i]];
    }
    
    if (Array.isArray(current)) {
      const newIndex = current.length;
      current.push('');
      updateData(newData);
      
      // 自动展开父节点
      setExpandedPaths(prev => new Set([...prev, path]));
      
      // 进入编辑状态
      const newPath = path ? `${path}.${newIndex}` : String(newIndex);
      setEditingPath(newPath);
      setEditingValue('');
    }
  };

  const getValueColor = (type: string) => {
    switch (type) {
      case 'string': return 'text-green-600';
      case 'number': return 'text-blue-600';
      case 'boolean': return 'text-purple-600';
      case 'null': return 'text-gray-400';
      default: return 'text-gray-700';
    }
  };

  const formatValue = (value: any, type: string) => {
    if (type === 'string') return `"${value}"`;
    if (type === 'null') return 'null';
    return String(value);
  };

  const nodes = parseJsonToTree(jsonData);

  return (
    <div className={className}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-800"
            title="全部展开"
          >
            全部展开
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 hover:text-blue-800"
            title="全部折叠"
          >
            全部折叠
          </button>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`text-xs ${showSearch ? 'text-blue-800 font-medium' : 'text-blue-600'} hover:text-blue-800`}
            title="查找替换"
          >
            {showSearch ? '关闭查找' : '查找替换'}
          </button>
        </div>
      </div>

      {/* 查找替换面板 */}
      {showSearch && (
        <div className="mb-2 p-3 bg-gray-50 border rounded">
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    // Shift+Enter: 查找上一个
                    if (searchResults.length > 0) {
                      handlePrevResult();
                    } else {
                      handleSearch();
                    }
                  } else {
                    // Enter: 查找或查找下一个
                    if (searchResults.length > 0) {
                      handleNextResult();
                    } else {
                      handleSearch();
                    }
                  }
                } else if (e.key === 'Escape') {
                  setShowSearch(false);
                } else if (e.key === 'F3' || (e.ctrlKey && e.key === 'g')) {
                  e.preventDefault();
                  if (searchResults.length > 0) {
                    handleNextResult();
                  }
                }
              }}
              placeholder="查找内容（Enter查找下一个，Shift+Enter上一个）"
              className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              title="查找所有匹配项"
            >
              查找
            </button>
          </div>
          <div className="flex items-center space-x-2 mb-2">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="替换为"
              className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleReplaceOne}
              className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={searchResults.length === 0}
              title="替换当前匹配项"
            >
              替换
            </button>
            <button
              onClick={handleReplaceAll}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={searchResults.length === 0}
              title="替换所有匹配项"
            >
              全部替换
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrevResult}
                  className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
                  title="上一个"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-xs text-gray-600">
                  {currentResultIndex + 1} / {searchResults.length}
                </span>
                <button
                  onClick={handleNextResult}
                  className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded"
                  title="下一个"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="text-xs text-gray-500">
                {searchResults[currentResultIndex]?.matchType === 'key' ? '键名' : '值'}: {searchResults[currentResultIndex]?.path}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 树形编辑视图 */}
      <div className="border rounded bg-white">
        {parseError ? (
          <div className="p-3 text-xs text-red-600">
            <div className="font-medium mb-1">JSON 解析错误：</div>
            <div>{parseError}</div>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto p-2 font-mono text-xs">
            {nodes.length === 0 ? (
              <div className="text-gray-400 text-center py-4">{placeholder || '空对象'}</div>
            ) : (
              nodes.map((node, idx) => {
                // 检查是否是当前匹配项
                const isCurrentMatch = searchResults.length > 0 && 
                  searchResults[currentResultIndex]?.path === node.path;
                
                return (
                  <div
                    key={idx}
                    data-instance={instanceId}
                    data-path={node.path}
                    className={`flex items-center py-1 px-1 rounded ${
                      isCurrentMatch ? 'bg-yellow-100 border-l-2 border-yellow-500' : 'hover:bg-gray-50'
                    }`}
                    style={{ paddingLeft: `${node.level * 16 + 4}px` }}
                    onMouseEnter={() => setFocusedPath(node.path)}
                    onMouseLeave={() => setFocusedPath(null)}
                  >
                  {/* 展开/折叠按钮 */}
                  {(node.type === 'object' || node.type === 'array') ? (
                    <button
                      onClick={() => toggleExpand(node.path)}
                      className="mr-1 text-gray-500 hover:text-gray-700 flex-shrink-0"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${expandedPaths.has(node.path) ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <span className="w-3 mr-1 flex-shrink-0"></span>
                  )}

                  {/* Key - 点击展开/折叠，编辑模式下可编辑 */}
                  {editingKeyPath === node.path ? (
                    <div className="flex items-center space-x-1 mr-2">
                      <input
                        type="text"
                        value={editingKeyValue}
                        onChange={(e) => setEditingKeyValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(node);
                          else if (e.key === 'Escape') cancelEdit();
                        }}
                        className="px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-blue-700"
                        style={{ width: '80px' }}
                        autoFocus
                      />
                      <span className="text-blue-700">:</span>
                    </div>
                  ) : (
                    <span 
                      className="text-blue-700 mr-2 flex-shrink-0 cursor-pointer hover:bg-blue-50 px-1 rounded"
                      onClick={() => {
                        // 点击键名：展开/折叠
                        if (node.type === 'object' || node.type === 'array') {
                          toggleExpand(node.path);
                        }
                      }}
                      title={node.type === 'object' || node.type === 'array' ? '点击展开/折叠' : ''}
                    >
                      {node.key}:
                    </span>
                  )}

                  {/* Value - 可编辑 */}
                  {node.type === 'object' || node.type === 'array' ? (
                    <div className="flex items-center flex-1">
                      <span 
                        className="text-gray-500 cursor-pointer hover:bg-gray-50 px-1 rounded"
                        onClick={() => toggleExpand(node.path)}
                        title="点击展开/折叠"
                      >
                        {node.type === 'object' ? '{' : '['}
                        {!expandedPaths.has(node.path) && (
                          <span className="ml-1 text-gray-400">
                            {node.type === 'array' 
                              ? `${Array.isArray(node.value) ? node.value.length : 0} items`
                              : `${Object.keys(node.value || {}).length} keys`
                            }
                          </span>
                        )}
                        {!expandedPaths.has(node.path) && (node.type === 'object' ? '}' : ']')}
                      </span>
                      {/* 编辑按钮 */}
                      <button
                        onClick={() => startEditBoth(node)}
                        className={`ml-2 transition-opacity text-blue-600 hover:text-blue-800 ${
                          focusedPath === node.path ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        title="编辑"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      {/* 添加字段/元素按钮 */}
                      <button
                        onClick={() => {
                          if (node.type === 'object') {
                            addFieldToObject(node.path);
                          } else {
                            addItemToArray(node.path);
                          }
                        }}
                        className={`ml-1 transition-opacity text-green-600 hover:text-green-800 ${
                          focusedPath === node.path ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        title={node.type === 'object' ? '添加字段' : '添加元素'}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      {/* 删除按钮 */}
                      <button
                        onClick={() => showDeleteConfirm(node.path, node.key)}
                        className={`ml-1 transition-opacity text-red-600 hover:text-red-800 ${
                          focusedPath === node.path ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        title="删除"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ) : editingPath === node.path ? (
                    <div className="flex items-center space-x-1 flex-1">
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(node);
                          else if (e.key === 'Escape') cancelEdit();
                        }}
                        className="flex-1 px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => saveEdit(node)}
                        className="text-green-600 hover:text-green-800"
                        title="保存"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-gray-600 hover:text-gray-800"
                        title="取消"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center flex-1">
                      <span 
                        className={`${getValueColor(node.type)} cursor-pointer hover:bg-blue-50 px-1 rounded`}
                        onClick={() => startEdit(node)}
                        title="点击编辑值"
                      >
                        {formatValue(node.value, node.type)}
                      </span>
                      <button
                        onClick={() => startEditBoth(node)}
                        className={`ml-2 transition-opacity text-blue-600 hover:text-blue-800 ${
                          focusedPath === node.path ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        title="编辑"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => showDeleteConfirm(node.path, node.key)}
                        className={`ml-1 transition-opacity text-red-600 hover:text-red-800 ${
                          focusedPath === node.path ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                        title="删除"
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
              })
            )}
          </div>
        )}
      </div>

      {/* 删除确认对话框 */}
      <DeleteConfirm
        isOpen={deleteConfirm.isOpen}
        message={`确定要删除字段 "${deleteConfirm.key}" 吗？`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      {/* Toast 提示 */}
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

export default JsonEditor;
