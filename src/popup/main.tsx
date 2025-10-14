import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './large-screen.css'

// 设置全屏界面标识
(window as any).isLargeScreen = true;

// 全屏显示功能
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log('无法进入全屏模式:', err);
    });
  } else {
    document.exitFullscreen();
  }
}

// 监听键盘快捷键 F11 进入全屏
document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    e.preventDefault();
    toggleFullscreen();
  }
});

// 移除加载动画
const removeLoadingAnimation = () => {
  const loadingContainer = document.querySelector('.loading-container');
  if (loadingContainer) {
    loadingContainer.remove();
  }
};

// 初始化界面
const initApp = () => {
  // 设置页面标题
  document.title = 'API Recorder';
  
  // 确保body样式
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.width = '100vw';
  document.body.style.height = '100vh';
  document.body.style.overflow = 'hidden';
  
  // 移除加载动画
  removeLoadingAnimation();
  
  // 渲染应用
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = ''; // 清空根元素
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
};

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}