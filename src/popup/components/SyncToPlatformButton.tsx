import React, { useState } from 'react';
import { RequestRecord } from '../../types';
import { useAuth } from '../hooks/useAuth';
import { useTeams } from '../hooks/useTeams';
import TeamSelectDialog from './TeamSelectDialog';
import ErrorHandler from '../../services/ErrorHandler';

interface Props {
  records: RequestRecord[];
}

const SyncToPlatformButton: React.FC<Props> = ({ records }) => {
  const { auth, isLoggedIn, setShowLogin } = useAuth();
  const { teams, loading, fetchTeams } = useTeams(auth);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const errorHandler = ErrorHandler.getInstance();

  // 通用短暂弹窗（居中，自动消失）
  const showPrompt = (message: string) => {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-50 flex items-center justify-center';
    el.innerHTML = `
      <div class="absolute inset-0 bg-black/30"></div>
      <div class="relative bg-white rounded-lg shadow-xl border border-gray-200 w-[340px] p-4">
        <div class="flex items-start space-x-2">
          <svg class="w-5 h-5 text-emerald-600 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1010 10A10.012 10.012 0 0012 2zm0 15a1 1 0 11-1 1 1 1 0 011-1zm1-3V8h-2v6z"/>
          </svg>
          <div class="text-sm text-gray-800 leading-6">${message}</div>
        </div>
      </div>`;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 2000);
  };



  const openDialog = async () => {
    // 先校验是否有可同步记录
    if (!records || records.length === 0) {
      showPrompt('请先录制一些接口请求或选中要导出的记录');
      return;
    }

    if (!isLoggedIn) {
      showPrompt('请先登录测试平台');
      setShowLogin(true);
      return;
    }
    if (teams.length === 0) {
      await fetchTeams();
    }
    setDialogVisible(true);
  };

  // 工具函数：uuid
  const genId = () => {
    try { return crypto.randomUUID(); } catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8); return v.toString(16);
    });}
  };
  // 解析 URL，获取 pathname、query、path segments（去掉协议和域）
  const parseUrlParts = (rawUrl: string) => {
    try {
      // 兼容相对路径与绝对 URL
      const u = rawUrl.startsWith('http') ? new URL(rawUrl) : new URL(rawUrl, 'http://placeholder');
      const pathname = u.pathname.replace(/^\/+/, '');
      const segments = pathname ? pathname.split('/').filter(Boolean) : [];
      const query: Record<string, string> = {};
      u.searchParams.forEach((v, k) => { query[k] = v; });
      return { pathname, segments, query };
    } catch {
      const trimmed = rawUrl.replace(/^https?:\/\/[^/]+\/?/, '').replace(/^\/+/, '');
      const [pathOnly, qs = ''] = trimmed.split('?');
      const segments = pathOnly ? pathOnly.split('/').filter(Boolean) : [];
      const query: Record<string, string> = {};
      qs.split('&').filter(Boolean).forEach(p => {
        const [k, v=''] = p.split('=');
        if (k) query[decodeURIComponent(k)] = decodeURIComponent(v);
      });
      return { pathname: pathOnly, segments, query };
    }
  };

  // 按列表详情页逻辑优先级构造请求体：
  // 1) requestParameters.json -> mode=json + JSON.stringify
  // 2) requestParameters.form -> mode=json + JSON.stringify(form)
  // 3) 退化到 requestBody：可解析JSON则 mode=json，否则 raw
  const normalizeBody = (record: RequestRecord, _headers: Record<string, string>) => {
    const params = record.requestParameters;
    if (params?.json !== undefined) {
      try { return { mode: 'json', raw: JSON.stringify(params.json) }; } catch { /* fallthrough */ }
    }
    if (params?.form && Object.keys(params.form).length > 0) {
      try { return { mode: 'json', raw: JSON.stringify(params.form) }; } catch { /* fallthrough */ }
    }
    const body = record.requestBody;
    if (body == null) return { mode: 'raw', raw: '' };
    if (typeof body === 'string') {
      try { JSON.parse(body); return { mode: 'json', raw: body }; } catch { return { mode: 'raw', raw: body }; }
    }
    try { return { mode: 'json', raw: JSON.stringify(body) }; } catch { return { mode: 'raw', raw: String(body) }; }
  };
  // header 转换为平台格式
  const toPlatformHeaders = (headers: Record<string, string> | undefined) => {
    const arr: any[] = [];
    const src = headers || {};
    for (const [key, value] of Object.entries(src)) {
      arr.push({
        is_checked: 1, type: 'Text', key, value: String(value ?? ''),
        not_null: 2, description: `请求头：${key}`, field_type: 'Text'
      });
    }
    return { parameter: arr };
  };
  // query 转换
  const toPlatformQuery = (query: Record<string, string>) => {
    const arr = Object.entries(query).map(([key, value]) => ({
      is_checked: 1, type: 'Text', key, value: String(value ?? ''),
      not_null: 1, description: '', field_type: 'Text'
    }));
    return { parameter: arr };
  };
  // restful：与导出保持一致，这里不强制生成 param1/param2（平台可留空）
  const toPlatformRestful = (_segments: string[]) => {
    return { parameter: [] as any[] };
  };
  // 构建 apis 数组
  const buildApisPayload = (recs: RequestRecord[]) => {
    const nowSec = Math.floor(Date.now() / 1000);
    const dayStartSec = Math.floor(new Date(new Date().toDateString()).getTime() / 1000);
    const projectId = genId();

    type Group = { id: string; name: string; apis: any[] };
    const groups = new Map<string, Group>();

    // 标签校验：过滤像域名/主机名的标签（对齐导出）
    const isValidGroupTag = (tag?: string): string | null => {
      if (!tag) return null;
      const t = tag.trim();
      if (!t) return null;
      // 类似 openapi-exporter 的 looksLikeDomain 判断
      const looksLikeDomain = /\./.test(t) && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(t);
      return looksLikeDomain ? null : t;
    };

    const ensureGroup = (name: string): Group => {
      if (!groups.has(name)) {
        groups.set(name, { id: genId(), name, apis: [] });
      }
      return groups.get(name)!;
    };

    // 先构建每个分组中的 api
    recs.forEach((r) => {
      const { pathname, segments, query } = parseUrlParts(r.url);
      // 仅使用有效自定义标签作为分组；没有则归入“未分组”文件夹
      const tag = Array.isArray(r.customTags) && r.customTags.length > 0 ? isValidGroupTag(r.customTags[0]) : null;
      const groupName = tag || '未分组';
      const group = ensureGroup(groupName);

      const allHeaders = (r.requestParameters && r.requestParameters.allHeaders) || r.headers || {};
      const { mode, raw } = normalizeBody(r, allHeaders);
      const apiId = genId();
      const apiName = `${(r.method || 'GET').toUpperCase()} /${pathname || ''}`;
      const request = {
        auth: {
          type: 'noauth',
          kv: { key: '', value: '' },
          bearer: { key: '' },
          basic: { username: '', password: '' },
          digest: { username: '', password: '', realm: '', nonce: '', algorithm: '', qop: '', nc: '', cnonce: '', opaque: '' },
          hawk: { authId: '', authKey: '', algorithm: '', user: '', nonce: '', extraData: '', app: '', delegation: '', timestamp: '', includePayloadHash: -1 },
          awsv4: { accessKey: '', secretKey: '', region: '', service: '', sessionToken: '', addAuthDataToQuery: -1 },
          ntlm: { username: '', password: '', domain: '', workstation: '', disableRetryRequest: 1 },
          edgegrid: { accessToken: '', clientToken: '', clientSecret: '', nonce: '', timestamp: '', baseURi: '', headersToSign: '' },
          oauth1: { consumerKey: '', consumerSecret: '', signatureMethod: '', addEmptyParamsToSign: -1, includeBodyHash: -1, addParamsToHeader: -1, realm: '', version: '1.0', nonce: '', timestamp: '', verifier: '', callback: '', tokenSecret: '', token: '' }
        },
        body: { mode, parameter: [], raw, raw_para: [] },
        cookie: { parameter: [] },
        description: '',
        event: { pre_script: '', test: '' },
        header: toPlatformHeaders(allHeaders),
        query: toPlatformQuery(query),
        resful: toPlatformRestful(segments),
        url: pathname,
        assert: [],
        regex: []
      };

      const parentId = group.id;

      const apiNode = {
        update_day: dayStartSec,
        update_dtime: nowSec,
        create_dtime: nowSec,
        is_changed: -1,
        mark: 'developing',
        method: (r.method || 'GET').toUpperCase(),
        parent_id: parentId,
        project_id: projectId,
        sort: -1, // 与示例更一致
        target_id: apiId,
        type_sort: 1,
        version: 1,
        target_type: 'api',
        name: apiName,
        tags: [],
        request,
        response: { success: { parameter: [], raw: '{}' }, error: { parameter: [], raw: '' } },
        mock: '{}',
        mock_url: '',
        url: pathname,
        old_target_id: apiId,
        old_parent_id: parentId
      };

      // 所有接口均挂载到其所属分组（包括“未分组”）
      group.apis.push(apiNode);
    });

    // 生成最终的 apis：先 folders，再对应 apis
    let sortCounter = 1;
    const result: any[] = [];
    // 输出各分组 folder 与其 apis（包含“未分组”）
    for (const g of groups.values()) {
      result.push({
        update_day: dayStartSec,
        update_dtime: nowSec,
        create_dtime: nowSec,
        is_changed: -1,
        mark: 'developing',
        method: 'POST',
        parent_id: '0',
        project_id: projectId, // 同批次统一 project_id
        sort: sortCounter++,
        target_id: g.id,
        type_sort: 1,
        version: 1,
        target_type: 'folder',
        name: g.name,
        script: { pre_script: '', pre_script_switch: 1, test: '', test_switch: 1 },
        old_target_id: g.id,
        old_parent_id: '0'
      });
      // apis
      result.push(...g.apis);
    }

    return result;
  };

  const handleConfirm = async (teamId: string) => {
    try {
      setSyncing(true);
      console.log('[SyncToPlatform] confirm', { teamId, recordCount: records.length, isLoggedIn });
      if (!auth) throw new Error('未登录或登录信息缺失');
      const base = auth.host.replace(/\/+$/, '');
      const apis = buildApisPayload(records);
      const payload = { team_id: teamId, apis };
      console.log('[SyncToPlatform] POST save_import_api', { url: `${base}/management/api/v1/target/save_import_api`, count: apis.length });
      const res = await fetch(`${base}/management/api/v1/target/save_import_api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': auth.token,
          'token': auth.token,
          'X-Auth-Token': auth.token
        },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok || (json && json.code !== 0)) {
        const msg = json?.em || json?.et || `导入失败(${res.status})`;
        throw new Error(msg);
      }
      setDialogVisible(false);
      showPrompt(`成功导入 ${records.length} 个接口到团队`);
      errorHandler.showUserMessage(`成功导入 ${records.length} 个接口到团队`, 'success');
      console.log('[SyncToPlatform] done', json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      // 明确的失败提示
      errorHandler.showUserMessage(`导入失败：${msg}`, 'error');
      errorHandler.handleUserError(e as Error, '同步到测试平台');
      console.error('[SyncToPlatform] error', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="flex items-center">
        <button
          onClick={openDialog}
          className="ml-2 px-3 py-2 rounded-md font-medium transition-colors text-sm bg-emerald-600 text-white hover:bg-emerald-700"
        >
          同步到测试平台
        </button>
        
      </div>
      <TeamSelectDialog
        visible={dialogVisible}
        teams={teams}
        loading={loading || syncing}
        onRefresh={async () => { await fetchTeams(); }}
        onCancel={() => setDialogVisible(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default SyncToPlatformButton;