import React from 'react';
import { RecordingState } from '../../types';

interface RecordingControlsProps {
  recordingState: RecordingState | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onClearRecords: () => void;
  onRefresh: () => void;
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  recordingState,
  onStartRecording,
  onStopRecording,
  onClearRecords,
  onRefresh
}) => {
  const isRecording = recordingState?.isRecording || false;
  const recordCount = recordingState?.recordCount || 0;

  const formatDuration = (startTime?: number) => {
    if (!startTime) return '';
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 border-b border-gray-200 bg-gray-50">
      {/* 录制状态指示器 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 recording-pulse' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium text-gray-700">
            {isRecording ? '正在录制' : '录制已停止'}
          </span>
          {isRecording && recordingState?.startTime && (
            <span className="text-sm text-gray-500">
              {formatDuration(recordingState.startTime)}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-1">
          <span className="text-lg font-bold text-blue-600">{recordCount}</span>
          <span className="text-sm text-gray-500">个请求</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex space-x-2">
        {!isRecording ? (
          <button
            onClick={onStartRecording}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
            </svg>
            <span>开始录制</span>
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
            <span>停止录制</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          title="刷新数据"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        </button>

        <button
          onClick={onClearRecords}
          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          title="清空记录"
          disabled={recordCount === 0}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3l1.586-1.586a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 111.414-1.414L8 9V6a1 1 0 011-1z" clipRule="evenodd" />
            <path d="M14 13v5a2 2 0 01-2 2H8a2 2 0 01-2-2v-5h8zM8 15a1 1 0 00-1 1v1a1 1 0 001 1h4a1 1 0 001-1v-1a1 1 0 00-1-1H8z" />
          </svg>
        </button>
      </div>

      {/* 会话信息 */}
      {recordingState?.sessionId && (
        <div className="mt-3 text-xs text-gray-500">
          会话 ID: {recordingState.sessionId.slice(-8)}
        </div>
      )}
    </div>
  );
};

export default RecordingControls;