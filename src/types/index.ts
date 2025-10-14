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
  // 新增：简化的请求参数信息
  requestParameters?: RequestParameters;
  // 保留必要的字段
  isSelected?: boolean;
  // 新增：自定义标签
  customTags?: string[];
  // 回放标记与来源
  isReplay?: boolean;
  sourceRecordId?: string;
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
  format: 'yaml' | 'json' | 'openapi';
  includeExamples: boolean;
  includeResponseExamples: boolean;
  parameterizeUrls: boolean;
  serverUrl: string;
  sanitizeData: boolean;
  sanitizationLevel: 'low' | 'medium' | 'high';
  multipleExamples: boolean;
  exampleDataSize: number;
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
  | 'GET_FILTERS'
  | 'PAGE_INFO'
  | 'GET_PAGE_INFO'
  | 'RECORDING_STATUS_CHANGED'
  | 'TOGGLE_RECORDING'
  | 'OPEN_POPUP'
  | 'OPEN_LARGE_INTERFACE'
  | 'UPDATE_FLOATING_WIDGET'
  | 'FLOATING_WIDGET_ACTION'
  // 新增消息类型
  | 'CREATE_TEST_SUITE'
  | 'UPDATE_TEST_SUITE'
  | 'DELETE_TEST_SUITE'
  | 'GET_TEST_SUITES'
  | 'SET_ACTIVE_SUITE'
  | 'SELECT_RECORDS'
  | 'EXPORT_PREVIEW'
  | 'SANITIZE_DATA'
  | 'EXTRACT_PARAMETERS'
  | 'GENERATE_EXAMPLES'
  // 标签管理消息
  | 'ADD_CUSTOM_TAGS'
  | 'REMOVE_CUSTOM_TAGS'
  | 'UPDATE_CUSTOM_TAGS'
  | 'GET_ALL_TAGS'
  // 新增：标签管理扩展
  | 'SET_ACTIVE_TAG'
  | 'GET_ACTIVE_TAG'
  | 'MOVE_RECORD_TO_TAG'
  // 新增：删除和去重功能
  | 'DELETE_TAG_AND_RECORDS'
  | 'DELETE_RECORDS'
  | 'DEDUPLICATE_RECORDS'
  | 'APPLY_ACTIVE_GROUP'
  | 'REPLAY_REQUEST'
  | 'SAVE_REPLAY_RECORD';

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
  includeResponseExamples: boolean;
  parameterizeUrls: boolean;
  sanitizeData: boolean;
  sanitizationLevel: 'low' | 'medium' | 'high';
  multipleExamples: boolean;
  exampleDataSize: number;
  selectedRecords?: string[];
  testSuiteId?: string;
}

// OpenAPI 2.0生成选项（更新版本）
export interface OpenAPIV2GenerateOptions extends OpenAPIGenerateOptions {
  openapiVersion: '2.0';
  produces?: string[];
  consumes?: string[];
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
  // 新增：解析后的数据
  parsedUrl?: {
    fullUrl: string;
    origin: string;
    pathname: string;
    queryParams: Record<string, string>;
    pathSegments: string[];
    pathParams: { name: string; value: string; type: 'id' | 'uuid' | 'string' }[];
  };
  parsedBody?: {
    raw?: any;
    parsed?: any;
    contentType?: string;
    formData?: Record<string, string>;
    jsonData?: any;
  };
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
  currentTestSuite?: string;
  autoClassification: boolean;
  extractFullParameters: boolean;
}

// 测试套件数据模型
export interface TestSuite {
  suiteId: string;
  suiteName: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  parentSuiteId?: string;
  isActive: boolean;
  requestCount: number;
}

// 请求参数详细信息（简化版）
export interface RequestParameters {
  query: Record<string, string>;  // query参数
  path: { name: string; value: string; type: 'id' | 'uuid' | 'string' }[];  // path参数
  headers: Record<string, string>;  // 自定义headers
  body?: any;  // 请求体
  form?: Record<string, string>;  // form data
  json?: any;  // JSON data
  // 附加信息
  contentType?: string;
  pathSegments?: string[];
  allHeaders?: Record<string, string>;
}

// 参数信息
export interface ParameterInfo {
  name: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'file';
  required: boolean;
  description?: string;
  example?: any;
  schema?: any;
}

// 提取的参数类型信息
export interface ExtractedParameters {
  pathVariables: PathVariable[];
  querySchema: any;
  bodySchema: any;
  headerSchema: any;
}

// 路径变量
export interface PathVariable {
  name: string;
  pattern: string;
  type: 'id' | 'uuid' | 'string' | 'number';
  example: string;
}

// 测试用例元数据
export interface TestCaseMetadata {
  caseName?: string;
  caseDescription?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  expectedResult?: string;
  testCategory?: string;
}

// 示例数据
export interface ExampleData {
  requestExample?: any;
  responseExample?: any;
  sanitizedData?: any;
  qualityScore: number;
  dataSize: number;
  isSensitive: boolean;
}

// 敏感数据配置
export interface SanitizationConfig {
  enableAutoDetection: boolean;
  sensitiveFields: string[];
  replacementPatterns: Record<string, string>;
  preserveFormat: boolean;
}

// 导出预览数据
export interface ExportPreview {
  summary: ExportSummary;
  requestExamples: Record<string, any>;
  responseExamples: Record<string, any>;
  sensitiveDataDetected: string[];
  documentStructure: DocumentStructure;
}

// 导出摘要
export interface ExportSummary {
  totalEndpoints: number;
  totalRecords: number;
  methodDistribution: Record<string, number>;
  statusCodeDistribution: Record<string, number>;
  domainDistribution: Record<string, number>;
}

// 文档结构
export interface DocumentStructure {
  paths: string[];
  tags: string[];
  components: string[];
  estimatedSize: number;
}

// 自定义标签管理
export interface CustomTag {
  id: string;
  name: string;
  color?: string;
  description?: string;
  createdAt: number;
  requestIds: string[];
  // 新增：显示状态
  isExpanded?: boolean;
  // 新增：是否为当前活跃标签（录制时自动归类）
  isActive?: boolean;
  // 新增：排序顺序
  order?: number;
}

// 标签操作请求
export interface TagOperationRequest {
  requestIds: string[];
  tagNames?: string[];
  tagId?: string;
}

// 去重配置
export interface DeduplicationConfig {
  enabled: boolean;
  byUrl: boolean;
  byMethod: boolean;
  byParameters: boolean;
  ignoreQueryOrder: boolean;
}