import { RecordingState, Message } from '../types';

export class FloatingWidget {
  private container?: HTMLElement;
  private isExpanded = false;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private position = { x: 20, y: 20 }; // 默认位置：右上角
  private state: RecordingState = {
    isRecording: false,
    isPaused: false,
    recordCount: 0,
    duration: 0
  };

  constructor() {
    this.loadPosition();
    this.createWidget();
    this.setupEventListeners();
  }

  private async loadPosition() {
    try {
      // 从storage加载保存的位置
      const result = await chrome.storage.local.get(['floatingWidgetPosition']);
      if (result.floatingWidgetPosition) {
        this.position = result.floatingWidgetPosition;
      }
    } catch (error) {
      console.debug('Failed to load widget position:', error);
    }
  }

  private async savePosition() {
    try {
      await chrome.storage.local.set({
        floatingWidgetPosition: this.position
      });
    } catch (error) {
      console.debug('Failed to save widget position:', error);
    }
  }

  private createWidget() {
    // 创建容器
    this.container = document.createElement('div');
    this.container.id = 'api-recorder-floating-widget';
    this.container.innerHTML = this.getWidgetHTML();
    
    // 添加样式
    this.addStyles();
    
    // 设置初始位置
    this.updatePosition();
    
    // 添加到页面
    document.body.appendChild(this.container);
  }

  private getWidgetHTML(): string {
    return `
      <div class="widget-content">
        <div class="widget-header" data-action="toggle-expand">
          <div class="recording-indicator"></div>
          <div class="widget-title">API录制</div>
          <div class="expand-icon">▼</div>
        </div>
        <div class="widget-body">
          <div class="status-display">
            <div class="status-text">未录制</div>
            <div class="stats">
              <span class="duration">00:00</span>
              <span class="count">0个请求</span>
            </div>
          </div>
          <div class="action-buttons">
            <button class="btn-toggle" data-action="toggle-recording">开始</button>
            <button class="btn-popup" data-action="open-popup">详情</button>
          </div>
        </div>
      </div>
    `;
  }

  private addStyles() {
    if (document.getElementById('api-recorder-widget-styles')) {
      return; // 样式已添加
    }

    const style = document.createElement('style');
    style.id = 'api-recorder-widget-styles';
    style.textContent = `
      #api-recorder-floating-widget {
        position: fixed;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        line-height: 1.4;
        cursor: move;
        user-select: none;
        transition: all 0.2s ease;
      }

      #api-recorder-floating-widget .widget-content {
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid #e1e5e9;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
        min-width: 140px;
        max-width: 200px;
      }

      #api-recorder-floating-widget .widget-header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        gap: 6px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
      }

      #api-recorder-floating-widget .recording-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #d1d5da;
        transition: background-color 0.2s;
      }

      #api-recorder-floating-widget.recording .recording-indicator {
        background: #28a745;
        animation: pulse 1.5s infinite;
      }

      #api-recorder-floating-widget.paused .recording-indicator {
        background: #ffc107;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      #api-recorder-floating-widget .widget-title {
        flex: 1;
        font-weight: 500;
        color: #24292e;
      }

      #api-recorder-floating-widget .expand-icon {
        color: #586069;
        font-size: 10px;
        transition: transform 0.2s;
      }

      #api-recorder-floating-widget.expanded .expand-icon {
        transform: rotate(180deg);
      }

      #api-recorder-floating-widget .widget-body {
        padding: 12px;
        display: none;
      }

      #api-recorder-floating-widget.expanded .widget-body {
        display: block;
      }

      #api-recorder-floating-widget .status-display {
        margin-bottom: 8px;
      }

      #api-recorder-floating-widget .status-text {
        font-weight: 500;
        color: #24292e;
        margin-bottom: 4px;
      }

      #api-recorder-floating-widget .stats {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #586069;
      }

      #api-recorder-floating-widget .action-buttons {
        display: flex;
        gap: 6px;
      }

      #api-recorder-floating-widget .action-buttons button {
        flex: 1;
        padding: 4px 8px;
        border: 1px solid #d1d5da;
        border-radius: 4px;
        background: white;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
      }

      #api-recorder-floating-widget .action-buttons button:hover {
        background: #f6f8fa;
        border-color: #586069;
      }

      #api-recorder-floating-widget .btn-toggle.recording {
        background: #28a745;
        color: white;
        border-color: #28a745;
      }

      #api-recorder-floating-widget .btn-toggle.paused {
        background: #ffc107;
        color: #212529;
        border-color: #ffc107;
      }

      /* 响应式设计 */
      @media (max-width: 768px) {
        #api-recorder-floating-widget {
          font-size: 11px;
        }
        
        #api-recorder-floating-widget .widget-content {
          min-width: 120px;
          max-width: 160px;
        }
      }

      /* 深色主题适配 */
      @media (prefers-color-scheme: dark) {
        #api-recorder-floating-widget .widget-content {
          background: rgba(32, 32, 32, 0.95);
          border-color: #444;
          color: #e1e4e8;
        }
        
        #api-recorder-floating-widget .widget-header {
          border-bottom-color: #444;
        }
        
        #api-recorder-floating-widget .widget-title {
          color: #e1e4e8;
        }
        
        #api-recorder-floating-widget .action-buttons button {
          background: #444;
          border-color: #555;
          color: #e1e4e8;
        }
        
        #api-recorder-floating-widget .action-buttons button:hover {
          background: #555;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  private setupEventListeners() {
    if (!this.container) return;

    // 拖拽事件
    this.container.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // 点击事件
    this.container.addEventListener('click', this.handleClick.bind(this));

    // 双击事件
    this.container.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // 防止右键菜单
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // 只处理左键

    this.isDragging = true;
    const rect = this.container!.getBoundingClientRect();
    this.dragOffset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    this.container!.style.cursor = 'grabbing';
    e.preventDefault();
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isDragging) return;

    const newX = e.clientX - this.dragOffset.x;
    const newY = e.clientY - this.dragOffset.y;

    // 限制在视口内
    const maxX = window.innerWidth - this.container!.offsetWidth;
    const maxY = window.innerHeight - this.container!.offsetHeight;

    this.position.x = Math.max(0, Math.min(newX, maxX));
    this.position.y = Math.max(0, Math.min(newY, maxY));

    this.updatePosition();
    e.preventDefault();
  }

  private handleMouseUp(e: MouseEvent) {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.container!.style.cursor = 'move';
    this.savePosition();
    e.preventDefault();
  }

  private handleClick(e: MouseEvent) {
    if (this.isDragging) return;

    const target = e.target as HTMLElement;
    const action = target.getAttribute('data-action') || 
                  target.closest('[data-action]')?.getAttribute('data-action');

    switch (action) {
      case 'toggle-expand':
        this.toggleExpand();
        break;
      case 'toggle-recording':
        this.toggleRecording();
        break;
      case 'open-popup':
        this.openPopup();
        break;
    }

    e.preventDefault();
    e.stopPropagation();
  }

  private handleDoubleClick(e: MouseEvent) {
    this.openPopup();
    e.preventDefault();
  }

  private updatePosition() {
    if (!this.container) return;
    
    this.container.style.left = `${this.position.x}px`;
    this.container.style.top = `${this.position.y}px`;
  }

  private toggleExpand() {
    this.isExpanded = !this.isExpanded;
    
    if (this.isExpanded) {
      this.container!.classList.add('expanded');
    } else {
      this.container!.classList.remove('expanded');
    }
  }

  private toggleRecording() {
    // 发送消息给background script
    const message: Message = {
      type: 'TOGGLE_RECORDING'
    };

    chrome.runtime.sendMessage(message).catch(error => {
      console.error('Failed to toggle recording:', error);
    });
  }

  private openPopup() {
    // 发送消息给background script打开弹窗
    const message: Message = {
      type: 'OPEN_POPUP'
    };

    chrome.runtime.sendMessage(message).catch(error => {
      console.error('Failed to open popup:', error);
    });
  }

  public updateState(newState: RecordingState) {
    this.state = { ...newState };
    this.updateDisplay();
  }

  private updateDisplay() {
    if (!this.container) return;

    // 更新录制指示器
    this.container.classList.remove('recording', 'paused');
    if (this.state.isRecording) {
      if (this.state.isPaused) {
        this.container.classList.add('paused');
      } else {
        this.container.classList.add('recording');
      }
    }

    // 更新状态文本
    const statusText = this.container.querySelector('.status-text') as HTMLElement;
    if (statusText) {
      if (!this.state.isRecording) {
        statusText.textContent = '未录制';
      } else if (this.state.isPaused) {
        statusText.textContent = '已暂停';
      } else {
        statusText.textContent = '录制中';
      }
    }

    // 更新时长
    const durationEl = this.container.querySelector('.duration') as HTMLElement;
    if (durationEl) {
      durationEl.textContent = this.formatDuration(this.state.duration);
    }

    // 更新计数
    const countEl = this.container.querySelector('.count') as HTMLElement;
    if (countEl) {
      countEl.textContent = this.formatCount(this.state.recordCount);
    }

    // 更新按钮
    const toggleBtn = this.container.querySelector('.btn-toggle') as HTMLElement;
    if (toggleBtn) {
      toggleBtn.classList.remove('recording', 'paused');
      
      if (!this.state.isRecording) {
        toggleBtn.textContent = '开始';
      } else if (this.state.isPaused) {
        toggleBtn.textContent = '继续';
        toggleBtn.classList.add('paused');
      } else {
        toggleBtn.textContent = '停止';
        toggleBtn.classList.add('recording');
      }
    }
  }

  private formatDuration(duration: number): string {
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
  }

  private formatCount(count: number): string {
    if (count < 100) {
      return `${count}个请求`;
    } else if (count < 1000) {
      return `${count}+请求`;
    } else {
      return `${Math.floor(count / 1000)}K+请求`;
    }
  }

  public show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  public hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
  }

  public destroy() {
    if (this.container) {
      this.container.remove();
    }
    
    // 移除样式
    const style = document.getElementById('api-recorder-widget-styles');
    if (style) {
      style.remove();
    }
  }

  // 响应式适配
  private handleResize() {
    // 确保组件在视口内
    const maxX = window.innerWidth - this.container!.offsetWidth;
    const maxY = window.innerHeight - this.container!.offsetHeight;

    this.position.x = Math.max(0, Math.min(this.position.x, maxX));
    this.position.y = Math.max(0, Math.min(this.position.y, maxY));

    this.updatePosition();
  }

  public init() {
    // 监听窗口大小变化
    window.addEventListener('resize', this.handleResize.bind(this));
  }
}