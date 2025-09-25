import React, { useState } from 'react';
import { RequestRecord, OpenAPIGenerateOptions } from '../../types';

interface ExportPanelProps {
  records: RequestRecord[];
  onExport: (format: 'yaml' | 'json' | 'raw', options?: OpenAPIGenerateOptions) => Promise<any>;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ records, onExport }) => {
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'yaml' | 'json' | 'raw'>('yaml');
  const [options, setOptions] = useState<OpenAPIGenerateOptions>({
    title: 'Recorded API',
    version: '1.0.0',
    description: '',
    serverUrl: 'auto',
    includeExamples: true,
    parameterizeUrls: true
  });

  const handleExport = async () => {
    if (records.length === 0) {
      alert('没有可导出的记录');
      return;
    }

    try {
      setExporting(true);
      
      if (exportFormat === 'raw') {
        await onExport('raw');
      } else {
        await onExport(exportFormat, options);
      }
    } catch (error) {
      alert(`导出失败: ${(error as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const getRecordStats = () => {
    if (records.length === 0) return null;

    const methods = new Set(records.map(r => r.method));
    const domains = new Set(records.map(r => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return 'unknown';
      }
    }));
    const statusCodes = new Set(records.map(r => r.responseStatus));

    return {
      total: records.length,
      methods: Array.from(methods),
      domains: Array.from(domains),
      statusCodes: Array.from(statusCodes).sort((a, b) => a - b)
    };
  };

  const stats = getRecordStats();

  return (
    <div className="p-4 space-y-6 overflow-y-auto scrollbar-thin">
      <h3 className="text-lg font-semibold text-gray-800">导出设置</h3>

      {/* 统计信息 */}
      {stats && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-3">录制统计</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-blue-700">总请求数:</span>
              <span className="ml-2 font-medium text-blue-900">{stats.total}</span>
            </div>
            <div>
              <span className="text-blue-700">HTTP方法:</span>
              <span className="ml-2 font-medium text-blue-900">{stats.methods.join(', ')}</span>
            </div>
            <div className="col-span-2">
              <span className="text-blue-700">域名:</span>
              <div className="mt-1 text-xs text-blue-800">
                {stats.domains.map(domain => (
                  <span key={domain} className="inline-block bg-blue-100 px-2 py-1 rounded mr-1 mb-1">
                    {domain}
                  </span>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-blue-700">状态码:</span>
              <div className="mt-1 text-xs text-blue-800">
                {stats.statusCodes.map(code => (
                  <span key={code} className="inline-block bg-blue-100 px-2 py-1 rounded mr-1 mb-1">
                    {code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 导出格式选择 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">导出格式</h4>
        
        <div className="space-y-2">
          <label className="flex items-center space-x-3">
            <input
              type="radio"
              name="format"
              value="yaml"
              checked={exportFormat === 'yaml'}
              onChange={(e) => setExportFormat(e.target.value as 'yaml')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">OpenAPI YAML</span>
              <p className="text-xs text-gray-500">标准OpenAPI 3.0规范，YAML格式</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="radio"
              name="format"
              value="json"
              checked={exportFormat === 'json'}
              onChange={(e) => setExportFormat(e.target.value as 'json')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">OpenAPI JSON</span>
              <p className="text-xs text-gray-500">标准OpenAPI 3.0规范，JSON格式</p>
            </div>
          </label>

          <label className="flex items-center space-x-3">
            <input
              type="radio"
              name="format"
              value="raw"
              checked={exportFormat === 'raw'}
              onChange={(e) => setExportFormat(e.target.value as 'raw')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">原始数据</span>
              <p className="text-xs text-gray-500">完整的请求响应数据，JSON格式</p>
            </div>
          </label>
        </div>
      </div>

      {/* OpenAPI选项 */}
      {(exportFormat === 'yaml' || exportFormat === 'json') && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700">OpenAPI选项</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">API标题</label>
              <input
                type="text"
                value={options.title}
                onChange={(e) => setOptions(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Recorded API"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">API版本</label>
              <input
                type="text"
                value={options.version}
                onChange={(e) => setOptions(prev => ({ ...prev, version: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="1.0.0"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">API描述</label>
              <textarea
                value={options.description}
                onChange={(e) => setOptions(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="API文档描述（可选）"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">服务器URL</label>
              <input
                type="text"
                value={options.serverUrl}
                onChange={(e) => setOptions(prev => ({ ...prev, serverUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="auto (自动检测) 或 https://api.example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={options.includeExamples}
                  onChange={(e) => setOptions(prev => ({ ...prev, includeExamples: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">包含示例数据</span>
                  <p className="text-xs text-gray-500">在Schema中包含实际的请求响应示例</p>
                </div>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={options.parameterizeUrls}
                  onChange={(e) => setOptions(prev => ({ ...prev, parameterizeUrls: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">参数化URL</span>
                  <p className="text-xs text-gray-500">自动将URL中的ID和UUID参数化</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 导出按钮 */}
      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={handleExport}
          disabled={exporting || records.length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
        >
          {exporting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>导出中...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span>
                导出 {exportFormat === 'yaml' ? 'YAML' : exportFormat === 'json' ? 'JSON' : '原始数据'}
              </span>
            </>
          )}
        </button>

        {records.length === 0 && (
          <p className="text-xs text-gray-500 text-center mt-2">
            请先录制一些HTTP请求
          </p>
        )}
      </div>

      {/* 导出说明 */}
      <div className="bg-gray-50 rounded-lg p-3">
        <h5 className="text-xs font-medium text-gray-700 mb-2">导出说明</h5>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• OpenAPI格式可用于Swagger UI、Postman等工具</li>
          <li>• 参数化URL会将ID和UUID替换为路径参数</li>
          <li>• 示例数据基于实际录制的请求响应</li>
          <li>• 原始数据包含完整的请求响应信息</li>
        </ul>
      </div>
    </div>
  );
};

export default ExportPanel;