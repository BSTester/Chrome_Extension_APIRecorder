var c=Object.defineProperty;var g=(a,t,e)=>t in a?c(a,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):a[t]=e;var n=(a,t,e)=>(g(a,typeof t!="symbol"?t+"":t,e),e);class l{constructor(){n(this,"container");n(this,"isExpanded",!1);n(this,"isDragging",!1);n(this,"dragOffset",{x:0,y:0});n(this,"position",{x:20,y:20});n(this,"state",{isRecording:!1,isPaused:!1,recordCount:0,duration:0});this.loadPosition(),this.createWidget(),this.setupEventListeners()}async loadPosition(){try{const t=await chrome.storage.local.get(["floatingWidgetPosition"]);t.floatingWidgetPosition&&(this.position=t.floatingWidgetPosition)}catch(t){console.debug("Failed to load widget position:",t)}}async savePosition(){try{await chrome.storage.local.set({floatingWidgetPosition:this.position})}catch(t){console.debug("Failed to save widget position:",t)}}createWidget(){this.container=document.createElement("div"),this.container.id="api-recorder-floating-widget",this.container.innerHTML=this.getWidgetHTML(),this.addStyles(),this.updatePosition(),document.body.appendChild(this.container)}getWidgetHTML(){return`
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
    `}addStyles(){if(document.getElementById("api-recorder-widget-styles"))return;const t=document.createElement("style");t.id="api-recorder-widget-styles",t.textContent=`
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
    `,document.head.appendChild(t)}setupEventListeners(){this.container&&(this.container.addEventListener("mousedown",this.handleMouseDown.bind(this)),document.addEventListener("mousemove",this.handleMouseMove.bind(this)),document.addEventListener("mouseup",this.handleMouseUp.bind(this)),this.container.addEventListener("click",this.handleClick.bind(this)),this.container.addEventListener("dblclick",this.handleDoubleClick.bind(this)),this.container.addEventListener("contextmenu",t=>{t.preventDefault()}))}handleMouseDown(t){if(t.button!==0)return;this.isDragging=!0;const e=this.container.getBoundingClientRect();this.dragOffset={x:t.clientX-e.left,y:t.clientY-e.top},this.container.style.cursor="grabbing",t.preventDefault()}handleMouseMove(t){if(!this.isDragging)return;const e=t.clientX-this.dragOffset.x,i=t.clientY-this.dragOffset.y,o=window.innerWidth-this.container.offsetWidth,d=window.innerHeight-this.container.offsetHeight;this.position.x=Math.max(0,Math.min(e,o)),this.position.y=Math.max(0,Math.min(i,d)),this.updatePosition(),t.preventDefault()}handleMouseUp(t){this.isDragging&&(this.isDragging=!1,this.container.style.cursor="move",this.savePosition(),t.preventDefault())}handleClick(t){var o;if(this.isDragging)return;const e=t.target;switch(e.getAttribute("data-action")||((o=e.closest("[data-action]"))==null?void 0:o.getAttribute("data-action"))){case"toggle-expand":this.toggleExpand();break;case"toggle-recording":this.toggleRecording();break;case"open-popup":this.openPopup();break}t.preventDefault(),t.stopPropagation()}handleDoubleClick(t){this.openPopup(),t.preventDefault()}updatePosition(){this.container&&(this.container.style.left=`${this.position.x}px`,this.container.style.top=`${this.position.y}px`)}toggleExpand(){this.isExpanded=!this.isExpanded,this.isExpanded?this.container.classList.add("expanded"):this.container.classList.remove("expanded")}toggleRecording(){const t={type:"TOGGLE_RECORDING"};chrome.runtime.sendMessage(t).catch(e=>{console.error("Failed to toggle recording:",e)})}openPopup(){const t={type:"OPEN_POPUP"};chrome.runtime.sendMessage(t).catch(e=>{console.error("Failed to open popup:",e)})}updateState(t){this.state={...t},this.updateDisplay()}updateDisplay(){if(!this.container)return;this.container.classList.remove("recording","paused"),this.state.isRecording&&(this.state.isPaused?this.container.classList.add("paused"):this.container.classList.add("recording"));const t=this.container.querySelector(".status-text");t&&(this.state.isRecording?this.state.isPaused?t.textContent="已暂停":t.textContent="录制中":t.textContent="未录制");const e=this.container.querySelector(".duration");e&&(e.textContent=this.formatDuration(this.state.duration));const i=this.container.querySelector(".count");i&&(i.textContent=this.formatCount(this.state.recordCount));const o=this.container.querySelector(".btn-toggle");o&&(o.classList.remove("recording","paused"),this.state.isRecording?this.state.isPaused?(o.textContent="继续",o.classList.add("paused")):(o.textContent="停止",o.classList.add("recording")):o.textContent="开始")}formatDuration(t){const e=Math.floor(t/1e3),i=Math.floor(e/60),o=Math.floor(i/60);return o>0?`${o}:${(i%60).toString().padStart(2,"0")}:${(e%60).toString().padStart(2,"0")}`:`${i.toString().padStart(2,"0")}:${(e%60).toString().padStart(2,"0")}`}formatCount(t){return t<100?`${t}个请求`:t<1e3?`${t}+请求`:`${Math.floor(t/1e3)}K+请求`}show(){this.container&&(this.container.style.display="block")}hide(){this.container&&(this.container.style.display="none")}destroy(){this.container&&this.container.remove();const t=document.getElementById("api-recorder-widget-styles");t&&t.remove()}handleResize(){const t=window.innerWidth-this.container.offsetWidth,e=window.innerHeight-this.container.offsetHeight;this.position.x=Math.max(0,Math.min(this.position.x,t)),this.position.y=Math.max(0,Math.min(this.position.y,e)),this.updatePosition()}init(){window.addEventListener("resize",this.handleResize.bind(this))}}class s{constructor(){n(this,"currentPageInfo");n(this,"observer");n(this,"floatingWidget");n(this,"lastRecordingState");this.currentPageInfo=this.getPageInfo(),this.init()}init(){this.sendPageInfo(),this.setupPageObserver(),this.setupRouteObserver(),this.initFloatingWidget(),chrome.runtime.onMessage.addListener((t,e,i)=>(this.handleMessage(t,i),!0)),this.requestInitialState()}getPageInfo(){return{url:window.location.href,title:document.title||"",timestamp:Date.now()}}sendPageInfo(){const t={type:"PAGE_INFO",data:this.currentPageInfo};chrome.runtime.sendMessage(t).catch(e=>{console.debug("Failed to send page info:",e)})}setupPageObserver(){this.observer=new MutationObserver(t=>{let e=!1;t.forEach(i=>{i.type==="childList"&&i.target.nodeName==="TITLE"&&(e=!0),i.target.nodeName==="HEAD"&&i.addedNodes.forEach(o=>{o.nodeName==="TITLE"&&(e=!0)})}),e&&this.handlePageChange()}),this.observer.observe(document.head,{childList:!0,subtree:!0})}setupRouteObserver(){const t=history.pushState,e=history.replaceState;history.pushState=function(...i){t.apply(history,i),setTimeout(()=>r.handleRouteChange(),0)},history.replaceState=function(...i){e.apply(history,i),setTimeout(()=>r.handleRouteChange(),0)},window.addEventListener("popstate",()=>{setTimeout(()=>this.handleRouteChange(),0)}),window.addEventListener("hashchange",()=>{this.handleRouteChange()})}handlePageChange(){const t=this.getPageInfo();t.title!==this.currentPageInfo.title&&(this.currentPageInfo=t,this.sendPageInfo())}handleRouteChange(){const t=this.getPageInfo();t.url!==this.currentPageInfo.url&&(this.currentPageInfo=t,this.sendPageInfo())}handleMessage(t,e){try{switch(t.type){case"GET_PAGE_INFO":e({success:!0,data:this.getPageInfo()});break;case"RECORDING_STATUS_CHANGED":this.handleRecordingStatusChanged(t.data),e({success:!0});break;case"UPDATE_FLOATING_WIDGET":this.handleUpdateFloatingWidget(t.data),e({success:!0});break;case"FLOATING_WIDGET_ACTION":this.handleFloatingWidgetAction(t.data),e({success:!0});break;default:e({success:!1,error:"Unknown message type"})}}catch(i){e({success:!1,error:i.message})}}cleanup(){this.observer&&this.observer.disconnect(),this.floatingWidget&&this.floatingWidget.destroy()}async initFloatingWidget(){try{if(!this.shouldShowFloatingWidget())return;document.readyState!=="complete"?window.addEventListener("load",()=>{this.createFloatingWidget()}):this.createFloatingWidget()}catch(t){console.debug("Failed to init floating widget:",t)}}shouldShowFloatingWidget(){const t=[/^chrome(-extension)?:\/\//,/^moz-extension:\/\//,/^extension:\/\//,/^about:/,/\/chrome\/newtab/],e=window.location.href;return!t.some(i=>i.test(e))}createFloatingWidget(){if(!this.floatingWidget)try{this.floatingWidget=new l,this.floatingWidget.init(),this.lastRecordingState&&this.floatingWidget.updateState(this.lastRecordingState)}catch(t){console.debug("Failed to create floating widget:",t)}}async requestInitialState(){try{const t=await chrome.runtime.sendMessage({type:"GET_STATE"});t&&t.success&&t.state&&this.handleRecordingStatusChanged(t.state)}catch(t){console.debug("Failed to get initial state:",t)}}handleRecordingStatusChanged(t){this.lastRecordingState=t,this.floatingWidget&&this.floatingWidget.updateState(t)}handleUpdateFloatingWidget(t){t.visible&&!this.floatingWidget&&this.shouldShowFloatingWidget()?this.createFloatingWidget():!t.visible&&this.floatingWidget&&this.floatingWidget.hide(),this.floatingWidget&&t.recordingState&&this.floatingWidget.updateState(t.recordingState)}handleFloatingWidgetAction(t){chrome.runtime.sendMessage({type:"FLOATING_WIDGET_ACTION",data:t}).catch(e=>{console.debug("Failed to send floating widget action:",e)})}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>{window.contentScript=new s}):window.contentScript=new s;window.addEventListener("beforeunload",()=>{window.contentScript&&window.contentScript.cleanup()});const r=new s;
