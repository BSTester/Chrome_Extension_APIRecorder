import React, { useState, useEffect } from 'react';
import { RecordingState } from '../../types';
import SimpleGroupManager from './SimpleGroupManager';

interface RecordingControlsProps {
  recordingState: RecordingState | null;
  filteredRecordsCount?: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearRecords: () => void;
  onRefresh: () => void;
  loading?: boolean;
  onGroupChange?: () => void;
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  recordingState,
  filteredRecordsCount,
  onStartRecording,
  onStopRecording,
  onClearRecords,
  onRefresh,
  loading = false,
  onGroupChange
}) => {
  const isRecording = recordingState?.isRecording || false;
  // 优先使用过滤后的记录数量，如果没有则使用原始数量
  const recordCount = filteredRecordsCount ?? recordingState?.recordCount ?? 0;
  
  // 实时计时器状态
  const [realTimeDuration, setRealTimeDuration] = useState(0);
  
  // 实时更新计时器
  useEffect(() => {
    let timer: number | null = null;
    
    if (isRecording && recordingState?.startTime) {
      // 立即更新一次
      const updateDuration = () => {
        const now = Date.now();
        const elapsed = now - recordingState.startTime!;
        setRealTimeDuration(elapsed);
      };
      
      updateDuration();
      
      // 每秒更新一次
      timer = setInterval(updateDuration, 1000);
    } else {
      // 不在录制时，使用状态中的duration
      setRealTimeDuration(recordingState?.duration || 0);
    }
    
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isRecording, recordingState?.startTime, recordingState?.duration]);
  
  // 使用实时计算的duration
  const duration = isRecording ? realTimeDuration : (recordingState?.duration || 0);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  };

  return (
    <div className="p-4 border-b border-gray-200 bg-gray-50 px-6">
      <div className="space-y-4">
        {/* 第一行：录制状态和统计 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400'
            }`} />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-700">
                {isRecording ? '正在录制' : '录制已停止'}
              </span>
              {isRecording && duration > 0 && (
                <span className="text-xs text-gray-500">
                  {formatDuration(duration)}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-1">
            <span className="text-lg font-bold text-blue-600">{recordCount}</span>
            <span className="text-sm text-gray-500">个请求</span>
          </div>
        </div>

        {/* 第二行：分组管理和控制按钮 */}
        <div className="flex items-center justify-between">
          {/* 左侧：分组管理 */}
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">激活分组：</span>
            <SimpleGroupManager onGroupChange={onGroupChange} />
          </div>
          
          {/* 右侧：控制按钮 */}
          <div className="flex space-x-2">
            {!isRecording ? (
              <button
                onClick={onStartRecording}
                disabled={loading}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
                  loading 
                    ? 'bg-gray-400 cursor-not-allowed text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                )}
                <span>{loading ? '启动中...' : '开始录制'}</span>
              </button>
            ) : (
              <button
                onClick={onStopRecording}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                </svg>
                <span>停止录制</span>
              </button>
            )}

            <button
              onClick={onRefresh}
              disabled={loading}
              className={`px-3 py-2 rounded-lg transition-colors ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              title="刷新数据"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            </button>

            <button
              onClick={onClearRecords}
              disabled={loading || recordCount === 0}
              className={`px-3 py-2 rounded-lg transition-colors ${
                loading || recordCount === 0
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              }`}
              title="清空记录"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M10 5a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2H4z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* 状态提示 */}
        {isRecording && (
          <div className="text-xs text-gray-600 flex items-center space-x-1">
            <svg className="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>正在监听网络请求...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecordingControls;