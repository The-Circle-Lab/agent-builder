import React, { useState, useEffect, useCallback } from 'react';
import {
  XMarkIcon,
  TvIcon,
  QrCodeIcon,
  CheckCircleIcon,
  ClockIcon,
  UserGroupIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { RoomcastStatus } from '../types/livePresentation';
import { API_CONFIG } from '@/lib/constants';

interface RoomcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartWithoutRoomcast: () => void;
  deploymentId: string;
}

export const RoomcastModal: React.FC<RoomcastModalProps> = ({
  isOpen,
  onClose,
  onStartWithoutRoomcast,
  deploymentId
}) => {
  const [roomcastStatus, setRoomcastStatus] = useState<RoomcastStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch roomcast status
  const fetchRoomcastStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/roomcast/status`,
        { credentials: 'include' }
      );
      
      if (response.ok) {
        const status = await response.json();
        setRoomcastStatus(status);
      } else {
        throw new Error('Failed to fetch roomcast status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roomcast status');
    }
  }, [deploymentId]);

  // Start roomcast session
  const startRoomcast = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/roomcast/start`,
        { 
          method: 'POST',
          credentials: 'include' 
        }
      );
      
      if (response.ok) {
        const status = await response.json();
        setRoomcastStatus(status);
      } else {
        throw new Error('Failed to start roomcast');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start roomcast');
    } finally {
      setLoading(false);
    }
  };

  // Cancel roomcast session
  const cancelRoomcast = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/roomcast/cancel`,
        { 
          method: 'POST',
          credentials: 'include' 
        }
      );
      
      if (response.ok) {
        const status = await response.json();
        setRoomcastStatus(status);
      } else {
        throw new Error('Failed to cancel roomcast');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel roomcast');
    } finally {
      setLoading(false);
    }
  };

  // Fetch status when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchRoomcastStatus();
      // Refresh status every 3 seconds while modal is open
      const interval = setInterval(fetchRoomcastStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen, deploymentId, fetchRoomcastStatus]);

  if (!isOpen) return null;

  const isWaiting = roomcastStatus?.waiting;
  const hasCode = roomcastStatus?.code;
  const connectedGroups = roomcastStatus?.connected_groups || [];
  const expectedGroups = roomcastStatus?.expected_groups || [];
  const allGroupsConnected = expectedGroups.length > 0 && connectedGroups.length === expectedGroups.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
              <TvIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              Roomcast Setup
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-2">What is Roomcast?</h3>
            <p className="text-blue-800 text-sm">
              Connect additional displays to show instructions for each group. Students will only see 
              interactive elements (text boxes, buttons) while the displays show the full prompts.
            </p>
          </div>

          {/* Expected Groups */}
          {expectedGroups.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                <UserGroupIcon className="h-5 w-5 mr-2" />
                Expected Groups ({expectedGroups.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {expectedGroups.map((group) => {
                  const isConnected = connectedGroups.includes(group);
                  return (
                    <div
                      key={group}
                      className={`p-3 rounded-lg border text-sm ${
                        isConnected
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{group}</span>
                        {isConnected && (
                          <CheckCircleIcon className="h-4 w-4 text-green-600" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Code Display */}
          {hasCode && isWaiting && (
            <div className="text-center">
              <h3 className="font-medium text-gray-900 mb-3 flex items-center justify-center">
                <QrCodeIcon className="h-5 w-5 mr-2" />
                Roomcast Code
              </h3>
              <div className="bg-gray-100 rounded-lg p-6">
                <div className="text-4xl font-mono font-bold text-gray-900 tracking-widest mb-2">
                  {roomcastStatus.code}
                </div>
                <p className="text-sm text-gray-600">
                  Share this code with your display devices
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Go to: <span className="font-mono">{window.location.origin}/roomcast</span>
                </p>
              </div>
              
              {roomcastStatus.code_expires_at && (
                <div className="mt-3 flex items-center justify-center text-sm text-gray-500">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  Expires: {new Date(roomcastStatus.code_expires_at).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {/* Status Messages */}
          {allGroupsConnected && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-green-800 font-medium">
                  All groups connected! Ready to start presentation.
                </span>
              </div>
            </div>
          )}

          {isWaiting && !allGroupsConnected && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center">
                <ClockIcon className="h-5 w-5 text-yellow-600 mr-2" />
                <span className="text-yellow-800">
                  Waiting for {expectedGroups.length - connectedGroups.length} more group(s) to connect...
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between">
          <div className="flex space-x-3">
            {!hasCode || !isWaiting ? (
              <button
                onClick={startRoomcast}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium rounded-md ${
                  loading
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {loading ? 'Starting...' : 'Start Roomcast'}
              </button>
            ) : (
              <button
                onClick={cancelRoomcast}
                disabled={loading}
                className={`px-4 py-2 text-sm font-medium rounded-md border ${
                  loading
                    ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {loading ? 'Canceling...' : 'Cancel Roomcast'}
              </button>
            )}
          </div>

          <div className="flex space-x-3">
            <button
              onClick={onStartWithoutRoomcast}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Start Without Roomcast
            </button>
            <button
              onClick={() => {
                if (allGroupsConnected || !isWaiting) {
                  onStartWithoutRoomcast(); // This will actually start the presentation
                }
              }}
              disabled={isWaiting && !allGroupsConnected}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                (!isWaiting || allGroupsConnected)
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Start Presentation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
