import { 
  RequestRecord, 
  SessionMetadata, 
  FilterOptions, 
  RecordingState, 
  Message,
  PendingRequest,
  RecordingOptions
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
  private recordingOptions: RecordingOptions = {
    maxRecords: 1000,
    enableFloatingWidget: true,
    autoSaveSession: true,
    debugMode: false
  };
  private filterOptions: FilterOptions = {
    excludeStatic: true,
    ajaxOnly: false, // 放宽初始过滤条件
    duplicateRemoval: false,
    minResponseTime: 0,
    statusCodes: [], // 放宽状态码过滤
    domains: []
  };

  constructor() {
    this.storageManager = new StorageManager();
    this.requestFilter = new RequestFilter();
    this.initializeListeners();
    this.loadState();
  }

  private initializeListeners() {
    // 监听popup消息
    chrome.runtime.onMessage.addListener(
      (message: Message, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true; // 保持消息通道开放以支持异步响应
      }
    );

    // 监听请求开始
    chrome.webRequest.onBeforeRequest.addListener(
      (details) => { this.handleRequestStart(details); },
      { urls: ['<all_urls>'] },
      ['requestBody']
    );

    // 监听请求头
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => { this.handleRequestHeaders(details); },
      { urls: ['<all_urls>'] },
      ['requestHeaders']
    );

    // 监听响应开始
    chrome.webRequest.onResponseStarted.addListener(
      (details) => this.handleResponseStart(details),
      { urls: ['<all_urls>'] },
      ['responseHeaders']
    );

    // 监听请求完成
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
        this.recordCount = state.recordCount;
        this.sessionId = state.sessionId;
        this.startTime = state.startTime;
        this.pauseTime = state.pauseTime;
      }

      const filters = await this.storageManager.getFilterOptions();
      if (filters) {
        this.filterOptions = filters;
      }
      
      const options = await this.storageManager.getConfig('recordingOptions');
      if (options) {
        this.recordingOptions = { ...this.recordingOptions, ...options };
      }
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

        case 'OPEN_POPUP':
          // 打开插件弹窗
          chrome.action.openPopup();
          sendResponse({ success: true });
          break;

        case 'FLOATING_WIDGET_ACTION':
          await this.handleFloatingWidgetAction(message.data);
          sendResponse({ success: true, state: this.getState() });
          break;

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
    
    if (this.recordingOptions.debugMode) {
      console.log('Recording started:', { sessionId: this.sessionId, startTime: this.startTime });
    }
  }

  private async stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.isPaused = false;
    
    if (this.sessionId) {
      const metadata = await this.storageManager.getSessionMetadata(this.sessionId);
      if (metadata) {
        metadata.endTime = Date.now();
        await this.storageManager.saveSessionMetadata(metadata);
      }
    }

    // 清理待处理请求
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

    // 基础过滤 - 使用放宽的过滤条件
    if (!this.requestFilter.shouldRecord(details, this.filterOptions)) {
      if (this.recordingOptions.debugMode) {
        console.log('Filtered out request (initial):', details.url);
      }
      return;
    }

    // 使用Chrome原生requestId
    const pendingRequest: PendingRequest = {
      requestId: details.requestId,
      id: `${details.requestId}_${Date.now()}`,
      timestamp: Date.now(),
      method: details.method,
      url: details.url,
      requestBody: details.requestBody
    };

    // 存储到内存中，等待后续信息补充
    this.pendingRequests.set(details.requestId, pendingRequest);
    
    if (this.recordingOptions.debugMode) {
      console.log('Request started:', { requestId: details.requestId, url: details.url });
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

    // 更新请求头信息
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

    // 更新响应头和状态码
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

      // 只在最终阶段进行严格过滤
      if (responseTime < this.filterOptions.minResponseTime) {
        this.pendingRequests.delete(details.requestId);
        if (this.recordingOptions.debugMode) {
          console.log('Request filtered by response time:', { requestId: details.requestId, responseTime });
        }
        return;
      }

      // 构建完整的请求记录
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
        pageTitle: '' // 将由content script提供
      };

      // 最终过滤检查
      if (this.requestFilter.shouldSaveRecord(record, this.filterOptions)) {
        // 检查记录数量限制
        if (this.recordCount >= this.recordingOptions.maxRecords) {
          console.warn('Maximum record limit reached:', this.recordingOptions.maxRecords);
          await this.stopRecording();
          return;
        }

        await this.storageManager.saveRecord(record);
        this.recordCount++;
        await this.saveState();

        // 更新会话统计
        if (this.sessionId) {
          const metadata = await this.storageManager.getSessionMetadata(this.sessionId);
          if (metadata) {
            metadata.filteredRequests++;
            await this.storageManager.saveSessionMetadata(metadata);
          }
        }

        // 通知content script更新状态
        await this.notifyContentScript();
        
        if (this.recordingOptions.debugMode) {
          console.log('Request saved:', { id: record.id, url: record.url, count: this.recordCount });
        }
      } else if (this.recordingOptions.debugMode) {
        console.log('Request filtered by final check:', details.url);
      }

      // 清理临时数据
      this.pendingRequests.delete(details.requestId);

    } catch (error) {
      console.error('Error handling request complete:', error);
      if (this.recordingOptions.debugMode) {
        console.log('Debug - Request details:', details);
      }
      // 清理出错的请求
      this.pendingRequests.delete(details.requestId);
    }
  }

  private parseHeaders(headers: chrome.webRequest.HttpHeader[]): Record<string, string> {
    const parsed: Record<string, string> = {};
    headers.forEach(header => {
      if (header.name && header.value) {
        parsed[header.name.toLowerCase()] = header.value;
      }
    });
    return parsed;
  }

  // 新增的方法
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
    // 调整开始时间，排除暂停期间
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
      // 获取当前活动标签
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const state = this.getState();
      
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STATUS_CHANGED',
            data: state
          }).catch(() => {
            // 忽略错误，content script可能尚未加载
          });
        }
      }
      
      // 同时通知所有标签页
      const allTabs = await chrome.tabs.query({});
      for (const tab of allTabs) {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'UPDATE_FLOATING_WIDGET',
            data: {
              visible: this.recordingOptions.enableFloatingWidget,
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
        
      case 'open_popup':
        chrome.action.openPopup();
        break;
        
      case 'toggle_expand':
        // 悬浮组件展开/收起状态由content script管理
        break;
        
      case 'update_position':
        // 保存悬浮组件位置
        if (payload && payload.position) {
          await this.storageManager.saveConfig('floatingWidgetPosition', payload.position);
        }
        break;
    }
    
    await this.notifyContentScript();
  }
}

// 初始化Service Worker
new ServiceWorker();