import React, { useState } from 'react';
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

  const [newDomain, setNewDomain] = useState('');
  const [newStatusCode, setNewStatusCode] = useState('');

  const handleFilterChange = (key: keyof FilterOptions, value: any) => {
    const updated = { ...localFilters, [key]: value };
    setLocalFilters(updated);
    onUpdateFilters({ [key]: value });
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
    <div className="p-4 space-y-6 overflow-y-auto scrollbar-thin">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="example.com or *.example.com"
          />
          <button
            onClick={addDomain}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="200"
          />
          <button
            onClick={addStatusCode}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
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
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              const presets = {
                excludeStatic: true,
                ajaxOnly: true,
                duplicateRemoval: false,
                minResponseTime: 0,
                statusCodes: [200, 201, 202, 204],
                domains: []
              };
              setLocalFilters(presets);
              onUpdateFilters(presets);
            }}
            className="px-3 py-2 bg-green-100 text-green-800 rounded-lg text-sm hover:bg-green-200 transition-colors"
          >
            成功请求
          </button>
          
          <button
            onClick={() => {
              const presets = {
                excludeStatic: true,
                ajaxOnly: true,
                duplicateRemoval: false,
                minResponseTime: 0,
                statusCodes: [400, 401, 403, 404, 422, 500, 502, 503],
                domains: []
              };
              setLocalFilters(presets);
              onUpdateFilters(presets);
            }}
            className="px-3 py-2 bg-red-100 text-red-800 rounded-lg text-sm hover:bg-red-200 transition-colors"
          >
            错误请求
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterPanel;