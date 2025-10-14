import React from 'react';

const Header: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm5 2a1 1 0 000 2h4a1 1 0 100-2H8z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold">API Recorder</h1>
            <p className="text-blue-100 text-sm">HTTP 接口录制与导出工具</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;