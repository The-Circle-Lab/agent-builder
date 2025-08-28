import React from 'react';
import { 
  UserIcon, 
  SignalIcon, 
  UserGroupIcon,
  ExclamationTriangleIcon,
  TvIcon
} from '@heroicons/react/24/outline';
import { GroupInfo } from '../types/livePresentation';

interface StudentHeaderProps {
  title: string;
  userName: string;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  groupInfo?: GroupInfo | null;
  readyCheckActive: boolean;
  isReady: boolean;
  onReady: () => void;
  isRoomcastMode?: boolean;
}

export const StudentHeader: React.FC<StudentHeaderProps> = ({
  title,
  userName,
  connectionStatus,
  groupInfo,
  readyCheckActive,
  isReady,
  onReady,
  isRoomcastMode = false
}) => {
  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'disconnected': 
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'connected': 
        return <SignalIcon className="h-5 w-5 text-green-600" />;
      case 'connecting':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600"></div>;
      case 'disconnected':
      case 'error':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <SignalIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className={`shadow-sm border-b ${isRoomcastMode ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side - Title and user */}
          <div className="flex items-center space-x-4">
            {isRoomcastMode && (
              <div className="flex items-center space-x-2 text-indigo-600">
                <TvIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Roomcast Mode</span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <UserIcon className="h-4 w-4" />
                <span>{userName}</span>
                {isRoomcastMode && (
                  <span className="text-xs text-indigo-600">• Check group display for instructions</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Status and controls */}
          <div className="flex items-center space-x-4">
            {/* Group info */}
            {groupInfo && (
              <div className="flex items-center space-x-2 text-sm">
                <UserGroupIcon className="h-4 w-4 text-purple-600" />
                <div className="text-center">
                  <div className="font-medium text-gray-900">{groupInfo.group_name}</div>
                  <div className="text-xs text-gray-500">
                    {groupInfo.group_members.length} members
                  </div>
                </div>
              </div>
            )}

            {/* Ready check button */}
            {readyCheckActive && (
              <button
                onClick={onReady}
                disabled={isReady}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                  isReady
                    ? 'text-green-800 bg-green-100 cursor-not-allowed'
                    : 'text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                }`}
              >
                {isReady ? 'Ready!' : "I'm Ready"}
              </button>
            )}

            {/* Connection status */}
            <div className="flex items-center space-x-2">
              {getConnectionIcon()}
              <span className={`text-sm font-medium ${getConnectionColor()}`}>
                {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};




