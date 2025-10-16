import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import ErrorHandler from '../../services/ErrorHandler';
import { StorageManager } from '../../storage/storage-manager';

const LoginModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSubmit: (host: string, username: string, password: string) => Promise<void>;
  loading?: boolean;
  defaultHost?: string;
  defaultUsername?: string;
}> = ({ visible, onClose, onSubmit, loading, defaultHost, defaultUsername }) => {
  const [host, setHost] = useState(defaultHost || '');
  const [username, setUsername] = useState(defaultUsername || '');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string>('');
  const storageRef = useRef<StorageManager | null>(null);
  const DRAFT_KEY = 'authFormDraft';

  // 初始化 StorageManager
  useEffect(() => {
    if (!storageRef.current) {
      storageRef.current = new StorageManager();
    }
  }, []);

  // 弹窗打开时读取草稿进行预填充（优先使用草稿）
  useEffect(() => {
    if (!visible) return;
    let canceled = false;
    (async () => {
      try {
        if (!storageRef.current) return;
        const draft = await storageRef.current.getConfig(DRAFT_KEY);
        if (canceled || !draft) return;
        if (draft.host) setHost(draft.host);
        if (draft.username) setUsername(draft.username);
      } catch {}
    })();
    return () => { canceled = true; };
  }, [visible]);

  // 输入变更时节流保存草稿（不保存密码）
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      try {
        if (!storageRef.current) return;
        const payload = { host: host || '', username: username || '' };
        storageRef.current.saveConfig(DRAFT_KEY, payload);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [host, username, visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-[360px] rounded-lg shadow-lg p-4">
        <h3 className="text-base font-semibold text-gray-800 mb-3">登录测试平台</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">平台 Host</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm text-black"
              placeholder="https://test-platform.example.com"
              value={host}
              onChange={(e) => { setHost(e.target.value); if (err) setErr(''); }}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">用户名</label>
            <input
              className="w-full border rounded px-2 py-1 text-sm text-black"
              placeholder="your.name"
              value={username}
              onChange={(e) => { setUsername(e.target.value); if (err) setErr(''); }}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">密码</label>
            <input
              type="password"
              className="w-full border rounded px-2 py-1 text-sm text-black"
              placeholder="••••••••"
              value={password}
              onChange={(e) => { setPassword(e.target.value); if (err) setErr(''); }}
            />
          </div>
        </div>
        {err && (
          <div className="mt-2 text-sm text-red-600">{err}</div>
        )}
        <div className="mt-4 flex justify-end space-x-2">
          <button
            className="px-3 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            className={`px-3 py-1.5 text-sm rounded ${loading ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            onClick={async () => {
              const h = host.trim();
              const u = username.trim();
              const p = password;
              if (!h || !u || !p) {
                setErr('请完整填写 Host、用户名与密码');
                return;
              }
              setErr('');
              try {
                await onSubmit(h, u, p);
                try {
                  if (storageRef.current) {
                    await storageRef.current.saveConfig(DRAFT_KEY, { host: h, username: u });
                  }
                } catch {}
              } catch (e: any) {
                setErr(e?.message || '登录失败');
              }
            }}
            disabled={loading}
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthButton: React.FC = () => {
  const { auth, isLoggedIn, loading, setShowLogin, showLogin, login, logout } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const errorHandler = ErrorHandler.getInstance();

  const handleLogin = async (host: string, username: string, password: string) => {
    try {
      setSubmitting(true);
      await login(host, username, password);
      setShowLogin(false);
      errorHandler.showUserMessage('登录成功', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      {!isLoggedIn ? (
        <button
          className="px-3 py-1.5 text-sm rounded bg-white text-blue-700 hover:bg-blue-50 shadow-sm"
          onClick={() => setShowLogin(true)}
          disabled={loading}
        >
          登录
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <div
            className="flex items-center space-x-2 cursor-pointer select-none"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {auth?.username?.slice(0, 1).toUpperCase() || 'U'}
              </span>
            </div>
            <span className="text-white text-sm">{auth?.username}</span>
            <svg className="w-4 h-4 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-white rounded shadow z-50">
              <button
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={async () => {
                  setMenuOpen(false);
                  await logout();
                  errorHandler.showUserMessage('已退出登录', 'success');
                }}
              >
                退出登录
              </button>
            </div>
          )}
        </div>
      )}
      <LoginModal
        visible={showLogin}
        onClose={() => setShowLogin(false)}
        onSubmit={handleLogin}
        loading={submitting}
        defaultHost={auth?.host}
        defaultUsername={auth?.username}
      />
    </div>
  );
};

export default AuthButton;