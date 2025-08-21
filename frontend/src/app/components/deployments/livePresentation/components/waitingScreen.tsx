import React from 'react';
import { 
  ClockIcon,
  UserGroupIcon,
  AcademicCapIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { GroupInfo } from '../types/livePresentation';

interface WaitingScreenProps {
  title: string;
  welcomeMessage?: string | null;
  groupInfo?: GroupInfo | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string | null;
}

export const WaitingScreen: React.FC<WaitingScreenProps> = ({
  title,
  welcomeMessage,
  groupInfo,
  connectionStatus,
  error
}) => {
  if (error || connectionStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <ExclamationTriangleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Error</h2>
            <p className="text-gray-600 mb-4">
              {error || 'Failed to connect to the live presentation.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (connectionStatus === 'connecting') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Connecting...</h2>
            <p className="text-gray-600">
              Joining the live presentation session.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-indigo-600 px-8 py-6">
            <div className="flex items-center space-x-3 text-white">
              <AcademicCapIcon className="h-8 w-8" />
              <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-indigo-200">Live Presentation</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Welcome message */}
            {welcomeMessage && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">{welcomeMessage}</p>
              </div>
            )}

            {/* Waiting state */}
            <div className="text-center mb-8">
              <ClockIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Waiting for Presentation to Begin
              </h2>
              <p className="text-gray-600 max-w-md mx-auto">
                You're connected and ready to go! Your instructor will start the presentation shortly. 
                When they do, you'll see prompts and content appear here.
              </p>
            </div>

            {/* Group information */}
            {groupInfo && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <UserGroupIcon className="h-6 w-6 text-purple-600" />
                  <h3 className="text-lg font-semibold text-purple-900">Your Group</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-purple-800">Group Name:</p>
                    <p className="text-lg text-purple-900">{groupInfo.group_name}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-purple-800 mb-2">
                      Group Members ({groupInfo.group_members.length}):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {groupInfo.group_members.map((member, index) => (
                        <div 
                          key={index}
                          className="bg-white px-3 py-2 rounded border border-purple-200 text-sm text-purple-900"
                        >
                          {member}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className="mt-8 bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">What to Expect</h3>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-2 h-2 bg-indigo-600 rounded-full mt-2"></span>
                  <span>Your instructor may send prompts for you to respond to</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-2 h-2 bg-indigo-600 rounded-full mt-2"></span>
                  <span>You might receive your group information or assignments</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-2 h-2 bg-indigo-600 rounded-full mt-2"></span>
                  <span>Watch for "I'm Ready" buttons to signal your participation</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="flex-shrink-0 w-2 h-2 bg-indigo-600 rounded-full mt-2"></span>
                  <span>Stay connected and engaged throughout the session</span>
                </li>
              </ul>
            </div>

            {/* Connection status */}
            <div className="mt-6 flex items-center justify-center space-x-2 text-sm">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-green-700 font-medium">Connected and ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};




