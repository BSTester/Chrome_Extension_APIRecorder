import React, { useState, useEffect } from 'react';
import type { RequestRecord, FilterOptions } from '../../types';
import DomainDetector, { DomainInfo } from '../../services/DomainDetector';
import AutoInfoGenerator from '../../services/AutoInfoGenerator';
import MultiFileExporter, { ExportConfig } from '../../services/MultiFileExporter';
import ErrorHandler from '../../services/ErrorHandler';

interface ExportPanelProps {
  records: RequestRecord[];
  selectedRecords: string[];
  filterOptions?: FilterOptions | null;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ 
  records, 
  selectedRecords,
  filterOptions
}) => {
  const [domainDetector] = useState(() => DomainDetector.getInstance());
  const [autoInfoGenerator] = useState(() => AutoInfoGenerator.getInstance());
  const [multiFileExporter] = useState(() => MultiFileExporter.getInstance());
  const [errorHandler] = useState(() => ErrorHandler.getInstance());
  const [exportFormat, setExportFormat] = useState<'json' | 'yaml'>('json');
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [detectedDomains, setDetectedDomains] = useState<DomainInfo[]>([]);
  const [apiInfo, setApiInfo] = useState({
    title: 'Recorded API',
    description: 'API specification generated from recorded HTTP requests',
    version: '1.0.0',
    serverUrl: 'https://api.example.com'
  });
  const [loadingStates, setLoadingStates] = useState({
    detectingDomains: false,
    generatingInfo: false,
    exporting: false
  });

  // 自动生成API信息和检测域名
  useEffect(() => {
    if (records && records.length > 0) {
      setLoadingStates(prev => ({ ...prev, detectingDomains: true, generatingInfo: true }));
      try {
        const generatedInfo = autoInfoGenerator.generateApiInfo(records, filterOptions || undefined);
        setApiInfo(generatedInfo);
        
        // 检测域名
        const domains = domainDetector.detectDomains(records, filterOptions || undefined);
        setDetectedDomains(domains);
      } catch (error) {
        errorHandler.handleUserError(error as Error, '生成API信息和检测域名');
      } finally {
        setLoadingStates(prev => ({ ...prev, detectingDomains: false, generatingInfo: false }));
      }
    }
  }, [records, filterOptions, autoInfoGenerator, domainDetector]);

  const recordsToExport = exportScope === 'selected' 
    ? records.filter(r => selectedRecords.includes(r.id))
    : records;

  const getRecordStats = () => {
    if (recordsToExport.length === 0) return null;

    const methods = new Set(recordsToExport.map(r => r.method));
    const domains = new Set(recordsToExport.map(r => {
      try {
        return new URL(r.url).hostname;
      } catch {
        return 'unknown';
      }
    }));
    const statusCodes = new Set(recordsToExport.map(r => r.responseStatus));

    return {
      total: recordsToExport.length,
      methods: Array.from(methods),
      domains: Array.from(domains),
      statusCodes: Array.from(statusCodes).sort((a, b) => (a as number) - (b as number))
    };
  };

  const handleExport = async () => {
    if (recordsToExport.length === 0) {
      errorHandler.showUserMessage('没有可导出的记录', 'warning');
      return;
    }

    try {
      setLoadingStates(prev => ({ ...prev, exporting: true }));
      
      // 准备导出配置
      const exportConfig: ExportConfig = {
        format: exportFormat,
        scope: exportScope,
        multiDomain: detectedDomains.length > 1,
        autoFillInfo: true,
        domains: detectedDomains,
        includeExamples: true,
        groupByTags: true
      };

      // 合并为一个 OpenAPI 3 文件进行导出
      const result = await multiFileExporter.exportMergedOpenAPI(recordsToExport, exportConfig);
      
      if (!result.success) {
        errorHandler.handleUserError(
          new Error(result.errors?.join(', ') || '未知错误'), 
          '导出文件', 
          `导出失败: ${result.errors?.join(', ') || '未知错误'}`
        );
        return;
      }

      // 下载文件
      if (result.files.length === 1) {
        // 单个文件直接下载
        multiFileExporter.downloadFile(result.files[0]);
      } else {
        // 多个文件逐个下载
        await multiFileExporter.downloadAllFiles(result.files);
        
        // 显示成功消息
        const fileList = result.files.map(f => `${f.filename} (${f.recordCount} 个接口)`).join('\n');
        errorHandler.showUserMessage(`成功导出 ${result.files.length} 个文件:\n${fileList}`, 'success');
      }
      
    } catch (error) {
      errorHandler.handleUserError(error as Error, '导出文件', '导出过程中发生错误');
    } finally {
      setLoadingStates(prev => ({ ...prev, exporting: false }));
    }
  };



  const stats = getRecordStats();

  return (
    <div className="p-4 space-y-6 overflow-y-auto scrollbar-thin">
      <h3 className="text-lg font-semibold text-gray-800">导出OpenAPI文档</h3>

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
              {detectedDomains.length > 1 && (
                <div className="mt-2 text-xs text-blue-600">
                  检测到多个域名，将生成 {detectedDomains.length} 个独立的OpenAPI文件
                </div>
              )}
            </div>
          </div>
          
          {/* OpenAPI规范重复路径提示 */}
          {filterOptions?.duplicateRemoval === false && stats.total > 1 && (
            <div className="mt-3 pt-3 border-t border-amber-200">
              <div className="flex items-center space-x-2 text-sm">
                <svg className="w-4 h-4 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-amber-700">
                  OpenAPI规范不支持重复路径：相同路径的不同方法将自动合并
                </span>
              </div>
              <div className="mt-1 text-xs text-amber-600">
                建议启用去重功能以获得更规范的OpenAPI文档结构
              </div>
            </div>
          )}
        </div>
      )}

      {/* 导出设置 */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-700">导出设置</h4>
        
        {/* 导出范围 */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">导出范围</label>
          <div className="space-y-2">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={exportScope === 'all'}
                onChange={(e) => setExportScope(e.target.value as 'all')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">所有记录 ({records.length} 个)</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="scope"
                value="selected"
                checked={exportScope === 'selected'}
                onChange={(e) => setExportScope(e.target.value as 'selected')}
                disabled={selectedRecords.length === 0}
                className="w-4 h-4 text-blue-600"
              />
              <span className={`text-sm ${
                selectedRecords.length === 0 ? 'text-gray-400' : 'text-gray-700'
              }`}>选中的记录 ({selectedRecords.length} 个)</span>
            </label>
          </div>
        </div>

        {/* 导出格式 */}
        <div className="space-y-2">
          <label className="text-sm text-gray-600">导出格式</label>
          <div className="flex space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="format"
                value="json"
                checked={exportFormat === 'json'}
                onChange={(e) => setExportFormat(e.target.value as 'json')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">JSON</span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="radio"
                name="format"
                value="yaml"
                checked={exportFormat === 'yaml'}
                onChange={(e) => setExportFormat(e.target.value as 'yaml')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">YAML</span>
            </label>
          </div>
        </div>

        {/* API信息显示 */}
        <div className="space-y-3">
          <label className="text-sm text-gray-600">API信息（自动生成）</label>
          <div className="bg-gray-50 rounded-md p-3 space-y-2 text-sm">
            <div>
              <span className="text-gray-600">标题:</span>
              <span className="ml-2 font-medium text-gray-900">{apiInfo.title}</span>
            </div>
            <div>
              <span className="text-gray-600">版本:</span>
              <span className="ml-2 font-medium text-gray-900">{apiInfo.version}</span>
            </div>
            <div>
              <span className="text-gray-600">服务器:</span>
              <span className="ml-2 font-medium text-gray-900">{apiInfo.serverUrl}</span>
            </div>
            <div>
              <span className="text-gray-600">描述:</span>
              <div className="ml-2 text-gray-700 text-xs mt-1 max-h-20 overflow-y-auto">
                {apiInfo.description}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 导出按钮 */}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleExport}
          disabled={loadingStates.exporting || recordsToExport.length === 0}
          className={`px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center text-sm ${
            loadingStates.exporting || recordsToExport.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loadingStates.exporting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              导出中...
            </>
          ) : (
            `导出 ${exportFormat.toUpperCase()} 格式 (${recordsToExport.length} 个记录)`
          )}
        </button>
        
        {recordsToExport.length === 0 && (
          <p className="text-xs text-gray-500 text-center mt-2">
            请先录制一些接口请求或选中要导出的记录
          </p>
        )}
      </div>
    </div>
  );
};

export default ExportPanel;