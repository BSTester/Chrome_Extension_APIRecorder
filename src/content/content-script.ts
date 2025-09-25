import { Message, PageInfo, RecordingState } from '../types';
import { FloatingWidget } from './floating-widget';

class ContentScript {
  private currentPageInfo: PageInfo;
  private observer?: MutationObserver;
  private floatingWidget?: FloatingWidget;
  private lastRecordingState?: RecordingState;

  constructor() {
    this.currentPageInfo = this.getPageInfo();
    this.init();
  }

  private init() {
    // 发送初始页面信息
    this.sendPageInfo();
    
    // 监听页面变化
    this.setupPageObserver();
    
    // 监听路由变化（SPA应用）
    this.setupRouteObserver();
    
    // 初始化悬浮组件
    this.initFloatingWidget();
    
    // 监听来自扩展的消息
    chrome.runtime.onMessage.addListener(
      (message: Message, _sender, sendResponse) => {
        this.handleMessage(message, sendResponse);
        return true;
      }
    );

    // 获取初始录制状态
    this.requestInitialState();
  }

  private getPageInfo(): PageInfo {
    return {
      url: window.location.href,
      title: document.title || '',
      timestamp: Date.now()
    };
  }

  private sendPageInfo() {
    const message: Message = {
      type: 'PAGE_INFO',
      data: this.currentPageInfo
    };

    chrome.runtime.sendMessage(message).catch(error => {
      console.debug('Failed to send page info:', error);
    });
  }

  private setupPageObserver() {
    // 监听标题变化
    this.observer = new MutationObserver((mutations) => {
      let titleChanged = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.target.nodeName === 'TITLE') {
          titleChanged = true;
        }
        
        // 检查head中的title标签变化
        if (mutation.target.nodeName === 'HEAD') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'TITLE') {
              titleChanged = true;
            }
          });
        }
      });

      if (titleChanged) {
        this.handlePageChange();
      }
    });

    // 开始观察
    this.observer.observe(document.head, {
      childList: true,
      subtree: true
    });
  }

  private setupRouteObserver() {
    // 监听 pushState 和 replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(() => contentScript.handleRouteChange(), 0);
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(() => contentScript.handleRouteChange(), 0);
    };

    // 监听 popstate 事件
    window.addEventListener('popstate', () => {
      setTimeout(() => this.handleRouteChange(), 0);
    });

    // 监听 hashchange 事件
    window.addEventListener('hashchange', () => {
      this.handleRouteChange();
    });
  }

  private handlePageChange() {
    const newPageInfo = this.getPageInfo();
    
    // 检查是否真的发生了变化
    if (newPageInfo.title !== this.currentPageInfo.title) {
      this.currentPageInfo = newPageInfo;
      this.sendPageInfo();
    }
  }

  private handleRouteChange() {
    const newPageInfo = this.getPageInfo();
    
    // 检查URL是否变化
    if (newPageInfo.url !== this.currentPageInfo.url) {
      this.currentPageInfo = newPageInfo;
      this.sendPageInfo();
    }
  }

  private handleMessage(message: Message, sendResponse: (response: any) => void) {
    try {
      switch (message.type) {
        case 'GET_PAGE_INFO':
          sendResponse({
            success: true,
            data: this.getPageInfo()
          });
          break;

        case 'RECORDING_STATUS_CHANGED':
          this.handleRecordingStatusChanged(message.data);
          sendResponse({ success: true });
          break;

        case 'UPDATE_FLOATING_WIDGET':
          this.handleUpdateFloatingWidget(message.data);
          sendResponse({ success: true });
          break;

        case 'FLOATING_WIDGET_ACTION':
          this.handleFloatingWidgetAction(message.data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({
            success: false,
            error: 'Unknown message type'
          });
      }
    } catch (error) {
      sendResponse({
        success: false,
        error: (error as Error).message
      });
    }
  }

  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }
    
    if (this.floatingWidget) {
      this.floatingWidget.destroy();
    }
  }

  // 新增的方法
  private async initFloatingWidget() {
    try {
      // 检查是否应该显示悬浮组件
      if (!this.shouldShowFloatingWidget()) {
        return;
      }

      // 等待DOM完全加载
      if (document.readyState !== 'complete') {
        window.addEventListener('load', () => {
          this.createFloatingWidget();
        });
      } else {
        this.createFloatingWidget();
      }
    } catch (error) {
      console.debug('Failed to init floating widget:', error);
    }
  }

  private shouldShowFloatingWidget(): boolean {
    // 排除特定页面
    const excludePatterns = [
      /^chrome(-extension)?:\/\//,
      /^moz-extension:\/\//,
      /^extension:\/\//,
      /^about:/,
      /\/chrome\/newtab/
    ];

    const url = window.location.href;
    return !excludePatterns.some(pattern => pattern.test(url));
  }

  private createFloatingWidget() {
    if (this.floatingWidget) {
      return; // 已经创建
    }

    try {
      this.floatingWidget = new FloatingWidget();
      this.floatingWidget.init();
      
      // 如果已经有录制状态，更新显示
      if (this.lastRecordingState) {
        this.floatingWidget.updateState(this.lastRecordingState);
      }
    } catch (error) {
      console.debug('Failed to create floating widget:', error);
    }
  }

  private async requestInitialState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response && response.success && response.state) {
        this.handleRecordingStatusChanged(response.state);
      }
    } catch (error) {
      console.debug('Failed to get initial state:', error);
    }
  }

  private handleRecordingStatusChanged(state: RecordingState) {
    this.lastRecordingState = state;
    
    if (this.floatingWidget) {
      this.floatingWidget.updateState(state);
    }
  }

  private handleUpdateFloatingWidget(data: any) {
    if (data.visible && !this.floatingWidget && this.shouldShowFloatingWidget()) {
      this.createFloatingWidget();
    } else if (!data.visible && this.floatingWidget) {
      this.floatingWidget.hide();
    }

    if (this.floatingWidget && data.recordingState) {
      this.floatingWidget.updateState(data.recordingState);
    }
  }

  private handleFloatingWidgetAction(data: any) {
    // 转发到background script
    chrome.runtime.sendMessage({
      type: 'FLOATING_WIDGET_ACTION',
      data
    }).catch(error => {
      console.debug('Failed to send floating widget action:', error);
    });
  }
}

// 确保在DOM准备好后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.contentScript = new ContentScript();
  });
} else {
  window.contentScript = new ContentScript();
}

// 在页面卸载时清理
window.addEventListener('beforeunload', () => {
  if ((window as any).contentScript) {
    (window as any).contentScript.cleanup();
  }
});

// 为了在全局作用域中访问
declare global {
  interface Window {
    contentScript: any;
  }
}

const contentScript = new ContentScript();