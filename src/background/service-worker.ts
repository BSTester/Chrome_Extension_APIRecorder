// Chrome Extension Service Worker
import {
  RequestRecord, 
  SessionMetadata, 
  FilterOptions, 
  RecordingState, 
  Message,
  PendingRequest,
  RecordingOptions,
  RequestParameters
} from '../types';
import { StorageManager } from '../storage/storage-manager';
import { RequestFilter } from '../utils/request-filter';

class ServiceWorker {
  private isRecording = false;
  private isPaused = false;
  private recordCount = 0;
  private sessionId?: string;
  private startTime?: number;
  private pauseTime?: number;
  private storageManager: StorageManager;
  private requestFilter: RequestFilter;
  private pendingRequests = new Map<string, PendingRequest>();
  private activeTagId?: string; // 新增：当前活跃标签
  private updateTimer?: number; // 添加定时器
  private recordingOptions: RecordingOptions = {
    maxRecords: 1000,
    enableFloatingWidget: true,
    autoSaveSession: true,
    debugMode: false, // 生产环境关闭调试模式
    autoClassification: true,
    extractFullParameters: true
  };
  private filterOptions: FilterOptions = {
    excludeStatic: true,
    ajaxOnly: false,
    duplicateRemoval: false,
    minResponseTime: 0,
    statusCodes: [],
    domains: []
  };

  constructor() {
    this.storageManager = new StorageManager();
    this.requestFilter = new RequestFilter();
    this.initializeListeners();
    this.loadState();
  }

  private initializeListeners() {
    chrome.runtime.onMessage.addListener(
      (message: Message, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );

    // 监听扩展按钮点击事件
    chrome.action.onClicked.addListener(() => {
      this.openFullPageTab();
    });

    chrome.webRequest.onBeforeRequest.addListener(
      (details) => { this.handleRequestStart(details); },
      { urls: ['<all_urls>'] },
      ['requestBody']
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => { this.handleRequestHeaders(details); },
      { urls: ['<all_urls>'] },
      ['requestHeaders']
    );

    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponseStart(details),
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    chrome.webRequest.onCompleted.addListener(
      (details) => { this.handleRequestComplete(details as any); },
      { urls: ['<all_urls>'] }
    );
  }

  private async loadState() {
    try {
      const state = await this.storageManager.getRecordingState();
      if (state) {
        this.isRecording = state.isRecording;
        this.isPaused = state.isPaused || false;
        this.sessionId = state.sessionId;
        this.startTime = state.startTime;
        this.pauseTime = state.pauseTime;
        
        // 获取实际记录数量而不是使用保存的计数
        const allRecords = await this.storageManager.getAllRecords();
        this.recordCount = allRecords.length;
      }

      const filters = await this.storageManager.getFilterOptions();
      if (filters) {
        this.filterOptions = filters;
      }
      
      const options = await this.storageManager.getConfig('recordingOptions');
      if (options) {
        this.recordingOptions = { ...this.recordingOptions, ...options };
      }
      
      // 加载活跃标签
      this.activeTagId = await this.storageManager.getConfig('activeTagId');
    } catch (error) {
      console.error('Failed to load state:', error);
    }
  }

  private async saveState() {
    const state: RecordingState = {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      recordCount: this.recordCount,
      sessionId: this.sessionId,
      startTime: this.startTime,
      pauseTime: this.pauseTime,
      duration: this.getState().duration
    };

    try {
      await this.storageManager.saveRecordingState(state);
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  private async handleMessage(message: Message, sendResponse: (response: any) => void) {
    try {
      switch (message.type) {
        case 'START_RECORDING':
          await this.startRecording();
          sendResponse({ success: true, state: this.getState() });
          await this.notifyContentScript();
          break;

    // 新增：原子应用激活分组与展开状态（前端直传已计算好的状态）
    case 'APPLY_ACTIVE_GROUP': {
      try {
        const { activeGroupId, customTags } = message.data || {};
        if (!Array.isArray(customTags)) {
          sendResponse({ success: false, error: 'customTags 必须为数组' });
          return true;
        }
        // 仅允许一个 isActive 和一个 isExpanded
        let activeCount = 0;
        let expandCount = 0;
        const normalized = customTags.map((t: any) => {
          const isActive = !!t.isActive;
          const isExpanded = !!t.isExpanded;
          if (isActive) activeCount += 1;
          if (isExpanded) expandCount += 1;
          return { ...t, isActive, isExpanded };
        });
        // 容错：若未标记展开，则让激活的同名展开；若多于一个，保留第一个
        if (expandCount === 0 && activeGroupId) {
          const idx = normalized.findIndex((t: any) => t.id === activeGroupId);
          if (idx >= 0) normalized[idx].isExpanded = true;
        } else if (expandCount > 1) {
          let first = true;
          normalized.forEach((t: any) => {
            if (t.isExpanded) {
              if (first) first = false;
              else t.isExpanded = false;
            }
          });
        }
        // 同步到 StorageManager 与本地状态，确保前端 GET_ACTIVE_TAG 读取到一致的权威状态
        this.activeTagId = activeGroupId ?? undefined;
        await this.storageManager.saveConfig('activeTagId', activeGroupId ?? null);
        await this.storageManager.saveConfig('customTags', normalized);

        // 原子写入到 chrome.storage.local，触发前端单次变更（互斥展开/唯一激活）
        await chrome.storage.local.set({
          activeGroupId: activeGroupId ?? null,
          customTags: normalized
        });

        sendResponse({ success: true });
      } catch (e: any) {
        sendResponse({ success: false, error: e?.message || 'APPLY_ACTIVE_GROUP 失败' });
      }
      return true;
    }
      break;

        case 'STOP_RECORDING':
          await this.stopRecording();
          sendResponse({ success: true, state: this.getState() });
          await this.notifyContentScript();
          break;

        case 'PAUSE_RECORDING':
          await this.pauseRecording();
          sendResponse({ success: true, state: this.getState() });
          await this.notifyContentScript();
          break;

        case 'RESUME_RECORDING':
          await this.resumeRecording();
          sendResponse({ success: true, state: this.getState() });
          await this.notifyContentScript();
          break;

        case 'GET_STATE':
          sendResponse({ success: true, state: this.getState() });
          break;

        case 'GET_RECORDS':
          const records = await this.storageManager.getAllRecords();
          sendResponse({ success: true, records });
          break;

        case 'CLEAR_RECORDS':
          await this.storageManager.clearAllRecords();
          // 只有手动清除记录时才重置统计信息
          this.recordCount = 0;
          await this.saveState();
          sendResponse({ success: true });
          await this.notifyContentScript();
          break;

        case 'UPDATE_FILTERS':
          this.filterOptions = { ...this.filterOptions, ...message.data };
          await this.storageManager.saveFilterOptions(this.filterOptions);
          sendResponse({ success: true });
          break;

        case 'GET_FILTERS':
          const savedFilters = await this.storageManager.getFilterOptions();
          sendResponse({ success: true, filters: savedFilters });
          break;

        case 'TOGGLE_RECORDING':
          if (this.isRecording) {
            if (this.isPaused) {
              await this.resumeRecording();
            } else {
              await this.pauseRecording();
            }
          } else {
            await this.startRecording();
          }
          sendResponse({ success: true, state: this.getState() });
          await this.notifyContentScript();
          break;

        case 'OPEN_POPUP': {
          try {
            const baseUrl = chrome.runtime.getURL('index.html');
            const patterns = [baseUrl, `${baseUrl}*`]; // 兼容 index.html#/… 等路由
            const tabs = await chrome.tabs.query({ url: patterns });
            // 优先选择已激活的匹配标签，否则取第一个
            const target = tabs.find(t => t.active) ?? tabs[0];

            if (target?.id) {
              await chrome.tabs.update(target.id, { active: true });
              if (target.windowId !== undefined) {
                await chrome.windows.update(target.windowId, { focused: true });
              }
            } else {
              await chrome.tabs.create({ url: baseUrl, active: true });
            }
            sendResponse({ success: true });
          } catch (e) {
            console.error('Failed to open/focus popup page:', e);
            sendResponse({ success: false, error: 'OPEN_POPUP failed' });
          }
          break;
        }

        case 'OPEN_LARGE_INTERFACE':
          await this.openLargeInterface();
          sendResponse({ success: true });
          break;

        case 'FLOATING_WIDGET_ACTION':
          await this.handleFloatingWidgetAction(message.data);
          sendResponse({ success: true, state: this.getState() });
          break;
          
        case 'SELECT_RECORDS':
          await this.handleSelectRecords(message.data);
          sendResponse({ success: true });
          break;

        case 'ADD_CUSTOM_TAGS':
          await this.handleAddCustomTags(message.data);
          sendResponse({ success: true });
          break;

        case 'REMOVE_CUSTOM_TAGS':
          await this.handleRemoveCustomTags(message.data);
          sendResponse({ success: true });
          break;

        case 'UPDATE_CUSTOM_TAGS':
          await this.handleUpdateCustomTags(message.data);
          sendResponse({ success: true });
          break;

        case 'GET_ALL_TAGS':
          const allTags = await this.getAllCustomTags();
          sendResponse({ success: true, tags: allTags });
          break;

        case 'SET_ACTIVE_TAG':
          await this.setActiveTag(message.data.tagId);
          sendResponse({ success: true });
          break;

        case 'GET_ACTIVE_TAG':
          const activeTag = await this.getActiveTag();
          sendResponse({ success: true, activeTag });
          break;

        case 'MOVE_RECORD_TO_TAG':
          await this.moveRecordToTag(message.data.recordId, message.data.fromTagId, message.data.toTagId);
          sendResponse({ success: true });
          break;

        case 'DELETE_TAG_AND_RECORDS':
          await this.deleteTagAndRecords(message.data.tagId);
          sendResponse({ success: true });
          break;

        case 'DELETE_RECORDS':
          await this.deleteRecords(message.data.recordIds);
          sendResponse({ success: true });
          break;

        case 'DEDUPLICATE_RECORDS':
          const deduplicatedRecords = await this.deduplicateRecords();
          sendResponse({ success: true, removedCount: deduplicatedRecords.removedCount });
          break;

        case 'REPLAY_REQUEST': {
          const { method, url, headers, body } = message.data || {};
          try {
            const result = await this.performReplay({ method, url, headers, body });
            sendResponse({ success: true, result });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || '回放失败' });
          }
          break;
        }

        case 'SAVE_REPLAY_RECORD': {
          try {
            const { sourceRecordId, method, url, headers, body, replay } = message.data || {};
            if (!replay || !method || !url) {
              sendResponse({ success: false, error: '缺少必要数据' });
              break;
            }
            const newId = `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const record: RequestRecord = {
              id: newId,
              timestamp: Date.now(),
              method,
              url,
              headers: headers || {},
              requestBody: body,
              responseStatus: replay.status,
              responseHeaders: replay.headers || {},
              responseBody: replay.bodySnippet, // 保存片段
              responseTime: replay.duration || 0,
              pageUrl: url,
              pageTitle: '',
              isSelected: false,
              customTags: ['Replay'],
              isReplay: true,
              sourceRecordId
            };
            await this.storageManager.saveOrUpdateRecord(record);
            this.recordCount++;
            await this.saveState();
            await this.notifyContentScript();
            sendResponse({ success: true, id: newId });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || '保存回放记录失败' });
          }
          break;
        }

        case 'UPDATE_RECORD_TITLE': {
          try {
            const { recordId, customTitle } = message.data || {};
            if (!recordId) {
              sendResponse({ success: false, error: '缺少记录ID' });
              break;
            }
            
            // 获取所有记录并找到目标记录
            const allRecords = await this.storageManager.getAllRecords();
            const recordIndex = allRecords.findIndex(r => r.id === recordId);
            if (recordIndex === -1) {
              sendResponse({ success: false, error: '记录不存在' });
              break;
            }
            
            // 更新记录的自定义标题
            const updatedRecord = { ...allRecords[recordIndex], customTitle: customTitle || undefined };
            allRecords[recordIndex] = updatedRecord;
            
            // 保存更新后的记录
            await this.storageManager.saveOrUpdateRecord(updatedRecord);
            
            // 通知内容脚本更新
            await this.notifyContentScript();
            
            sendResponse({ success: true });
          } catch (e: any) {
            sendResponse({ success: false, error: e?.message || '更新记录标题失败' });
          }
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      if (this.recordingOptions.debugMode) {
        console.log('Debug - Message details:', message);
      }
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  private async startRecording() {
    this.isRecording = true;
    this.isPaused = false;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.pauseTime = undefined;
    this.recordCount = 0;
    this.pendingRequests.clear();

    const metadata: SessionMetadata = {
      sessionId: this.sessionId,
      startTime: this.startTime,
      totalRequests: 0,
      filteredRequests: 0,
      targetDomains: this.filterOptions.domains
    };

    await this.storageManager.saveSessionMetadata(metadata);
    await this.saveState();
    
    // 启动定时器，每秒更新状态
    this.startUpdateTimer();
    
    if (this.recordingOptions.debugMode) {
      console.log('Recording started:', { sessionId: this.sessionId, startTime: this.startTime });
    }
  }

  private async stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isPaused = false;
    
    // 停止定时器
    this.stopUpdateTimer();
    
    if (this.sessionId) {
      const metadata = await this.storageManager.getSessionMetadata(this.sessionId);
      if (metadata) {
        metadata.endTime = Date.now();
        await this.storageManager.saveSessionMetadata(metadata);
      }
    }

    // 保持记录计数不变，停止录制不清零统计信息
    // this.recordCount 保持当前值
    this.pendingRequests.clear();
    await this.saveState();
    
    if (this.recordingOptions.debugMode) {
      console.log('Recording stopped:', { sessionId: this.sessionId, recordCount: this.recordCount });
    }
  }

  private getState(): RecordingState {
    const now = Date.now();
    let duration = 0;
    
    if (this.startTime) {
      if (this.isPaused && this.pauseTime) {
        duration = this.pauseTime - this.startTime;
      } else if (this.isRecording) {
        duration = now - this.startTime;
      }
    }

    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      recordCount: this.recordCount,
      sessionId: this.sessionId,
      startTime: this.startTime,
      pauseTime: this.pauseTime,
      duration
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleRequestStart(details: chrome.webRequest.WebRequestBodyDetails) {
    if (!this.isRecording || this.isPaused) return;

    if (!this.requestFilter.shouldRecord(details, this.filterOptions)) {
      if (this.recordingOptions.debugMode) {
        console.log('Filtered out request (initial):', details.url);
      }
      return;
    }

    const urlData = this.parseUrlData(details.url);
    const bodyData = this.parseRequestBody(details.requestBody as any);

    const pendingRequest: PendingRequest = {
      requestId: details.requestId,
      id: `${details.requestId}_${Date.now()}`,
      timestamp: Date.now(),
      method: details.method,
      url: details.url,
      requestBody: details.requestBody,
      parsedUrl: urlData,
      parsedBody: bodyData
    };

    this.pendingRequests.set(details.requestId, pendingRequest);
    
    if (this.recordingOptions.debugMode) {
      console.log('Request started:', { 
        requestId: details.requestId, 
        url: details.url,
        queryParams: urlData.queryParams,
        bodyData: bodyData
      });
    }
  }

  private async handleRequestHeaders(details: chrome.webRequest.WebRequestHeadersDetails) {
    if (!this.isRecording || this.isPaused) return;

    const pendingRequest = this.pendingRequests.get(details.requestId);
    if (!pendingRequest) {
      if (this.recordingOptions.debugMode) {
        console.log('No pending request found for headers:', details.requestId);
      }
      return;
    }

    const headers = this.parseHeaders(details.requestHeaders || []);
    pendingRequest.headers = headers;
    
    this.pendingRequests.set(details.requestId, pendingRequest);
    
    if (this.recordingOptions.debugMode) {
      console.log('Request headers updated:', { requestId: details.requestId, headerCount: Object.keys(headers).length });
    }
  }

  private async handleResponseStart(details: chrome.webRequest.WebResponseDetails) {
    if (!this.isRecording || this.isPaused) return;

    const pendingRequest = this.pendingRequests.get(details.requestId);
    if (!pendingRequest) {
      if (this.recordingOptions.debugMode) {
        console.log('No pending request found for response:', details.requestId);
      }
      return;
    }

    const responseHeaders = this.parseHeaders((details as any).responseHeaders || []);
    pendingRequest.responseStatus = details.statusCode;
    pendingRequest.responseHeaders = responseHeaders;
    
    this.pendingRequests.set(details.requestId, pendingRequest);
    
    if (this.recordingOptions.debugMode) {
      console.log('Response started:', { requestId: details.requestId, status: details.statusCode });
    }
  }

  private async handleRequestComplete(details: chrome.webRequest.WebRequestFullDetails) {
    if (!this.isRecording || this.isPaused) return;

    try {
      const pendingRequest = this.pendingRequests.get(details.requestId);
      if (!pendingRequest) {
        if (this.recordingOptions.debugMode) {
          console.log('No pending request found for completion:', details.requestId);
        }
        return;
      }

      const responseTime = Date.now() - pendingRequest.timestamp;

      if (responseTime < this.filterOptions.minResponseTime) {
        this.pendingRequests.delete(details.requestId);
        if (this.recordingOptions.debugMode) {
          console.log('Request filtered by response time:', { requestId: details.requestId, responseTime });
        }
        return;
      }

      const requestParameters = this.extractAllParameters(pendingRequest);
      
      const record: RequestRecord = {
        id: pendingRequest.id,
        timestamp: pendingRequest.timestamp,
        method: pendingRequest.method,
        url: pendingRequest.url,
        headers: pendingRequest.headers || {},
        requestBody: pendingRequest.requestBody,
        responseStatus: pendingRequest.responseStatus || (details as any).statusCode,
        responseHeaders: pendingRequest.responseHeaders || {},
        responseTime,
        pageUrl: (details as any).documentUrl || details.url,
        pageTitle: '',
        requestParameters: requestParameters
      };

      if (this.requestFilter.shouldSaveRecord(record, this.filterOptions)) {
        if (this.recordCount >= this.recordingOptions.maxRecords) {
          console.warn('Maximum record limit reached:', this.recordingOptions.maxRecords);
          await this.stopRecording();
          return;
        }

        // 检查是否启用去重功能
        if (this.filterOptions.duplicateRemoval) {
          // 获取已存在的记录用于去重检查
          const existingRecords = await this.storageManager.getAllRecords();
          if (this.requestFilter.isDuplicateRequest(record, existingRecords)) {
            if (this.recordingOptions.debugMode) {
              console.log('Request filtered as duplicate:', { url: record.url, method: record.method });
            }
            this.pendingRequests.delete(details.requestId);
            return;
          }
        }

        // 如果有活跃标签，先更新记录标签信息
        if (this.activeTagId) {
          if (this.recordingOptions.debugMode) {
            console.log('Adding record to active tag:', { recordId: record.id, activeTagId: this.activeTagId });
          }
          await this.addRecordToActiveTag(record);
        } else if (this.recordingOptions.debugMode) {
          console.log('No active tag ID set, record will not be auto-tagged');
        }
        
        // 保存记录（使用 put 而不是 add 以避免重复键错误）
        await this.storageManager.saveOrUpdateRecord(record);
        this.recordCount++;
        
        await this.saveState();

        if (this.sessionId) {
          const metadata = await this.storageManager.getSessionMetadata(this.sessionId);
          if (metadata) {
            metadata.filteredRequests++;
            await this.storageManager.saveSessionMetadata(metadata);
          }
        }

        await this.notifyContentScript();
        
        if (this.recordingOptions.debugMode) {
          console.log('Request saved with parameters:', { 
            id: record.id, 
            url: record.url, 
            count: this.recordCount,
            parameters: requestParameters 
          });
        }
      } else if (this.recordingOptions.debugMode) {
        console.log('Request filtered by final check:', details.url);
      }

      this.pendingRequests.delete(details.requestId);

    } catch (error) {
      console.error('Error handling request complete:', error);
      if (this.recordingOptions.debugMode) {
        console.log('Debug - Request details:', details);
      }
      this.pendingRequests.delete(details.requestId);
    }
  }

  private parseHeaders(headers: chrome.webRequest.HttpHeader[]): Record<string, string> {
    const parsed: Record<string, string> = {};
    headers.forEach(header => {
      if (header.name && header.value) {
        // 保持请求头名称的原始大小写
        parsed[header.name] = header.value;
      }
    });
    return parsed;
  }

  private parseUrlData(url: string) {
    try {
      const urlObj = new URL(url);
      const queryParams: Record<string, string> = {};
      
      urlObj.searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });
      
      const pathSegments = urlObj.pathname.split('/').filter(Boolean);
      
      const pathParams: { name: string; value: string; type: 'id' | 'uuid' | 'string' }[] = [];
      pathSegments.forEach((segment) => {
        if (/^\d+$/.test(segment)) {
          pathParams.push({
            name: `id${pathParams.filter(p => p.type === 'id').length + 1}`,
            value: segment,
            type: 'id'
          });
        } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          pathParams.push({
            name: `uuid${pathParams.filter(p => p.type === 'uuid').length + 1}`,
            value: segment,
            type: 'uuid'
          });
        } else if (segment.length > 10 || /[^a-zA-Z0-9]/.test(segment)) {
          pathParams.push({
            name: `param${pathParams.filter(p => p.type === 'string').length + 1}`,
            value: segment,
            type: 'string'
          });
        }
      });
      
      return {
        fullUrl: url,
        origin: urlObj.origin,
        pathname: urlObj.pathname,
        queryParams,
        pathSegments,
        pathParams
      };
    } catch (error) {
      if (this.recordingOptions.debugMode) {
        console.warn('Failed to parse URL:', url, error);
      }
      return {
        fullUrl: url,
        origin: '',
        pathname: '',
        queryParams: {},
        pathSegments: [],
        pathParams: []
      };
    }
  }

  private parseRequestBody(requestBody?: any) {
    if (!requestBody || !requestBody.formData && !requestBody.raw) {
      return {};
    }

    const result: any = {
      raw: requestBody
    };

    try {
      if (requestBody.formData) {
        const formData: Record<string, string> = {};
        Object.entries(requestBody.formData).forEach(([key, values]) => {
          if (Array.isArray(values) && values.length > 0) {
            formData[key] = values[0];
          }
        });
        result.formData = formData;
        result.parsed = formData;
        result.contentType = 'application/x-www-form-urlencoded';
      }
      
      if (requestBody.raw && requestBody.raw.length > 0) {
        const rawData = requestBody.raw[0];
        if (rawData.bytes) {
          const decoder = new TextDecoder('utf-8');
          const textData = decoder.decode(rawData.bytes);
          
          try {
            const jsonData = JSON.parse(textData);
            result.jsonData = jsonData;
            result.parsed = jsonData;
            result.contentType = 'application/json';
          } catch {
            result.parsed = textData;
            result.contentType = 'text/plain';
          }
        }
      }
    } catch (error) {
      if (this.recordingOptions.debugMode) {
        console.warn('Failed to parse request body:', error);
      }
    }

    return result;
  }

  private extractAllParameters(pendingRequest: PendingRequest): RequestParameters {
    const headers = pendingRequest.headers || {};
    const urlData = pendingRequest.parsedUrl;
    const bodyData = pendingRequest.parsedBody;
    
    const standardHeaders = new Set([
      'accept', 'accept-encoding', 'accept-language', 'authorization',
      'cache-control', 'connection', 'content-length', 'content-type',
      'cookie', 'host', 'origin', 'referer', 'user-agent', 'x-requested-with'
    ]);
    
    const customHeaders: Record<string, string> = {};
    Object.entries(headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (!standardHeaders.has(lowerKey) && !lowerKey.startsWith('sec-')) {
        customHeaders[key] = value;
      }
    });
    
    return {
      query: urlData?.queryParams || {},
      path: urlData?.pathParams || [],
      headers: customHeaders,
      body: bodyData?.parsed,
      form: bodyData?.formData,
      json: bodyData?.jsonData,
      contentType: bodyData?.contentType || this.getHeaderValue(headers, 'content-type') || '',
      pathSegments: urlData?.pathSegments || [],
      allHeaders: headers
    };
  }

  // 新增辅助方法：大小写不敏感的请求头值获取
  private getHeaderValue(headers: Record<string, string>, headerName: string): string | undefined {
    const lowerHeaderName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerHeaderName) {
        return value;
      }
    }
    return undefined;
  }

  private async pauseRecording() {
    if (!this.isRecording || this.isPaused) return;
    
    this.isPaused = true;
    this.pauseTime = Date.now();
    await this.saveState();
    
    if (this.recordingOptions.debugMode) {
      console.log('Recording paused');
    }
  }

  private async resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;
    
    this.isPaused = false;
    if (this.startTime && this.pauseTime) {
      const pauseDuration = Date.now() - this.pauseTime;
      this.startTime += pauseDuration;
    }
    this.pauseTime = undefined;
    await this.saveState();
    
    if (this.recordingOptions.debugMode) {
      console.log('Recording resumed');
    }
  }

  private async notifyContentScript() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const state = this.getState();
      
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STATUS_CHANGED',
            data: state
          }).catch(() => {
            // 忽略错误
          });
        }
      }
      
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_FLOATING_WIDGET',
            data: {
              recordingState: state
            }
          }).catch(() => {
            // 忽略错误
          });
        }
      }
    } catch (error) {
      if (this.recordingOptions.debugMode) {
        console.log('Failed to notify content script:', error);
      }
    }
  }

  // 打开全屏界面作为新标签页
  private async openFullPageTab() {
    try {
      const url = chrome.runtime.getURL('index.html');
      await chrome.tabs.create({
        url: url,
        active: true
      });
    } catch (error) {
      console.error('Failed to open full page tab:', error);
    }
  }

  // 打开大屏幕界面
  private async openLargeInterface() {
    try {
      const url = chrome.runtime.getURL('index.html');
      
      // 获取当前屏幕信息
      const screens = await chrome.system.display.getInfo();
      const primaryScreen = screens.find(screen => screen.isPrimary) || screens[0];
      
      if (primaryScreen) {
        // 创建全屏窗口
        await chrome.windows.create({
          url: url,
          type: 'popup',
          width: primaryScreen.workArea.width,
          height: primaryScreen.workArea.height,
          left: primaryScreen.workArea.left,
          top: primaryScreen.workArea.top,
          focused: true,
          state: 'maximized'
        });
      } else {
        // 备用方案：创建标准新标签页
        await chrome.tabs.create({
          url: url,
          active: true
        });
      }
    } catch (error) {
      console.error('Failed to open large interface:', error);
      // 如果窗口创建失败，回退到标签页
      try {
        const url = chrome.runtime.getURL('index.html');
        await chrome.tabs.create({
          url: url,
          active: true
        });
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
      }
    }
  }

  private async handleFloatingWidgetAction(data: any) {
    const { action, payload } = data;
    
    switch (action) {
      case 'toggle_recording':
        if (this.isRecording) {
          await this.stopRecording();
        } else {
          await this.startRecording();
        }
        break;
        
      case 'open_popup': {
        try {
          const url = chrome.runtime.getURL('index.html');
          const tabs = await chrome.tabs.query({ url });
          if (tabs.length > 0 && tabs[0].id) {
            await chrome.tabs.update(tabs[0].id, { active: true });
            if (tabs[0].windowId !== undefined) {
              await chrome.windows.update(tabs[0].windowId, { focused: true });
            }
          } else {
            await chrome.tabs.create({ url, active: true });
          }
        } catch (e) {
          console.error('Failed to open/focus popup page:', e);
        }
        break;
      }
        
      case 'toggle_expand':
        break;
        
      case 'update_position':
        if (payload && payload.position) {
          await this.storageManager.saveConfig('floatingWidgetPosition', payload.position);
        }
        break;
    }
    
    await this.notifyContentScript();
  }

  private async handleSelectRecords(data: { recordIds: string[], selected: boolean }): Promise<void> {
    const { recordIds, selected } = data;
    const allRecords = await this.storageManager.getAllRecords();
    
    for (const recordId of recordIds) {
      const record = allRecords.find(r => r.id === recordId);
      if (record) {
        record.isSelected = selected;
        await this.storageManager.saveRecord(record);
      }
    }
  }

  private async handleAddCustomTags(data: { recordIds: string[], tagNames: string[] }): Promise<void> {
    const { recordIds, tagNames } = data;
    const allRecords = await this.storageManager.getAllRecords();
    
    for (const recordId of recordIds) {
      const record = allRecords.find(r => r.id === recordId);
      if (record) {
        // 初始化customTags如果不存在
        if (!record.customTags) {
          record.customTags = [];
        }
        
        // 添加新标签，避免重复
        for (const tagName of tagNames) {
          if (!record.customTags.includes(tagName)) {
            record.customTags.push(tagName);
          }
        }
        
        await this.storageManager.saveRecord(record);
      }
    }
  }

  private async handleRemoveCustomTags(data: { recordIds: string[], tagNames: string[] }): Promise<void> {
    const { recordIds, tagNames } = data;
    const allRecords = await this.storageManager.getAllRecords();
    
    for (const recordId of recordIds) {
      const record = allRecords.find(r => r.id === recordId);
      if (record && record.customTags) {
        // 移除指定标签
        record.customTags = record.customTags.filter(tag => !tagNames.includes(tag));
        await this.storageManager.saveRecord(record);
      }
    }
  }

  private async handleUpdateCustomTags(data: { recordIds: string[], tagNames: string[] }): Promise<void> {
    const { recordIds, tagNames } = data;
    const allRecords = await this.storageManager.getAllRecords();
    
    for (const recordId of recordIds) {
      const record = allRecords.find(r => r.id === recordId);
      if (record) {
        // 更新标签列表
        record.customTags = [...tagNames];
        await this.storageManager.saveRecord(record);
      }
    }
  }

  private async getAllCustomTags(): Promise<string[]> {
    const allRecords = await this.storageManager.getAllRecords();
    const tagsSet = new Set<string>();
    
    allRecords.forEach(record => {
      if (record.customTags) {
        record.customTags.forEach(tag => tagsSet.add(tag));
      }
    });
    
    return Array.from(tagsSet).sort();
  }

  private async setActiveTag(tagId: string): Promise<void> {
    this.activeTagId = tagId;
    await this.storageManager.saveConfig('activeTagId', tagId);
    
    // 更新所有标签的活跃状态
    const customTags = await this.storageManager.getConfig('customTags') || [];
    const updatedTags = customTags.map((tag: any) => ({
      ...tag,
      isActive: tag.id === tagId
    }));
    await this.storageManager.saveConfig('customTags', updatedTags);

    // 同步到 chrome.storage.local，确保唯一激活并触发前端监听
    try {
      const localResult = await chrome.storage.local.get(['customTags']);
      const localTags = localResult.customTags || [];
      const localUpdated = localTags.map((tag: any) => ({
        ...tag,
        isActive: tag.id === tagId
      }));
      await chrome.storage.local.set({ activeGroupId: tagId, customTags: localUpdated });
    } catch (e) {
      console.warn('Failed to sync activeGroupId/customTags to chrome.storage.local:', e);
    }
  }

  private async getActiveTag(): Promise<any> {
    const customTags = await this.storageManager.getConfig('customTags') || [];
    return customTags.find((tag: any) => tag.isActive) || null;
  }

  private async moveRecordToTag(recordId: string, fromTagId: string | null, toTagId: string | null): Promise<void> {
    const allRecords = await this.storageManager.getAllRecords();
    const record = allRecords.find(r => r.id === recordId);
    
    if (!record) return;
    
    if (!record.customTags) {
      record.customTags = [];
    }
    
    // 从原标签中移除
    if (fromTagId) {
      const customTags = await this.storageManager.getConfig('customTags') || [];
      const fromTag = customTags.find((tag: any) => tag.id === fromTagId);
      if (fromTag) {
        fromTag.requestIds = fromTag.requestIds.filter((id: string) => id !== recordId);
        record.customTags = record.customTags.filter(tagName => tagName !== fromTag.name);
      }
    }
    
    // 添加到新标签
    if (toTagId) {
      const customTags = await this.storageManager.getConfig('customTags') || [];
      const toTag = customTags.find((tag: any) => tag.id === toTagId);
      if (toTag) {
        if (!toTag.requestIds.includes(recordId)) {
          toTag.requestIds.push(recordId);
        }
        if (!record.customTags.includes(toTag.name)) {
          record.customTags.push(toTag.name);
        }
      }
      
      await this.storageManager.saveConfig('customTags', customTags);
    }
    
    await this.storageManager.saveRecord(record);
  }

  private async addRecordToActiveTag(record: RequestRecord): Promise<void> {
    if (!this.activeTagId) {
      if (this.recordingOptions.debugMode) {
        console.log('No active tag ID set, skipping auto-tag assignment');
      }
      return;
    }
    
    // 先从 chrome.storage.local 获取最新数据（与前端同步）
    const result = await chrome.storage.local.get(['customTags']);
    const customTags = result.customTags || [];
    const activeTag = customTags.find((tag: any) => tag.id === this.activeTagId);
    
    if (activeTag) {
      // 添加到标签的请求列表
      if (!activeTag.requestIds.includes(record.id)) {
        activeTag.requestIds.push(record.id);
      }
      
      // 更新记录的标签
      if (!record.customTags) {
        record.customTags = [];
      }
      if (!record.customTags.includes(activeTag.name)) {
        record.customTags.push(activeTag.name);
      }
      
      // 同时保存到两个存储位置以保持同步
      await chrome.storage.local.set({ customTags });
      await this.storageManager.saveConfig('customTags', customTags);
      
      if (this.recordingOptions.debugMode) {
        console.log('Successfully added record to active tag:', {
          recordId: record.id,
          activeTagId: this.activeTagId,
          tagName: activeTag.name,
          recordTags: record.customTags
        });
      }
    } else {
      if (this.recordingOptions.debugMode) {
        console.warn('Active tag not found in customTags:', this.activeTagId, 'Available tags:', customTags.map((t: any) => t.id));
      }
    }
  }

  private async deleteTagAndRecords(tagId: string): Promise<void> {
    // 获取标签信息
    const customTags = await this.storageManager.getConfig('customTags') || [];
    const tagToDelete = customTags.find((tag: any) => tag.id === tagId);
    
    if (!tagToDelete) return;
    
    // 删除标签下的所有记录
    if (tagToDelete.requestIds && tagToDelete.requestIds.length > 0) {
      await this.deleteRecords(tagToDelete.requestIds);
    }
    
    // 删除标签
    const updatedTags = customTags.filter((tag: any) => tag.id !== tagId);
    await this.storageManager.saveConfig('customTags', updatedTags);
    
    // 如果删除的是活跃标签，清除活跃状态
    if (this.activeTagId === tagId) {
      this.activeTagId = undefined;
      await this.storageManager.saveConfig('activeTagId', null);
    }
  }

  private async deleteRecords(recordIds: string[]): Promise<void> {
    const allRecords = await this.storageManager.getAllRecords();
    
    // 过滤出要保留的记录
    const recordsToKeep = allRecords.filter(record => !recordIds.includes(record.id));
    
    // 清空所有记录
    await this.storageManager.clearAllRecords();
    
    // 重新保存要保留的记录
    for (const record of recordsToKeep) {
      await this.storageManager.saveRecord(record);
    }
    
    // 更新计数
    this.recordCount = recordsToKeep.length;
    await this.saveState();
  }

  private async deduplicateRecords(): Promise<{ removedCount: number }> {
    const allRecords = await this.storageManager.getAllRecords();
    const originalCount = allRecords.length;
    
    // 使用相同的去重算法
    const uniqueRecords = this.deduplicateRequestsInternal(allRecords);
    const removedCount = originalCount - uniqueRecords.length;
    
    if (removedCount > 0) {
      // 清空所有记录
      await this.storageManager.clearAllRecords();
      
      // 重新保存去重后的记录
      for (const record of uniqueRecords) {
        await this.storageManager.saveRecord(record);
      }
      
      // 更新计数
      this.recordCount = uniqueRecords.length;
      await this.saveState();
      
      // 更新所有标签的请求ID列表
      await this.updateTagsAfterDeduplication(uniqueRecords);
    }
    
    return { removedCount };
  }

  private deduplicateRequestsInternal(records: RequestRecord[]): RequestRecord[] {
    const seen = new Map<string, RequestRecord>();
    
    records.forEach(record => {
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
          const existingParamCount = this.getParameterCount(existing);
          const currentParamCount = this.getParameterCount(record);
          
          if (currentParamCount > existingParamCount) {
            seen.set(uniqueKey, record);
          }
        }
      } catch (error) {
        // URL解析失败，保留原记录
        const uniqueKey = `${record.method}:${record.url}`;
        if (!seen.has(uniqueKey)) {
          seen.set(uniqueKey, record);
        }
      }
    });
    
    return Array.from(seen.values());
  }

  private getParameterCount(record: RequestRecord): number {
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
  }

  private async updateTagsAfterDeduplication(remainingRecords: RequestRecord[]): Promise<void> {
    const customTags = await this.storageManager.getConfig('customTags') || [];
    const remainingRecordIds = new Set(remainingRecords.map(r => r.id));
    
    // 更新每个标签的请求ID列表
    const updatedTags = customTags.map((tag: any) => ({
      ...tag,
      requestIds: tag.requestIds.filter((id: string) => remainingRecordIds.has(id))
    }));
    
    await this.storageManager.saveConfig('customTags', updatedTags);
  }

  // 定时器相关方法
  private startUpdateTimer() {
    // 清除旧的定时器
    this.stopUpdateTimer();
    
    // 启动新的定时器，每秒更新一次
    this.updateTimer = setInterval(() => {
      this.broadcastRecordingState();
    }, 1000) as any;
    
    if (this.recordingOptions.debugMode) {
      console.log('Update timer started');
    }
  }

  private stopUpdateTimer() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
      
      if (this.recordingOptions.debugMode) {
        console.log('Update timer stopped');
      }
    }
  }

  private async broadcastRecordingState() {
    if (!this.isRecording) {
      return;
    }
    
    try {
      const state = this.getState();
      const allTabs = await chrome.tabs.query({});
      
      for (const tab of allTabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_FLOATING_WIDGET',
            data: {
              recordingState: state
            }
          }).catch(() => {
            // 忽略错误
          });
        }
      }
    } catch (error) {
      if (this.recordingOptions.debugMode) {
        console.log('Failed to broadcast recording state:', error);
      }
    }
  }

  // 回放实现：使用 fetch 发起请求并收集响应信息
  private async performReplay(data: { method: string; url: string; headers?: Record<string, string>; body?: any }): Promise<{ status: number; headers: Record<string, string>; bodySnippet: string; duration: number; timestamp: number }> {
    if (!data || !data.method || !data.url) {
      throw new Error('缺少必要的请求信息');
    }

    const method = data.method.toUpperCase();
    const url = data.url;
    const headers = data.headers || {};
    let bodyToSend: any = undefined;

    // 自动填充 Content-Type（若 body 为对象且未指定）
    const hasContentType = Object.keys(headers).some(h => h.toLowerCase() === 'content-type');
    if (data.body !== undefined && data.body !== null) {
      if (typeof data.body === 'string') {
        bodyToSend = data.body;
      } else {
        bodyToSend = JSON.stringify(data.body);
        if (!hasContentType) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const start = Date.now();
    const resp = await fetch(url, { method, headers, body: bodyToSend });
    const duration = Date.now() - start;

    // 收集响应头
    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((value, key) => { respHeaders[key] = value; });

    // 读取文本（限制大小）
    let text = '';
    try {
      text = await resp.text();
      if (text.length > 32768) {
        text = text.slice(0, 32768);
      }
    } catch {
      text = '';
    }

    return {
      status: resp.status,
      headers: respHeaders,
      bodySnippet: text,
      duration,
      timestamp: Date.now()
    };
  }
}


// 创建service worker实例
new ServiceWorker();

