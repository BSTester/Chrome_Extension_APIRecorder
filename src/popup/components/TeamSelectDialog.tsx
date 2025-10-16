import React, { useEffect, useState } from 'react';
import { Team } from '../hooks/useTeams';

interface Props {
  visible: boolean;
  teams: Team[];
  loading?: boolean;
  onRefresh?: () => Promise<void>;
  onCancel: () => void;
  onConfirm: (teamId: string) => Promise<void> | void;
}

const TeamSelectDialog: React.FC<Props> = ({ visible, teams, loading, onRefresh, onCancel, onConfirm }) => {
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (visible) {
      // 默认选择第一个
      setSelected((prev) => (prev || (teams[0]?.id ?? '')));
    } else {
      setSelected('');
    }
  }, [visible, teams]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white w-[360px] rounded-lg shadow-lg p-4">
        <h3 className="text-base font-semibold text-gray-800 mb-3">选择同步的团队</h3>
        <div className="space-y-2">
          {teams.length === 0 ? (
            <div className="text-sm text-gray-500">
              暂无团队数据{loading ? '，正在加载...' : '。'}
            </div>
          ) : (
            <div>
              <label className="block text-sm text-gray-600 mb-1">选择团队</label>
              <select
                className="w-full border rounded px-2 py-1 text-sm text-black"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-between items-center">
          <button
            className="px-2 py-1.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <div className="space-x-2">
            {onRefresh && (
              <button
                className={`px-2 py-1.5 text-xs rounded ${loading ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                onClick={onRefresh}
                disabled={loading}
              >
                刷新团队
              </button>
            )}
            <button
              className={`px-3 py-1.5 text-xs rounded ${!selected || loading ? 'bg-gray-300 text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
              onClick={async () => {
                if (!selected) return;
                await onConfirm(selected);
              }}
              disabled={!selected || !!loading}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamSelectDialog;