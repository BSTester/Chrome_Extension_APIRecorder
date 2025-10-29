import React, { useState, useEffect } from 'react';
import { RequestRecord, FilterOptions } from '../types';
import Header from './components/Header';
import RecordingControls from './components/RecordingControls';
import GroupedRequestList from './components/GroupedRequestList';
import ExportPanel from './components/ExportPanel';
import FilterPanel from './components/FilterPanel';
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
    refreshRecords,
    updateFilters
  } = useExtensionState();

  const [activeTab, setActiveTab] = useState<'records' | 'filter' | 'export'>('records');
  const [filteredRecords, setFilteredRecords] = useState<RequestRecord[]>([]);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [groupRefreshTrigger, setGroupRefreshTrigger] = useState(0);
  
  // 初始化大屏样式
  useEffect(() => {
    // 设置大屏模式标识
    (window as any).isLargeScreen = true;
    
    if (!loading) {
      const loadingContainer = document.querySelector('.loading-container');
      if (loadingContainer) {
        (loadingContainer as HTMLElement).style.display = 'none';
      }
      // 添加大屏样式类
      document.body.classList.add('large-screen-mode');
    }
  }, [loading]);

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

    // 去重过滤（前端显示级）
    if (filterOptions?.duplicateRemoval) {
      const seen = new Map<string, RequestRecord>();
      
      filtered.forEach(record => {
        try {
          const url = new URL(record.url);
          // 参数化URL路径（将数字ID替换为占位符）
          let pathname = url.pathname;
          pathname = pathname.replace(/\/\d+/g, '/{id}');
          pathname = pathname.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
          
          // 构建唯一键（方法+参数化路径）
          const uniqueKey = `${record.method}:${pathname}`;
          
          // 保留第一个出现的记录，或者保留参数更多的记录
          if (!seen.has(uniqueKey)) {
            seen.set(uniqueKey, record);
          } else {
            const existing = seen.get(uniqueKey)!;
            const existingParamCount = getParameterCount(existing);
            const currentParamCount = getParameterCount(record);
            
            if (currentParamCount > existingParamCount) {
              seen.set(uniqueKey, record);
            }
          }
        } catch {
          // URL解析失败，使用原始比较
          const uniqueKey = `${record.method}:${record.url}`;
          if (!seen.has(uniqueKey)) {
            seen.set(uniqueKey, record);
          }
        }
      });
      
      filtered = Array.from(seen.values());
    }

    // 按时间排序（最新的在前）
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    setFilteredRecords(filtered);
  }, [records, filterOptions]);

  // 计算记录的参数数量（用于去重时选择更完整的记录）
  const getParameterCount = (record: RequestRecord): number => {
    let count = 0;
    
    try {
      const url = new URL(record.url);
      count += url.searchParams.size;
    } catch {}
    
    if (record.requestParameters) {
      count += Object.keys(record.requestParameters.query || {}).length;
      count += (record.requestParameters.path || []).length;
      count += Object.keys(record.requestParameters.headers || {}).length;
    }
    
    return count;
  };

  const handleTabChange = (tab: 'records' | 'filter' | 'export') => {
    setActiveTab(tab);
  };

  const handleRecordSelection = (recordIds: string[], selected: boolean) => {
    const newSelected = new Set(selectedRecords);
    recordIds.forEach(id => {
      if (selected) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
    });
    setSelectedRecords(newSelected);
  };

  // 适配单个记录选择的函数
  const handleSingleRecordSelection = (recordId: string, selected: boolean) => {
    handleRecordSelection([recordId], selected);
  };

  const handleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const handleUpdateFilters = (newFilters: Partial<FilterOptions>) => {
    updateFilters(newFilters);
  };

  const handleClearRecords = async () => {
    await clearRecords();
    // 清空记录时重置选中状态
    setSelectedRecords(new Set());
  };

  // 处理记录删除后的回调
  const handleRecordDeleted = () => {
    // 触发重新获取记录数据以更新统计信息
    refreshRecords();
  };

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col max-w-none large-screen-container">
      <Header />
      
      <RecordingControls
        recordingState={recordingState}
        filteredRecordsCount={filteredRecords.length}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onClearRecords={handleClearRecords}
        onRefresh={refreshRecords}
        loading={loading}
        onGroupChange={() => {
          setGroupRefreshTrigger(prev => prev + 1);
          refreshRecords();
        }}
      />

      {/* Tab导航 */}
      <div className="flex border-b border-gray-200 tab-navigation">
        <button
          className={`flex-1 tab-button py-1.5 px-2 text-sm font-medium transition-colors ${
            activeTab === 'records'
              ? 'active text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => handleTabChange('records')}
        >
          <div className="flex items-center justify-center space-x-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
            <span>接口列表</span>
            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full text-xs">
              {filteredRecords.length}
            </span>
          </div>
        </button>
        
        <button
          className={`flex-1 tab-button py-1.5 px-2 text-sm font-medium transition-colors ${
            activeTab === 'filter'
              ? 'active text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => handleTabChange('filter')}
        >
          <div className="flex items-center justify-center space-x-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
            </svg>
            <span>过滤器</span>
          </div>
        </button>
        
        <button
          className={`flex-1 tab-button py-1.5 px-2 text-sm font-medium transition-colors ${
            activeTab === 'export'
              ? 'active text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => handleTabChange('export')}
        >
          <div className="flex items-center justify-center space-x-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            <span>导出</span>
            {(() => {
              const validSelectedCount = Array.from(selectedRecords).filter(id => 
                filteredRecords.some(r => r.id === id)
              ).length;
              return validSelectedCount > 0 && (
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                  {validSelectedCount}
                </span>
              );
            })()}
          </div>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'records' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 分组化的接口列表 - 移除之前的独立分组管理区域 */}
            <GroupedRequestList 
              records={filteredRecords}
              loading={loading}
              selectedRecords={selectedRecords}
              onRecordSelection={handleSingleRecordSelection}
              onBatchRecordSelection={handleRecordSelection}
              onSelectAll={handleSelectAll}
              showTitle={false}
              refreshTrigger={groupRefreshTrigger}
              onRecordDeleted={handleRecordDeleted}
            />
          </div>
        )}
        
        {activeTab === 'filter' && (
          <FilterPanel
            filterOptions={filterOptions}
            onUpdateFilters={handleUpdateFilters}
          />
        )}
        
        {activeTab === 'export' && (
          <ExportPanel
            records={filteredRecords}
            selectedRecords={Array.from(selectedRecords).filter(id => 
              filteredRecords.some(r => r.id === id)
            )}
            filterOptions={filterOptions}
          />
        )}
      </div>
    </div>
  );
};

export default App;