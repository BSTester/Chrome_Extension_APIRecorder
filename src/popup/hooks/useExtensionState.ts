import { useState, useEffect, useCallback } from 'react';
import { 
  RecordingState, 
  RequestRecord, 
  FilterOptions, 
  Message, 
  OpenAPIGenerateOptions,
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

  // 发送消息到后台脚本
  const sendMessage = useCallback(async (message: Message): Promise<any> => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
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
      setState(prev => ({ 
        ...prev, 
        recordingState: response.state,
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage]);

  // 停止录制
  const stopRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const response = await sendMessage({ type: 'STOP_RECORDING' });
      setState(prev => ({ 
        ...prev, 
        recordingState: response.state,
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage]);

  // 清空记录
  const clearRecords = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await sendMessage({ type: 'CLEAR_RECORDS' });
      setState(prev => ({ 
        ...prev, 
        records: [],
        loading: false 
      }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message, 
        loading: false 
      }));
    }
  }, [sendMessage]);

  // 更新过滤选项
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

      setState(prev => ({
        ...prev,
        recordingState,
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
    format: 'yaml' | 'json' | 'raw',
    options?: OpenAPIGenerateOptions
  ) => {
    try {
      if (!state.records || state.records.length === 0) {
        throw new Error('没有可导出的记录');
      }

      const { OpenAPIExporter } = await import('../../export/openapi-exporter');
      const exporter = new OpenAPIExporter();

      let result: ExportResult;

      switch (format) {
        case 'yaml':
          result = await exporter.exportToOpenAPI(state.records, options!);
          break;
        case 'json':
          result = await exporter.exportToJSON(state.records, options!);
          break;
        case 'raw':
          result = await exporter.exportRawData(state.records);
          break;
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

        const [recordingState, records] = await Promise.all([
          getRecordingState(),
          getRecords()
        ]);

        // 加载过滤选项（使用默认值）
        const defaultFilters: FilterOptions = {
          excludeStatic: true,
          ajaxOnly: true,
          duplicateRemoval: false,
          minResponseTime: 0,
          statusCodes: [200, 201, 400, 404, 500],
          domains: []
        };

        setState({
          recordingState,
          records,
          filterOptions: defaultFilters,
          loading: false,
          error: null
        });
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: (error as Error).message,
          loading: false
        }));
      }
    };

    initializeData();
  }, [getRecordingState, getRecords]);

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