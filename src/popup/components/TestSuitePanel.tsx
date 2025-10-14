import React, { useState } from 'react';
import { TestSuite } from '../../types';

interface TestSuitePanelProps {
  testSuites: TestSuite[];
  activeSuite: TestSuite | null;
  onSuiteChange: (suite: TestSuite | null) => void;
}

const TestSuitePanel: React.FC<TestSuitePanelProps> = ({
  testSuites,
  activeSuite,
  onSuiteChange
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState('');
  const [newSuiteDescription, setNewSuiteDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateSuite = async () => {
    if (!newSuiteName.trim()) return;

    setLoading(true);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_TEST_SUITE',
        data: {
          suiteName: newSuiteName.trim(),
          description: newSuiteDescription.trim() || undefined
        }
      });

      if (response.success) {
        setNewSuiteName('');
        setNewSuiteDescription('');
        setShowCreateModal(false);
        // 刷新套件列表
        window.location.reload();
      }
    } catch (error) {
      alert('创建测试套件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSuite = async (suite: TestSuite) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_SUITE',
        data: { suiteId: suite.suiteId }
      });

      if (response.success) {
        onSuiteChange(suite);
      }
    } catch (error) {
      alert('激活测试套件失败');
    }
  };

  const handleDeleteSuite = async (suite: TestSuite) => {
    if (!confirm(`确定要删除测试套件 "${suite.suiteName}" 吗？`)) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_TEST_SUITE',
        data: { suiteId: suite.suiteId }
      });

      if (response.success) {
        if (activeSuite?.suiteId === suite.suiteId) {
          onSuiteChange(null);
        }
        // 刷新套件列表
        window.location.reload();
      }
    } catch (error) {
      alert('删除测试套件失败');
    }
  };

  return (
    <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin">
      {/* 头部操作 */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">测试套件管理</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
        >
          + 新建套件
        </button>
      </div>

      {/* 当前活跃套件 */}
      {activeSuite && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-green-800">当前活跃套件</h4>
              <p className="text-green-700">{activeSuite.suiteName}</p>
              {activeSuite.description && (
                <p className="text-xs text-green-600 mt-1">{activeSuite.description}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-xs text-green-600">
                {activeSuite.requestCount} 个用例
              </div>
              <div className="text-xs text-green-500">
                {new Date(activeSuite.updatedAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 套件列表 */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">所有测试套件</h4>
        
        {testSuites.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-gray-500 text-sm">还没有创建任何测试套件</p>
            <p className="text-xs text-gray-400 mt-1">点击"新建套件"开始组织您的测试用例</p>
          </div>
        ) : (
          <div className="space-y-2">
            {testSuites.map((suite) => (
              <div
                key={suite.suiteId}
                className={`border rounded-lg p-3 hover:bg-gray-50 transition-colors ${
                  suite.isActive ? 'border-blue-300 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h5 className="font-medium text-gray-800">{suite.suiteName}</h5>
                      {suite.isActive && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          活跃
                        </span>
                      )}
                      {suite.tags?.includes('auto-generated') && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                          自动创建
                        </span>
                      )}
                    </div>
                    
                    {suite.description && (
                      <p className="text-sm text-gray-600 mt-1">{suite.description}</p>
                    )}
                    
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>{suite.requestCount} 个测试用例</span>
                      <span>创建于 {new Date(suite.createdAt).toLocaleDateString()}</span>
                      {suite.updatedAt !== suite.createdAt && (
                        <span>更新于 {new Date(suite.updatedAt).toLocaleDateString()}</span>
                      )}
                    </div>

                    {suite.tags && suite.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {suite.tags.filter(tag => tag !== 'auto-generated').map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-1 ml-3">
                    {!suite.isActive && (
                      <button
                        onClick={() => handleActivateSuite(suite)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="激活此套件"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteSuite(suite)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="删除套件"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 012 0v6a1 1 0 11-2 0V7zM12 7a1 1 0 112 0v6a1 1 0 11-2 0V7z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建套件模态框 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">创建新测试套件</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  套件名称 *
                </label>
                <input
                  type="text"
                  value={newSuiteName}
                  onChange={(e) => setNewSuiteName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="输入测试套件名称"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <textarea
                  value={newSuiteDescription}
                  onChange={(e) => setNewSuiteDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="描述这个测试套件的用途（可选）"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={loading}
              >
                取消
              </button>
              <button
                onClick={handleCreateSuite}
                disabled={!newSuiteName.trim() || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestSuitePanel;