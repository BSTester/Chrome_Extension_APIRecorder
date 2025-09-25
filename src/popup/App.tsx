import React, { useState, useEffect } from 'react';
import { RequestRecord } from '../types';
import Header from './components/Header';
import RecordingControls from './components/RecordingControls';
import FilterPanel from './components/FilterPanel';
import RequestList from './components/RequestList';
import ExportPanel from './components/ExportPanel';
import { useExtensionState } from './hooks/useExtensionState';

const App: React.FC = () => {
  const {
    recordingState,
    records,
    filterOptions,
    loading,
    startRecording,
    stopRecording,
    clearRecords,
    updateFilters,
    refreshRecords,
    exportData
  } = useExtensionState();

  const [activeTab, setActiveTab] = useState<'records' | 'filters' | 'export'>('records');
  const [filteredRecords, setFilteredRecords] = useState<RequestRecord[]>([]);

  // 过滤记录
  useEffect(() => {
    if (!records) {
      setFilteredRecords([]);
      return;
    }

    let filtered = [...records];

    // 按状态码过滤
    if (filterOptions?.statusCodes && filterOptions.statusCodes.length > 0) {
      filtered = filtered.filter(record => 
        filterOptions.statusCodes.includes(record.responseStatus)
      );
    }

    // 按域名过滤
    if (filterOptions?.domains && filterOptions.domains.length > 0) {
      filtered = filtered.filter(record => {
        try {
          const url = new URL(record.url);
          return filterOptions.domains.some(domain => 
            url.hostname.includes(domain)
          );
        } catch {
          return false;
        }
      });
    }

    // 按响应时间过滤
    if (filterOptions?.minResponseTime && filterOptions.minResponseTime > 0) {
      filtered = filtered.filter(record => 
        record.responseTime >= filterOptions.minResponseTime
      );
    }

    // 按时间排序（最新的在前）
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    setFilteredRecords(filtered);
  }, [records, filterOptions]);

  const handleTabChange = (tab: 'records' | 'filters' | 'export') => {
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <Header />
      
      <RecordingControls
        recordingState={recordingState}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onClearRecords={clearRecords}
        onRefresh={refreshRecords}
      />

      {/* 标签导航 */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'records'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => handleTabChange('records')}
        >
          请求列表 ({filteredRecords.length})
        </button>
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'filters'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => handleTabChange('filters')}
        >
          过滤选项
        </button>
        <button
          className={`flex-1 py-2 px-4 text-sm font-medium ${
            activeTab === 'export'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => handleTabChange('export')}
        >
          导出
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'records' && (
          <RequestList 
            records={filteredRecords}
            loading={loading}
          />
        )}
        
        {activeTab === 'filters' && (
          <FilterPanel
            filterOptions={filterOptions}
            onUpdateFilters={updateFilters}
          />
        )}
        
        {activeTab === 'export' && (
          <ExportPanel
            records={filteredRecords}
            onExport={exportData}
          />
        )}
      </div>
    </div>
  );
};

export default App;