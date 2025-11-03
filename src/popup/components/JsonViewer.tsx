import React, { useState, useEffect } from 'react';

interface JsonViewerProps {
  value: string;
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

const JsonViewer: React.FC<JsonViewerProps> = ({ value, placeholder, className, instanceId = 'viewer' }) => {
  const [jsonData, setJsonData] = useState<any>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ path: string; key: string; value: any; matchType: 'key' | 'value' }>>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);

  // 初始化数据
  useEffect(() => {
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

    if (results.length > 0) {
      expandToPath(results[0].path);
      scrollToMatch(results[0].path);
    }
  };

  // 展开到指定路径
  const expandToPath = (targetPath: string) => {
    const newExpanded = new Set(expandedPaths);
    const parts = targetPath.split('.');
    
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('.');
      newExpanded.add(path);
    }
    
    setExpandedPaths(newExpanded);
  };

  // 滚动到匹配项
  const scrollToMatch = (path: string) => {
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

  // 全局快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
            title="查找"
          >
            {showSearch ? '关闭查找' : '查找'}
          </button>
        </div>
      </div>

      {/* 查找面板 */}
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
                    if (searchResults.length > 0) {
                      handlePrevResult();
                    } else {
                      handleSearch();
                    }
                  } else {
                    if (searchResults.length > 0) {
                      handleNextResult();
                    } else {
                      handleSearch();
                    }
                  }
                } else if (e.key === 'Escape') {
                  setShowSearch(false);
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

      {/* JSON 树形视图 */}
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

                    {/* Key */}
                    <span 
                      className="text-blue-700 mr-2 flex-shrink-0 cursor-pointer hover:bg-blue-50 px-1 rounded"
                      onClick={() => {
                        if (node.type === 'object' || node.type === 'array') {
                          toggleExpand(node.path);
                        }
                      }}
                      title={node.type === 'object' || node.type === 'array' ? '点击展开/折叠' : ''}
                    >
                      {node.key}:
                    </span>

                    {/* Value */}
                    {node.type === 'object' || node.type === 'array' ? (
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
                    ) : (
                      <span className={getValueColor(node.type)}>
                        {formatValue(node.value, node.type)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonViewer;
