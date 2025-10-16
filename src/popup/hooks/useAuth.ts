import { useEffect, useState, useCallback } from 'react';
import ErrorHandler from '../../services/ErrorHandler';
import { getSecure, setSecure } from '../../utils/secure-storage';
import { StorageManager } from '../../storage/storage-manager';

export interface AuthInfo {
  host: string;
  username: string;
  token: string;
}

const AUTH_KEY = 'secure_auth';
const TEAMS_KEY = 'teams';
const storage = new StorageManager();
let storageInited = false;
async function ensureStorage() {
  if (!storageInited) {
    await storage.init();
    storageInited = true;
  }
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const errorHandler = ErrorHandler.getInstance();

  useEffect(() => {
    (async () => {
      try {
        const saved = await getSecure<AuthInfo>(AUTH_KEY);
        if (saved && saved.host && saved.username && saved.token) {
          setAuth(saved);
        }
      } catch (e) {
        errorHandler.handleUserError(e as Error, '读取登录信息');
      } finally {
        setLoading(false);
      }
    })();
  }, [errorHandler]);

  // 监听 chrome.storage.local 的登录态变化，实现跨组件/标签页实时同步
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      const handler = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
        if (areaName === 'local' && changes.auth) {
          const next = changes.auth.newValue || null;
          setAuth(next);
          // 结束 loading，避免 UI 卡在“未登录”
          setLoading(false);
          console.log('[useAuth] auth synced via storage.onChanged', next ? 'logged-in' : 'logged-out');
        }
      };
      chrome.storage.onChanged.addListener(handler);
      return () => {
        try { chrome.storage.onChanged.removeListener(handler); } catch {}
      };
    }
  }, []);

  const login = useCallback(async (host: string, username: string, password: string) => {
    try {
      if (!host || !username || !password) {
        throw new Error('请完整填写 Host、用户名与密码');
      }
      setLoading(true);
      const base = host.replace(/\/+$/, '');
      console.log('[Auth.login] start', { host: base, account: username });
      // 动态申请域名权限（可选权限）
      try {
        const originPattern = `${base}/*`;
        if (typeof chrome !== 'undefined' && chrome.permissions && chrome.permissions.request) {
          const granted = await new Promise<boolean>((resolve) => {
            chrome.permissions.request({ origins: [originPattern] }, (result) => resolve(!!result));
          });
          if (!granted) {
            throw new Error('未授予站点访问权限，已取消登录');
          }
        }
      } catch (permErr) {
        throw permErr instanceof Error ? permErr : new Error('申请站点权限失败');
      }
      // 登录请求
      const res = await fetch(`${base}/permission/api/v1/auth/user_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: username,
          password: password,
          is_auto_login: true
        })
      });
      console.log('[Auth.login] POST user_login status', res.status);
      if (!res.ok) {
        throw new Error(`登录请求失败(${res.status})`);
      }
      const json = await res.json();
      console.log('[Auth.login] user_login response', json);
      if (json?.code !== 0 || !json?.data?.token) {
        throw new Error(json?.et || json?.em || '登录失败');
      }
      const token: string = json.data.token;
      const info: AuthInfo = { host: base, username, token };
      console.log('[Auth.login] token acquired');
      // 持久化加密登录信息
      await setSecure<AuthInfo>(AUTH_KEY, info);
      setAuth(info);
      // 同步到 chrome.storage.local，广播登录态给其他组件/标签
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ auth: info });
          console.log('[Auth.login] chrome.storage.local auth saved');
        }
      } catch (e) {
        console.warn('[Auth.login] chrome.storage.local set auth failed', e);
      }
      // 登录成功后获取团队列表并缓存
      try {
        console.log('[Auth.login] GET user/get');
        const userRes = await fetch(`${base}/permission/api/v1/user/get`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': token,
            'token': token,
            'X-Auth-Token': token
          }
        });
        console.log('[Auth.login] user/get status', userRes.status);
        if (userRes.ok) {
          const userJson = await userRes.json();
          console.log('[Auth.login] user/get response', userJson);
          const list = userJson?.data?.team_list;
          if (Array.isArray(list)) {
            const teams = list.map((t: any) => ({
              id: t.team_id,
              name: t.team_name
            }));
            console.log('[Auth.login] caching teams', teams);
            await ensureStorage();
            await storage.saveConfig(TEAMS_KEY, teams);
            // 同步到 chrome.storage.local，通知已挂载的 UI 即时更新
            try {
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await chrome.storage.local.set({ teams });
                console.log('[Auth.login] chrome.storage.local teams saved');
              }
            } catch (e) {
              console.warn('[Auth.login] chrome.storage.local set teams failed', e);
            }
          } else {
            console.warn('[Auth.login] team_list empty or invalid');
          }
        }
      } catch (e) {
        // 获取团队失败不阻断登录
        console.warn('获取团队列表失败', e);
      }
      console.log('[Auth.login] done');
      return info;
    } catch (e) {
      errorHandler.handleUserError(e as Error, '登录');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [errorHandler]);

  const logout = useCallback(async () => {
    try {
      setLoading(true);
      await setSecure<AuthInfo | null>(AUTH_KEY, null);
      setAuth(null);
      // 广播退出登录态
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ auth: null });
          console.log('[Auth.logout] chrome.storage.local auth cleared');
        }
      } catch (e) {
        console.warn('[Auth.logout] chrome.storage.local clear auth failed', e);
      }
    } catch (e) {
      errorHandler.handleUserError(e as Error, '退出登录');
    } finally {
      setLoading(false);
    }
  }, [errorHandler]);

  return {
    auth,
    isLoggedIn: !!auth,
    loading,
    showLogin,
    setShowLogin,
    login,
    logout,
  };
}