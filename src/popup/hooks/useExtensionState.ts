import { useState, useEffect, useCallback } from 'react';
import { 
  RecordingState, 
  RequestRecord, 
  FilterOptions, 
  Message, 
  OpenAPIGenerateOptions,
  OpenAPIV2GenerateOptions,
  ExportResult
} from '../../types';

interface ExtensionState {
  recordingState: RecordingState | null;
  records: RequestRecord[] | null;
  filterOptions: FilterOptions | null;
  loading: boolean;
  error: string | null;
}

export const useExtensionState = () => {
  const [state, setState] = useState<ExtensionState>({
    recordingState: null,
    records: null,
    filterOptions: null,
    loading: true,
    error: null
  });

  // 发送消息到后台脚本（带超时）
  const sendMessage = useCallback(async (message: Message): Promise<any> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('通信超时：后台脚本可能未正确初始化'));
      }, 10000); // 10秒超时
      
      chrome.runtime.sendMessage(message, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (response?.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      });
    });
  }, []);

  // 获取已保存的过滤器配置
  const getSavedFilters = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'GET_FILTERS' });
      return response.filters as FilterOptions | null;
    } catch (error) {
      console.debug('Failed to get saved filters:', error);
      return null;
    }
  }, [sendMessage]);

  // 获取录制状态
  const getRecordingState = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'GET_STATE' });
      return response.state as RecordingState;
    } catch (error) {
      console.error('Failed to get recording state:', error);
      throw error;
    }
  }, [sendMessage]);

  // 获取所有记录
  const getRecords = useCallback(async () => {
    try {
      const response = await sendMessage({ type: 'GET_RECORDS' });
      return response.records as RequestRecord[];
    } catch (error) {
      console.error('Failed to get records:', error);
      throw error;
    }
  }, [sendMessage]);

  // 开始录制
  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await sendMessage({ type: 'START_RECORDING' });
      
      // 获取最新记录数据以保证统计信息准确
      const records = await getRecords();
      const correctedState = {
        ...response.state,
        recordCount: records ? records.length : 0
      };
      
      setState(prev => ({ 
        ...prev, 
        recordingState: correctedState,
        records,
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage, getRecords]);

  // 停止录制
  const stopRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await sendMessage({ type: 'STOP_RECORDING' });
      
      // 获取最新记录数据以保证统计信息准确
      const records = await getRecords();
      const correctedState = {
        ...response.state,
        recordCount: records ? records.length : 0
      };
      
      setState(prev => ({ 
        ...prev, 
        recordingState: correctedState,
        records,
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage, getRecords]);

  // 清空记录
  const clearRecords = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await sendMessage({ type: 'CLEAR_RECORDS' });
      
      // 获取更新后的状态
      const updatedState = await getRecordingState();
      
      setState(prev => ({ 
        ...prev, 
        records: [],
        recordingState: updatedState,
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage, getRecordingState]);

  const updateFilters = useCallback(async (filters: Partial<FilterOptions>) => {
    try {
      await sendMessage({ 
        type: 'UPDATE_FILTERS', 
        data: filters 
      });
      setState(prev => ({ 
        ...prev, 
        filterOptions: prev.filterOptions ? 
          { ...prev.filterOptions, ...filters } : 
          null
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message 
      }));
    }
  }, [sendMessage]);

  // 刷新记录
  const refreshRecords = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const [recordingState, records] = await Promise.all([
        getRecordingState(),
        getRecords()
      ]);

      // 修正统计信息：使用实际记录数量
      const correctedRecordingState = recordingState ? {
        ...recordingState,
        recordCount: records ? records.length : 0
      } : recordingState;

      setState(prev => ({
        ...prev,
        recordingState: correctedRecordingState,
        records,
        loading: false
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [getRecordingState, getRecords]);

  // 导出数据
  const exportData = useCallback(async (
    format: 'yaml' | 'json' | 'openapi-v2' | 'raw',
    options?: OpenAPIGenerateOptions | OpenAPIV2GenerateOptions
  ) => {
    try {
      if (!state.records || state.records.length === 0) {
        throw new Error('没有可导出的记录');
      }

      let result: ExportResult;

      switch (format) {
        case 'yaml':
        case 'json': {
          const { OpenAPIExporter } = await import('../../exporters/openapi-exporter');
          const exporter = new OpenAPIExporter();
          result = format === 'yaml' 
            ? await exporter.exportToOpenAPI(state.records, options as OpenAPIGenerateOptions)
            : await exporter.exportToJSON(state.records, options as OpenAPIGenerateOptions);
          break;
        }
        case 'openapi-v2': {
          const { OpenAPIV2Exporter } = await import('../../exporters/openapi-v2-exporter');
          const exporter = new OpenAPIV2Exporter();
          result = await exporter.exportToYAML(state.records, options as OpenAPIV2GenerateOptions);
          break;
        }
        case 'raw': {
          const { OpenAPIExporter } = await import('../../exporters/openapi-exporter');
          const exporter = new OpenAPIExporter();
          result = await exporter.exportRawData(state.records);
          break;
        }
        default:
          throw new Error('不支持的导出格式');
      }

      // 下载文件
      const blob = new Blob([result.content], { 
        type: format === 'yaml' ? 'text/yaml' : 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return result;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message 
      }));
      throw error;
    }
  }, [state.records]);

  // 初始化数据加载
  useEffect(() => {
    const initializeData = async () => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));

        // 检查Chrome APIs是否可用
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          throw new Error('Chrome APIs 不可用，请在扩展环境中运行');
        }

        // 并行获取状态、记录和过滤器配置
        const [recordingState, records, savedFilters] = await Promise.all([
          getRecordingState(),
          getRecords(),
          getSavedFilters()
        ]);

        // 使用保存的过滤选项，如果没有则使用默认值
        const defaultFilters: FilterOptions = {
          excludeStatic: true,
          ajaxOnly: true,
          duplicateRemoval: false,
          minResponseTime: 0,
          statusCodes: [200, 201, 400, 404, 500],
          domains: []
        };
        
        const filterOptions = savedFilters || defaultFilters;

        // 修正统计信息：使用实际记录数量而不是状态中的计数
        const correctedRecordingState = recordingState ? {
          ...recordingState,
          recordCount: records ? records.length : 0
        } : recordingState;

        setState({
          recordingState: correctedRecordingState,
          records,
          filterOptions,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Failed to initialize extension state:', error);
        setState(prev => ({
          ...prev,
          error: (error as Error).message,
          loading: false,
          // 设置默认值以防止应用完全无法使用
          recordingState: {
            isRecording: false,
            isPaused: false,
            recordCount: 0,
            duration: 0
          },
          records: [],
          filterOptions: {
            excludeStatic: true,
            ajaxOnly: true,
            duplicateRemoval: false,
            minResponseTime: 0,
            statusCodes: [200, 201, 400, 404, 500],
            domains: []
          }
        }));
      }
    };

    initializeData();
  }, [getRecordingState, getRecords]);

  // 定期更新录制状态（仅在录制时）
  useEffect(() => {
    let intervalId: number | null = null;
    
    if (state.recordingState?.isRecording) {
      intervalId = setInterval(async () => {
        try {
          const [newState, records] = await Promise.all([
            getRecordingState(),
            getRecords()
          ]);
          
          // 修正统计信息
          const correctedState = {
            ...newState,
            recordCount: records ? records.length : 0
          };
          
          setState(prev => ({
            ...prev,
            recordingState: correctedState,
            records
          }));
        } catch (error) {
          console.debug('Failed to update recording state:', error);
        }
      }, 2000) as any; // 每2秒更新一次状态
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [state.recordingState?.isRecording, getRecordingState, getRecords]);

  return {
    ...state,
    startRecording,
    stopRecording,
    clearRecords,
    updateFilters,
    refreshRecords,
    exportData
  };
};