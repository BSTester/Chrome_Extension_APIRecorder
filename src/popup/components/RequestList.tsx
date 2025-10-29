import React, { useMemo, useState, useCallback } from 'react';
import { RequestRecord } from '../../types';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

interface RequestListProps {
  records: RequestRecord[];
  loading: boolean;
  selectedRecords?: Set<string>;
  onRecordSelection?: (recordIds: string[], selected: boolean) => void;
  onSelectAll?: () => void;
  onDeleteRecord?: (recordId: string) => Promise<void> | void;
  showTitle?: boolean;
}

const RequestList: React.FC<RequestListProps> = ({
  records,
  loading,
  selectedRecords,
  onRecordSelection,
  onSelectAll,
  onDeleteRecord,
  showTitle = true,
}) => {
  void selectedRecords;
  void onRecordSelection;
  void onSelectAll;
  void showTitle;

  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [hoveredRecordId, setHoveredRecordId] = useState<string | null>(null);
  const [toastState, setToastState] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    message: '',
    type: 'success',
  });
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    recordId: string | null;
    title: string;
  }>({
    open: false,
    recordId: null,
    title: '',
  });

  const recordsById = useMemo(() => {
    const map: Record<string, RequestRecord> = {};
    records.forEach((record) => {
      map[record.id] = record;
    });
    return map;
  }, [records]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastState({ show: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToastState((prev) => ({ ...prev, show: false }));
  }, []);

  const getUrlPathWithoutOrigin = useCallback((url: string) => {
    try {
      const { pathname, search, hash } = new URL(url);
      return `${pathname}${search}${hash}`;
    } catch {
      return url;
    }
  }, []);

  const toggleExpanded = (recordId: string) => {
    setExpandedRecordId((prev) => (prev === recordId ? null : recordId));
  };


  const openDeleteDialog = useCallback(
    (event: React.MouseEvent, recordId: string) => {
      event.stopPropagation();
      const targetRecord = recordsById[recordId];
      if (!targetRecord) {
        return;
      }

      const path = getUrlPathWithoutOrigin(targetRecord.url);
      setConfirmState({ open: true, recordId, title: path });
    },
    [recordsById, getUrlPathWithoutOrigin]
  );

  const closeDeleteDialog = useCallback(() => {
    setConfirmState({ open: false, recordId: null, title: '' });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!confirmState.recordId || !onDeleteRecord) {
      closeDeleteDialog();
      return;
    }

    try {
      await onDeleteRecord(confirmState.recordId);
      showToast('接口已删除', 'success');
      setExpandedRecordId((prev) => (prev === confirmState.recordId ? null : prev));
    } catch (error) {
      console.error('删除接口失败', error);
      showToast('删除接口失败，请稍后重试', 'error');
    } finally {
      closeDeleteDialog();
    }
  }, [confirmState.recordId, onDeleteRecord, showToast, closeDeleteDialog]);

  const getMethodClass = (method: string) => {
    switch (method.toLowerCase()) {
      case 'get':
        return 'method-get';
      case 'post':
        return 'method-post';
      case 'put':
        return 'method-put';
      case 'patch':
        return 'method-patch';
      case 'delete':
        return 'method-delete';
      case 'options':
        return 'method-options';
      default:
        return 'method-options';
    }
  };

  const getStatusClass = (status: number) => {
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return 'status-info';
  };

  const formatUrl = (url: string, maxLength: number = 50) => {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname + urlObj.search;
      return path.length > maxLength ? `${path.substring(0, maxLength)}...` : path;
    } catch {
      return url.length > maxLength ? `${url.substring(0, maxLength)}...` : url;
    }
  };

  const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

  const formatResponseTime = (responseTime: number) =>
    responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`;

  const formatSize = (data: any) => {
    if (!data) return '-';
    const size = JSON.stringify(data).length;
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  };

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-48 text-gray-500">
      <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
      <p className="text-sm">暂无录制记录</p>
      <p className="text-xs text-gray-400 mt-1">开始录制以查看HTTP请求</p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (records.length === 0) {
    return renderEmptyState();
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="divide-y divide-gray-200">
          {records.map((record) => {
            const isExpanded = expandedRecordId === record.id;
            const isHovered = hoveredRecordId === record.id;
            const displayUrl = formatUrl(record.url);
            const canShowResponseSize = Boolean(record.responseBody);

            return (
              <div
                key={record.id}
                className="group p-3 hover:bg-gray-50 transition-colors"
                onMouseEnter={() => setHoveredRecordId(record.id)}
                onMouseLeave={() => setHoveredRecordId((prev) => (prev === record.id ? null : prev))}
              >
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleExpanded(record.id)}
                  >
                    <span className={`px-2 py-1 text-xs font-medium rounded ${getMethodClass(record.method)}`}>
                      {record.method}
                    </span>
                    <span className="text-sm text-gray-900 truncate flex-1" title={record.url}>
                      {displayUrl}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <div className="flex items-center space-x-3">
                      <span className={`font-medium ${getStatusClass(record.responseStatus)}`}>
                        {record.responseStatus}
                      </span>
                      <span>{formatResponseTime(record.responseTime)}</span>
                      <span>{formatTime(record.timestamp)}</span>
                    </div>

                    <button
                      type="button"
                      disabled={!onDeleteRecord}
                      className={`flex items-center space-x-1 px-2 py-1 text-xs transition-colors ${
                        onDeleteRecord
                          ? 'text-red-500 hover:text-red-700'
                          : 'text-gray-400 cursor-not-allowed'
                      } ${isHovered && onDeleteRecord ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      onClick={(event) => {
                        if (!onDeleteRecord) {
                          event.stopPropagation();
                          return;
                        }
                        openDeleteDialog(event, record.id);
                      }}
                      title="删除接口"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M15 6V4a2 2 0 00-2-2h-2a2 2 0 00-2 2v2" />
                      </svg>
                      <span>删除</span>
                    </button>

                    <button
                      type="button"
                      className="ml-2 flex items-center justify-center w-6 h-6 text-gray-400 hover:text-gray-600 transition-transform"
                      onClick={() => toggleExpanded(record.id)}
                      aria-label="展开详情"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">完整URL:</span>
                        <div className="text-gray-900 break-all">{record.url}</div>
                      </div>
                      <div>
                        <span className="text-gray-500">页面:</span>
                        <div className="text-gray-900 break-all">{record.pageUrl}</div>
                      </div>
                      {canShowResponseSize && (
                        <div>
                          <span className="text-gray-500">响应大小:</span>
                          <div className="text-gray-900">{formatSize(record.responseBody)}</div>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">请求大小:</span>
                        <div className="text-gray-900">{formatSize(record.requestBody)}</div>
                      </div>
                    </div>

                    {Object.keys(record.headers).length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">请求头</h5>
                        <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                          <pre className="text-xs text-gray-600">
                            {Object.entries(record.headers)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {Object.keys(record.responseHeaders).length > 0 && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">响应头</h5>
                        <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                          <pre className="text-xs text-gray-600">
                            {Object.entries(record.responseHeaders)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}

                    {record.requestBody && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">请求体</h5>
                        <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                          <pre className="text-xs text-gray-600">
                            {typeof record.requestBody === 'string'
                              ? record.requestBody
                              : JSON.stringify(record.requestBody, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {record.responseBody && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-700 mb-2">响应体</h5>
                        <div className="bg-white rounded border p-2 max-h-32 overflow-y-auto scrollbar-thin">
                          <pre className="text-xs text-gray-600">
                            {typeof record.responseBody === 'string'
                              ? record.responseBody
                              : JSON.stringify(record.responseBody, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    <div className="flex space-x-2 pt-2 border-t border-gray-200">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigator.clipboard.writeText(record.url);
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors"
                      >
                        复制URL
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void navigator.clipboard.writeText(JSON.stringify(record, null, 2));
                        }}
                        className="px-3 py-1 bg-gray-100 text-gray-800 rounded text-xs hover:bg-gray-200 transition-colors"
                      >
                        复制JSON
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {toastState.show && (
        <Toast message={toastState.message} type={toastState.type} onClose={hideToast} />
      )}

      <ConfirmDialog
        isOpen={confirmState.open}
        title="删除接口"
        message={`确定要删除该接口吗？\n\n${confirmState.title}`}
        confirmText="删除"
        cancelText="取消"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
        onConfirm={confirmDelete}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
};

export default RequestList;
