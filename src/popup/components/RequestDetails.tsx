import React, { useState, useEffect } from 'react';
import { RequestRecord } from '../../types';

function JSONTree({ data, defaultExpandDepth = 1, depth = 0 }: { data: any; defaultExpandDepth?: number; depth?: number }) {
  if (data === null || typeof data !== 'object') {
    return <span className="text-blue-700">{typeof data === 'string' ? JSON.stringify(data) : String(data)}</span>;
  }
  const isArray = Array.isArray(data);
  const entries = isArray ? (data as any[]).map((v, i) => [i, v]) : Object.entries(data);
  return (
    <details open={depth < defaultExpandDepth}>
      <summary className="cursor-pointer text-xs text-gray-700">{isArray ? `Array(${(data as any[]).length})` : 'Object'}</summary>
      <div className="pl-3 border-l border-gray-200 space-y-1">
        {entries.map(([k, v]) => (
          <div key={String(k)} className="text-xs">
            {!isArray && <span className="text-gray-600">{String(k)}: </span>}
            <JSONTree data={v} defaultExpandDepth={defaultExpandDepth} depth={depth + 1} />
          </div>
        ))}
      </div>
    </details>
  );
}

interface RequestDetailsProps {
  record: RequestRecord;
  isOpen: boolean;
  onClose: () => void;
}

const RequestDetails: React.FC<RequestDetailsProps> = ({ record, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'headers' | 'request'>('request');
  const [copySuccess, setCopySuccess] = useState<{[key: string]: boolean}>({});
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({});
  // 可编辑请求数据与回放结果
  const [editableHeadersText, setEditableHeadersText] = useState<string>('');
  const [editableBodyText, setEditableBodyText] = useState<string>('');
  const [replayLoading, setReplayLoading] = useState<boolean>(false);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<{ status: number; headers: Record<string, string>; bodySnippet: string; duration: number; timestamp: number } | null>(null);
  const [showRawSnippet, setShowRawSnippet] = useState(false);
  const [showReplayEditor, setShowReplayEditor] = useState<boolean>(false);

  // 初始化编辑区默认值（随 record 变化）
  useEffect(() => {
    const defaultHeaders = JSON.stringify(record.requestParameters?.allHeaders || record.headers || {}, null, 2);
    const defaultBody = JSON.stringify(
      record.requestParameters?.json ?? record.requestParameters?.form ?? record.requestBody ?? null,
      null,
      2
    );
    setEditableHeadersText(defaultHeaders);
    setEditableBodyText(defaultBody);
    setReplayError(null);
    setReplayResult(null);
  }, [record]);

  if (!isOpen) return null;

  // 切换展开/折叠状态
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // 复制功能
  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(prev => ({ ...prev, [key]: true }));
      setTimeout(() => {
        setCopySuccess(prev => ({ ...prev, [key]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const formatJson = (data: any) => {
    if (!data) return 'No data';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const formatHeaders = (headers: Record<string, string>) => {
    return Object.entries(headers).map(([key, value]) => (
      <div key={key} className="flex border-b border-gray-100 py-2">
        <span className="font-medium text-gray-700 w-1/3 text-sm">{key}:</span>
        <span className="text-gray-600 w-2/3 text-sm break-all">{value}</span>
      </div>
    ));
  };

  const parseUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return {
        protocol: urlObj.protocol,
        host: urlObj.host,
        pathname: urlObj.pathname,
        search: urlObj.search,
        searchParams: Array.from(urlObj.searchParams.entries())
      };
    } catch {
      return null;
    }
  };

  const urlInfo = parseUrl(record.url);

  // 触发回放
  const triggerReplay = async () => {
    try {
      setReplayLoading(true);
      setReplayError(null);
      setReplayResult(null);

      // 解析用户输入
      let headers: Record<string, string> = {};
      let body: any = null;
      if (editableHeadersText.trim()) {
        headers = JSON.parse(editableHeadersText);
      }
      if (editableBodyText.trim()) {
        body = JSON.parse(editableBodyText);
      }

      // 发送消息到后台进行回放
      const replayRes = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('通信超时')), 15000);
        chrome.runtime.sendMessage(
          { type: 'REPLAY_REQUEST', data: { method: record.method, url: record.url, headers, body } },
          (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (res?.success) resolve(res);
            else reject(new Error(res?.error || '回放失败'));
          }
        );
      });

      setReplayResult(replayRes.result);
    } catch (err: any) {
      setReplayError(err?.message || '回放出错');
    } finally {
      setReplayLoading(false);
    }
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col transform-gpu will-change-transform">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              record.method === 'GET' ? 'bg-green-100 text-green-800' :
              record.method === 'POST' ? 'bg-blue-100 text-blue-800' :
              record.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
              record.method === 'DELETE' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {record.method}
            </span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              record.responseStatus >= 200 && record.responseStatus < 300 ? 'bg-green-100 text-green-800' :
              record.responseStatus >= 400 ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {record.responseStatus}
            </span>
            <h2 className="text-lg font-semibold text-gray-900 flex-1 min-w-0 break-all overflow-wrap-anywhere">
              {urlInfo?.pathname || record.url}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          {[
            { key: 'overview', label: '概览' },
            { key: 'headers', label: '请求头' },
            { key: 'request', label: '请求参数' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 will-change-scroll scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">基本信息</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <div className="flex">
                    <span className="font-medium text-gray-700 w-24 text-sm">URL:</span>
                    <span className="text-gray-600 text-sm flex-1 break-all">{record.url}</span>
                  </div>
                  <div className="flex">
                    <span className="font-medium text-gray-700 w-24 text-sm">方法:</span>
                    <span className="text-gray-600 text-sm">{record.method}</span>
                  </div>
                  <div className="flex">
                    <span className="font-medium text-gray-700 w-24 text-sm">状态码:</span>
                    <span className="text-gray-600 text-sm">{record.responseStatus}</span>
                  </div>
                  <div className="flex">
                    <span className="font-medium text-gray-700 w-24 text-sm">响应时间:</span>
                    <span className="text-gray-600 text-sm">{record.responseTime}ms</span>
                  </div>
                  <div className="flex">
                    <span className="font-medium text-gray-700 w-24 text-sm">时间:</span>
                    <span className="text-gray-600 text-sm">{new Date(record.timestamp).toLocaleString()}</span>
                  </div>
                  {record.customTags && record.customTags.length > 0 && (
                    <div className="flex">
                      <span className="font-medium text-gray-700 w-24 text-sm">标签:</span>
                      <div className="flex flex-wrap gap-1">
                        {record.customTags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* URL Breakdown */}
              {urlInfo && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">URL解析</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex">
                      <span className="font-medium text-gray-700 w-24 text-sm">协议:</span>
                      <span className="text-gray-600 text-sm">{urlInfo.protocol}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium text-gray-700 w-24 text-sm">主机:</span>
                      <span className="text-gray-600 text-sm">{urlInfo.host}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium text-gray-700 w-24 text-sm">路径:</span>
                      <span className="text-gray-600 text-sm flex-1 break-all">{urlInfo.pathname}</span>
                    </div>
                    {urlInfo.searchParams.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700 text-sm">查询参数:</span>
                        <div className="mt-2 space-y-1">
                          {urlInfo.searchParams.map(([key, value], index) => (
                            <div key={index} className="flex">
                              <span className="font-medium text-gray-600 w-32 text-sm">{key}:</span>
                              <span className="text-gray-600 text-sm break-all">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'headers' && (
            <div className="space-y-6">
              {/* Request Headers */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">请求头</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  {Object.keys(record.headers).length > 0 ? (
                    <div className="space-y-1">
                      {formatHeaders(record.headers)}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">无请求头信息</p>
                  )}
                </div>
              </div>

              {/* Response Headers */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">响应头</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  {Object.keys(record.responseHeaders).length > 0 ? (
                    <div className="space-y-1">
                      {formatHeaders(record.responseHeaders)}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">无响应头信息</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'request' && (
            <div className="space-y-6">
              {/* Request Parameters */}
              {record.requestParameters && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-gray-900">请求参数</h3>
                    <button
                      onClick={() => copyToClipboard(formatJson(record.requestParameters), 'allParams')}
                      className="flex items-center space-x-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 rounded transition-colors"
                    >
                      {copySuccess.allParams ? (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                          <span>复制全部</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    {/* Query 参数 */}
                    {record.requestParameters.query && Object.keys(record.requestParameters.query).length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-800">Query 参数:</h4>
                          <button
                            onClick={() => copyToClipboard(formatJson(record.requestParameters?.query), 'queryParams')}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                          >
                            {copySuccess.queryParams ? (
                              <>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>已复制</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                </svg>
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {Object.entries(record.requestParameters.query).map(([key, value]) => (
                            <div key={key} className="flex border-b border-gray-100 py-1">
                              <span className="font-medium text-gray-700 w-1/3 text-sm">{key}:</span>
                              <span className="text-gray-600 w-2/3 text-sm break-all">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Path 参数 */}
                    {record.requestParameters.path && record.requestParameters.path.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-gray-800">Path 参数:</h4>
                          <button
                            onClick={() => copyToClipboard(formatJson(record.requestParameters?.path), 'pathParams')}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                          >
                            {copySuccess.pathParams ? (
                              <>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                <span>已复制</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                  <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                </svg>
                                <span>复制</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="space-y-1">
                          {record.requestParameters.path.map((param, index) => (
                            <div key={index} className="flex border-b border-gray-100 py-1">
                              <span className="font-medium text-gray-700 w-1/3 text-sm">{param.name} ({param.type}):</span>
                              <span className="text-gray-600 w-2/3 text-sm break-all">{param.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* 其他参数 */}
                    <div>
                      <button
                        onClick={() => toggleSection('allParams')}
                        className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800 mb-2"
                      >
                        <svg 
                          className={`w-4 h-4 transition-transform ${expandedSections.allParams ? 'rotate-90' : ''}`} 
                          fill="currentColor" 
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>完整参数结构</span>
                      </button>
                      {expandedSections.allParams && (
                        <pre className="text-xs text-gray-500 whitespace-pre-wrap break-words bg-gray-100 p-3 rounded">
                          {formatJson(record.requestParameters)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Request Body */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-medium text-gray-900">请求体</h3>
                    <button
                      onClick={() => {
                        setShowReplayEditor(true);
                        // 滚动到回放编辑区
                        requestAnimationFrame(() => {
                          const el = document.getElementById('replay-editor-anchor');
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                      }}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200 rounded transition-colors min-w-[88px]"
                      title="编辑请求并回放"
                      aria-label="编辑并回放"
                    >
                      编辑并回放
                    </button>
                  </div>
                  <div className="flex-1"></div>
                  {(record.requestParameters?.json || record.requestParameters?.form || record.requestBody) && (
                    <button
                      onClick={() => {
                        const bodyData = record.requestParameters?.json || record.requestParameters?.form || record.requestBody;
                        copyToClipboard(formatJson(bodyData), 'requestBody');
                      }}
                      className="flex items-center space-x-1 px-2 py-1 text-xs bg-green-100 text-green-800 hover:bg-green-200 rounded transition-colors"
                    >
                      {copySuccess.requestBody ? (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>已复制</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                          </svg>
                          <span>复制请求体</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  {record.requestParameters?.json ? (
                    <>
                      <div className="mb-2">
                        <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                          Content-Type: application/json
                        </span>
                      </div>
                      <pre className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                        {formatJson(record.requestParameters.json)}
                      </pre>
                    </>
                  ) : record.requestParameters?.form ? (
                    <>
                      <div className="mb-2">
                        <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                          Content-Type: application/x-www-form-urlencoded
                        </span>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(record.requestParameters.form).map(([key, value]) => (
                          <div key={key} className="flex border-b border-gray-100 py-1">
                            <span className="font-medium text-gray-700 w-1/3 text-sm">{key}:</span>
                            <span className="text-gray-600 w-2/3 text-sm break-all">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : record.requestBody ? (
                    <>
                      <div className="mb-2">
                        <span className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs">
                          Content-Type: {record.requestParameters?.contentType || '未知'}
                        </span>
                      </div>
                      <pre className="text-sm text-gray-600 whitespace-pre-wrap break-words">
                        {formatJson(record.requestBody)}
                      </pre>
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm">无请求体数据</p>
                  )}
                </div>
              </div>

              {/* 回放（可编辑） */}
              <div id="replay-editor-anchor" className={`mt-6 ${showReplayEditor ? '' : 'hidden'}`}>
                <h3 className="text-sm font-medium text-gray-900 mb-3">接口回放（可编辑请求头与体）</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">请求头（JSON）</label>
                    <textarea
                      value={editableHeadersText}
                      onChange={(e) => setEditableHeadersText(e.target.value)}
                      className="w-full h-24 text-xs p-2 border rounded font-mono"
                      placeholder='{"Authorization": "Bearer xxx"}'
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">请求体（JSON，可为空）</label>
                    <textarea
                      value={editableBodyText}
                      onChange={(e) => setEditableBodyText(e.target.value)}
                      className="w-full h-32 text-xs p-2 border rounded font-mono"
                      placeholder='{"key": "value"}'
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={triggerReplay}
                      className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                      disabled={replayLoading}
                    >
                      {replayLoading ? '回放中...' : '回放接口'}
                    </button>
                    {replayError && <span className="text-xs text-red-600">{replayError}</span>}
                  </div>
                  {replayResult && (
                    <div className="bg-white border rounded p-3">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          replayResult.status >= 200 && replayResult.status < 300 ? 'bg-green-100 text-green-800' :
                          replayResult.status >= 400 ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>{replayResult.status}</span>
                        <span className="text-xs text-gray-600">耗时: {replayResult.duration}ms</span>
                        <span className="text-xs text-gray-600">时间: {new Date(replayResult.timestamp).toLocaleString()}</span>
                      </div>
                      <details className="mb-2">
                        <summary className="text-xs text-gray-700 cursor-pointer">响应头</summary>
                        <div className="mt-2">
                          {Object.entries(replayResult.headers).map(([k, v]) => (
                            <div key={k} className="flex border-b border-gray-100 py-1">
                              <span className="font-medium text-gray-700 w-1/3 text-xs">{k}:</span>
                              <span className="text-gray-600 w-2/3 text-xs break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-700 mb-1">响应片段（最多 32KB）</div>
                          <label className="text-xs text-gray-600">
                            <input
                              type="checkbox"
                              className="mr-1"
                              checked={showRawSnippet}
                              onChange={(e) => setShowRawSnippet(e.target.checked)}
                            />
                            原始视图
                          </label>
                        </div>
                        {(() => {
                          if (showRawSnippet) {
                            return (
                              <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
                                {replayResult.bodySnippet}
                              </pre>
                            );
                          }
                          try {
                            const obj = JSON.parse(replayResult.bodySnippet as any);
                            return (
                              <div className="bg-gray-50 p-2 rounded">
                                <JSONTree data={obj} defaultExpandDepth={1} />
                              </div>
                            );
                          } catch {
                            return (
                              <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words bg-gray-50 p-2 rounded">
                                {replayResult.bodySnippet}
                              </pre>
                            );
                          }
                        })()}
                      </div>

                    </div>
                  )}
                </div>
              </div>
            </div>
          )}


        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestDetails;