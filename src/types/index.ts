// Type definitions for Chrome Extension API Recorder

// 请求记录数据结构
export interface RequestRecord {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  requestBody?: any;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  responseTime: number;
  pageUrl: string;
  pageTitle?: string;
}

// 会话元数据
export interface SessionMetadata {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalRequests: number;
  filteredRequests: number;
  targetDomains: string[];
}

// 过滤选项
export interface FilterOptions {
  excludeStatic: boolean;
  ajaxOnly: boolean;
  duplicateRemoval: boolean;
  minResponseTime: number;
  statusCodes: number[];
  domains: string[];
}

// 录制配置
export interface RecordingConfig {
  autoStart: boolean;
  maxRecords: number;
  retention: number;
  domains: string[];
}

// 导出配置
export interface ExportConfig {
  format: 'yaml' | 'json';
  includeExamples: boolean;
  parameterizeUrls: boolean;
  serverUrl: string;
  apiInfo: {
    title: string;
    version: string;
    description: string;
  };
}

// 录制状态
export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  recordCount: number;
  sessionId?: string;
  startTime?: number;
  pauseTime?: number;
  duration: number;
}

// 消息类型
export type MessageType = 
  | 'START_RECORDING'
  | 'STOP_RECORDING'
  | 'PAUSE_RECORDING'
  | 'RESUME_RECORDING'
  | 'GET_STATE'
  | 'GET_RECORDS'
  | 'CLEAR_RECORDS'
  | 'EXPORT_DATA'
  | 'UPDATE_FILTERS'
  | 'PAGE_INFO'
  | 'GET_PAGE_INFO'
  | 'RECORDING_STATUS_CHANGED'
  | 'TOGGLE_RECORDING'
  | 'OPEN_POPUP'
  | 'UPDATE_FLOATING_WIDGET'
  | 'FLOATING_WIDGET_ACTION';

// 消息结构
export interface Message {
  type: MessageType;
  data?: any;
}

// 页面信息
export interface PageInfo {
  url: string;
  title: string;
  timestamp: number;
}

// OpenAPI生成选项
export interface OpenAPIGenerateOptions {
  title: string;
  version: string;
  description?: string;
  serverUrl?: string;
  includeExamples: boolean;
  parameterizeUrls: boolean;
}

// 导出结果
export interface ExportResult {
  format: string;
  content: string;
  filename: string;
}

// 悬浮组件状态
export interface FloatingWidgetState {
  visible: boolean;
  expanded: boolean;
  position: {
    x: number;
    y: number;
  };
  recordingState: RecordingState;
}

// 悬浮组件操作类型
export type FloatingWidgetAction = 
  | 'toggle_recording'
  | 'open_popup'
  | 'toggle_expand'
  | 'update_position';

// 待处理请求接口
export interface PendingRequest {
  requestId: string;
  id: string;
  timestamp: number;
  method: string;
  url: string;
  headers?: Record<string, string>;
  requestBody?: any;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
}

// 请求统计信息
export interface RequestStats {
  total: number;
  filtered: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
}

// 录制配置选项
export interface RecordingOptions {
  maxRecords: number;
  enableFloatingWidget: boolean;
  autoSaveSession: boolean;
  debugMode: boolean;
}