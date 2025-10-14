import React, { useState, useEffect } from 'react';
import { FilterOptions } from '../../types';

interface FilterPanelProps {
  filterOptions: FilterOptions | null;
  onUpdateFilters: (filters: Partial<FilterOptions>) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  filterOptions,
  onUpdateFilters
}) => {
  const [localFilters, setLocalFilters] = useState<FilterOptions>(() => ({
    excludeStatic: filterOptions?.excludeStatic ?? true,
    ajaxOnly: filterOptions?.ajaxOnly ?? true,
    duplicateRemoval: filterOptions?.duplicateRemoval ?? false,
    minResponseTime: filterOptions?.minResponseTime ?? 0,
    statusCodes: filterOptions?.statusCodes ?? [200, 201, 400, 404, 500],
    domains: filterOptions?.domains ?? []
  }));

  // 当 filterOptions 变化时更新本地状态
  useEffect(() => {
    if (filterOptions) {
      setLocalFilters({
        excludeStatic: filterOptions.excludeStatic,
        ajaxOnly: filterOptions.ajaxOnly,
        duplicateRemoval: filterOptions.duplicateRemoval,
        minResponseTime: filterOptions.minResponseTime,
        statusCodes: filterOptions.statusCodes,
        domains: filterOptions.domains
      });
    }
  }, [filterOptions]);

  // 快速预设状态码组
  const successCodes = [200, 201, 202, 204];
  const errorCodes = [400, 401, 403, 404, 422, 500, 502, 503];
  
  // 检查是否包含所有成功状态码
  const hasAllSuccessCodes = successCodes.every(code => localFilters.statusCodes.includes(code));
  // 检查是否包含所有错误状态码
  const hasAllErrorCodes = errorCodes.every(code => localFilters.statusCodes.includes(code));

  const [newDomain, setNewDomain] = useState('');
  const [newStatusCode, setNewStatusCode] = useState('');

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    onUpdateFilters({ [key]: value });
  };

  // 处理快速预设状态码
  const handleQuickPreset = (presetCodes: number[], isChecked: boolean) => {
    let updatedCodes: number[];
    
    if (isChecked) {
      // 添加预设状态码，去除重复
      const newCodes = presetCodes.filter(code => !localFilters.statusCodes.includes(code));
      updatedCodes = [...localFilters.statusCodes, ...newCodes].sort((a, b) => a - b);
    } else {
      // 移除预设状态码
      updatedCodes = localFilters.statusCodes.filter(code => !presetCodes.includes(code));
    }
    
    handleFilterChange('statusCodes', updatedCodes);
  };

  const addDomain = () => {
    if (newDomain.trim() && !localFilters.domains.includes(newDomain.trim())) {
      const updatedDomains = [...localFilters.domains, newDomain.trim()];
      handleFilterChange('domains', updatedDomains);
      setNewDomain('');
    }
  };

  const removeDomain = (domain: string) => {
    const updatedDomains = localFilters.domains.filter(d => d !== domain);
    handleFilterChange('domains', updatedDomains);
  };

  const addStatusCode = () => {
    const code = parseInt(newStatusCode);
    if (!isNaN(code) && code >= 100 && code < 600 && !localFilters.statusCodes.includes(code)) {
      const updatedCodes = [...localFilters.statusCodes, code].sort((a, b) => a - b);
      handleFilterChange('statusCodes', updatedCodes);
      setNewStatusCode('');
    }
  };

  const removeStatusCode = (code: number) => {
    const updatedCodes = localFilters.statusCodes.filter(c => c !== code);
    handleFilterChange('statusCodes', updatedCodes);
  };

  return (
    <div className="p-4 space-y-6 overflow-y-auto scrollbar-thin filter-panel">
      <h3 className="text-lg font-semibold text-gray-800">过滤选项</h3>

      {/* 基础过滤选项 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-700">基础过滤</h4>
        
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localFilters.excludeStatic}
              onChange={(e) => handleFilterChange('excludeStatic', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">排除静态资源</span>
              <p className="text-xs text-gray-500">排除图片、CSS、JS等静态文件</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localFilters.ajaxOnly}
              onChange={(e) => handleFilterChange('ajaxOnly', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">仅AJAX请求</span>
              <p className="text-xs text-gray-500">只录制XMLHttpRequest和Fetch请求</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={localFilters.duplicateRemoval}
              onChange={(e) => handleFilterChange('duplicateRemoval', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">去除重复请求</span>
              <p className="text-xs text-gray-500">基于URL和方法去重</p>
            </div>
          </label>
        </div>
      </div>

      {/* 响应时间过滤 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">响应时间过滤</h4>
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            最小响应时间 (毫秒)
          </label>
          <input
            type="number"
            min="0"
            value={localFilters.minResponseTime}
            onChange={(e) => handleFilterChange('minResponseTime', parseInt(e.target.value) || 0)}
            className="px-2 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 leading-tight"
            style={{ height: '1.75rem', width: '530px', flexShrink: 0 }}
            placeholder="0"
          />
        </div>
      </div>

      {/* 域名过滤 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">域名过滤</h4>
        
        <div className="flex space-x-2">
          <input
            type="text"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addDomain()}
            className="px-2 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 leading-tight"
            style={{ height: '1.75rem', width: '450px', flexShrink: 0 }}
            placeholder="example.com or *.example.com"
          />
          <button
            onClick={addDomain}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors leading-tight"
            style={{ height: '1.75rem' }}
          >
            添加
          </button>
        </div>

        {localFilters.domains.length > 0 && (
          <div className="space-y-1">
            {localFilters.domains.map((domain, index) => (
              <div key={index} className="flex items-center justify-between bg-gray-100 px-3 py-2 rounded-lg">
                <span className="text-sm text-gray-700">{domain}</span>
                <button
                  onClick={() => removeDomain(domain)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 状态码过滤 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">状态码过滤</h4>
        
        <div className="flex space-x-2">
          <input
            type="number"
            min="100"
            max="599"
            value={newStatusCode}
            onChange={(e) => setNewStatusCode(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addStatusCode()}
            className="px-2 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 leading-tight"
            style={{ height: '1.75rem', width: '450px', flexShrink: 0 }}
            placeholder="200"
          />
          <button
            onClick={addStatusCode}
            className="px-2 py-0.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors leading-tight"
            style={{ height: '1.75rem' }}
          >
            添加
          </button>
        </div>

        {localFilters.statusCodes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {localFilters.statusCodes.map((code) => (
              <div key={code} className="flex items-center bg-gray-100 px-3 py-1 rounded-full">
                <span className="text-sm text-gray-700">{code}</span>
                <button
                  onClick={() => removeStatusCode(code)}
                  className="ml-2 text-red-600 hover:text-red-800 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 快速预设 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">快速预设</h4>
        
        <div className="space-y-3">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={hasAllSuccessCodes}
              onChange={(e) => handleQuickPreset(successCodes, e.target.checked)}
              className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
            />
            <div className="flex items-center space-x-2">
              <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">成功请求</span>
              <span className="text-xs text-gray-500">(200, 201, 202, 204)</span>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={hasAllErrorCodes}
              onChange={(e) => handleQuickPreset(errorCodes, e.target.checked)}
              className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <div className="flex items-center space-x-2">
              <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">错误请求</span>
              <span className="text-xs text-gray-500">(400, 401, 403, 404, 422, 500, 502, 503)</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;