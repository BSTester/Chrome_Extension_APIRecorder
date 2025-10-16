import { useEffect, useState, useCallback } from 'react';
import { StorageManager } from '../../storage/storage-manager';
import ErrorHandler from '../../services/ErrorHandler';
import { AuthInfo } from './useAuth';

const storage = new StorageManager();
let storageInited = false;

async function ensureStorage() {
  if (!storageInited) {
    await storage.init();
    storageInited = true;
  }
}

const TEAMS_KEY = 'teams';

export interface Team {
  id: string;
  name: string;
}

export function useTeams(auth: AuthInfo | null) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const errorHandler = ErrorHandler.getInstance();

  useEffect(() => {
    (async () => {
      try {
        // 优先从 chrome.storage.local 读取
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          const res = await chrome.storage.local.get(['teams']);
          console.log('[useTeams.init] chrome.storage.local teams', res?.teams);
          if (Array.isArray(res?.teams) && res.teams.length > 0) {
            setTeams(res.teams);
          }
        }
        // 其次从 IndexedDB 读取
        await ensureStorage();
        const saved = await storage.getConfig(TEAMS_KEY);
        console.log('[useTeams.init] indexedDB teams', saved);
        if (Array.isArray(saved) && saved.length > 0) {
          setTeams(saved);
        }
      } catch (e) {
        console.warn('读取团队缓存失败', e);
      }
    })();

    // 监听 chrome.storage.local 变化，实时更新
    function handleChanged(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) {
      if (areaName !== 'local') return;
      if (changes.teams && Array.isArray(changes.teams.newValue)) {
        setTeams(changes.teams.newValue);
      }
    }
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(handleChanged);
      return () => chrome.storage.onChanged.removeListener(handleChanged);
    }
  }, []);

  const fetchTeams = useCallback(async () => {
    if (!auth) {
      errorHandler.showUserMessage('请先登录测试平台', 'warning');
      return [];
    }
    try {
      setLoading(true);
      const base = auth.host.replace(/\/+$/, '');
      console.log('[useTeams.fetchTeams] GET user/get', { base, tokenPresent: !!auth.token });
      const res = await fetch(`${base}/permission/api/v1/user/get`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': auth.token,
          'token': auth.token,
          'X-Auth-Token': auth.token
        }
      });
      if (!res.ok) {
        throw new Error(`获取团队失败(${res.status})`);
      }
      const json = await res.json();
      console.log('[useTeams.fetchTeams] response', json);
      const list = json?.data?.team_list;
      const parsed: Team[] = Array.isArray(list)
        ? list.map((t: any) => ({ id: t.team_id, name: t.team_name }))
        : [];
      console.log('[useTeams.fetchTeams] parsed teams', parsed);
      await ensureStorage();
      await storage.saveConfig(TEAMS_KEY, parsed);
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ teams: parsed });
          console.log('[useTeams.fetchTeams] chrome.storage.local teams saved');
        }
      } catch (e) {
        console.warn('[useTeams.fetchTeams] chrome.storage.local set failed', e);
      }
      setTeams(parsed);
      return parsed;
    } catch (e) {
      errorHandler.handleUserError(e as Error, '获取团队列表');
      return [];
    } finally {
      setLoading(false);
    }
  }, [auth, errorHandler]);

  return { teams, loading, fetchTeams };
}