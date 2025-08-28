import React, { useState } from 'react';
import {
  PlayIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  StopIcon
} from '@heroicons/react/24/outline';
import { 
  LivePresentationPrompt, 
  PresentationStats 
} from '../types/livePresentation';
import { RoomcastModal } from './RoomcastModal';
import { API_CONFIG } from '@/lib/constants';

interface TeacherControlPanelProps {
  stats: PresentationStats | null;
  savedPrompts: LivePresentationPrompt[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  presentationActive: boolean;
  deploymentId: string;
  onSendPrompt: (prompt: LivePresentationPrompt) => void;
  onSendGroupInfo: () => void;
  onStartReadyCheck: () => void;
  onRefreshStats: () => void;
  onStartPresentation: () => void;
  onEndPresentation: () => void;
  onTestConnections: () => void;
  manualReconnect?: () => void;
}

export const TeacherControlPanel: React.FC<TeacherControlPanelProps> = ({
  stats,
  savedPrompts,
  connectionStatus,
  presentationActive,
  deploymentId,
  onSendPrompt,
  onSendGroupInfo,
  onStartReadyCheck,
  onRefreshStats,
  onStartPresentation,
  onEndPresentation,
  manualReconnect
}) => {
  const [selectedPrompt, setSelectedPrompt] = useState<LivePresentationPrompt | null>(null);
  const [showRoomcastModal, setShowRoomcastModal] = useState(false);
  const [togglingRoomcast, setTogglingRoomcast] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isRoomcastEnabled = stats?.roomcast?.enabled || false;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString();
  };

  const handleSendThankYou = () => {
    // Find the system thank you prompt
    const thankYouPrompt = savedPrompts.find(prompt => 
      prompt.id === 'system_thank_you' && prompt.isSystemPrompt
    );
    
    if (thankYouPrompt) {
      onSendPrompt(thankYouPrompt);
    } else {
      console.warn('Thank you prompt not found in saved prompts');
    }
  };

  const handleStartPresentation = () => {
    if (isRoomcastEnabled) {
      setShowRoomcastModal(true);
    } else {
      onStartPresentation();
    }
  };

  const handleToggleRoomcast = async () => {
    if (!deploymentId || togglingRoomcast) return;
    setTogglingRoomcast(true);
    try {
      const url = `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/roomcast/toggle`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !isRoomcastEnabled })
      });
      if (!response.ok) {
        console.warn('Failed to toggle roomcast:', response.status);
      }
    } catch (e) {
      console.warn('Error toggling roomcast:', e);
    } finally {
      setTogglingRoomcast(false);
      onRefreshStats();
    }
  };

  return (
    <div className="space-y-6">
      {/* Presentation Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Presentation Control</h3>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-900">Roomcast Support</span>
            <span className="text-xs text-gray-600">Enable room display devices via 5-character code</span>
          </div>
          <button
            onClick={handleToggleRoomcast}
            disabled={!isConnected || togglingRoomcast}
            aria-pressed={isRoomcastEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              isConnected && !togglingRoomcast
                ? (isRoomcastEnabled ? 'bg-indigo-600' : 'bg-gray-200')
                : 'bg-gray-200 opacity-60 cursor-not-allowed'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isRoomcastEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        
        {!presentationActive ? (
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-yellow-100 text-yellow-800 text-sm font-medium">
                Presentation Not Started
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Students are waiting for you to start the presentation. Click the button below to begin.
            </p>
            <button
              onClick={handleStartPresentation}
              disabled={!isConnected}
              className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md ${
                isConnected
                  ? 'text-white bg-green-600 hover:bg-green-700'
                  : 'text-gray-400 bg-gray-200 cursor-not-allowed'
              }`}
            >
              <PlayIcon className="h-5 w-5 mr-2" />
              Start Presentation
              {isRoomcastEnabled && (
                <span className="ml-2 text-xs bg-indigo-200 text-indigo-800 px-2 py-1 rounded">
                  Roomcast
                </span>
              )}
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                Presentation Active
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              The presentation is running. Students can participate and receive prompts.
            </p>
            <button
              onClick={onEndPresentation}
              disabled={!isConnected}
              className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md ${
                isConnected
                  ? 'text-white bg-red-600 hover:bg-red-700'
                  : 'text-gray-400 bg-gray-200 cursor-not-allowed'
              }`}
            >
              <StopIcon className="h-5 w-5 mr-2" />
              End Presentation
            </button>
          </div>
        )}
      </div>

      {/* Connection Status */}
      <div className={`rounded-lg p-4 ${
        isConnected 
          ? 'bg-green-50 border border-green-200' 
          : 'bg-red-50 border border-red-200'
      }`}>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className={`font-medium ${
            isConnected ? 'text-green-800' : 'text-red-800'
          }`}>
            {isConnected ? 'Connected to Live Presentation' : `Disconnected (${connectionStatus})`}
          </span>
        </div>
        {!isConnected && connectionStatus === 'error' && (
          <div className="mt-2 text-sm text-red-700">
            Check browser console for detailed connection information
          </div>
        )}
        {!isConnected && (
          <button
            onClick={() => manualReconnect?.()}
            className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Try Reconnect
          </button>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={onStartReadyCheck}
            disabled={!isConnected || !presentationActive}
            className={`flex items-center justify-center space-x-2 p-4 rounded-lg border-2 border-dashed transition-colors ${
              isConnected && presentationActive
                ? 'border-green-300 text-green-700 hover:border-green-400 hover:bg-green-50'
                : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            <CheckCircleIcon className="h-6 w-6" />
            <span className="font-medium">Start Ready Check</span>
          </button>

          <button
            onClick={onSendGroupInfo}
            disabled={!isConnected || !presentationActive}
            className={`flex items-center justify-center space-x-2 p-4 rounded-lg border-2 border-dashed transition-colors ${
              isConnected && presentationActive
                ? 'border-purple-300 text-purple-700 hover:border-purple-400 hover:bg-purple-50'
                : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            <UserGroupIcon className="h-6 w-6" />
            <span className="font-medium">Send Group Info</span>
          </button>

          <button
            onClick={handleSendThankYou}
            disabled={!isConnected || !presentationActive}
            className={`flex items-center justify-center space-x-2 p-4 rounded-lg border-2 border-dashed transition-colors ${
              isConnected && presentationActive
                ? 'border-pink-300 text-pink-700 hover:border-pink-400 hover:bg-pink-50'
                : 'border-gray-300 text-gray-400 cursor-not-allowed'
            }`}
          >
            <HeartIcon className="h-6 w-6" />
            <span className="font-medium">Thank You</span>
          </button>

          <button
            onClick={onRefreshStats}
            className="flex items-center justify-center space-x-2 p-4 rounded-lg border-2 border-dashed border-blue-300 text-blue-700 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <ChartBarIcon className="h-6 w-6" />
            <span className="font-medium">Refresh Stats</span>
          </button>
        </div>
      </div>

      {/* Live Statistics */}
      {stats && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Live Statistics</h3>
            <span className="text-sm text-gray-500">
              Last updated: {formatDate(new Date().toISOString())}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.connected_students}</div>
              <div className="text-sm text-gray-600">Connected Students</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.ready_students}</div>
              <div className="text-sm text-gray-600">Ready Students</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">{Object.keys(stats.group_stats).length}</div>
              <div className="text-sm text-gray-600">Active Groups</div>
            </div>
          </div>

          {/* Current Activity Status */}
          {stats.ready_check_active && (
            <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <CheckCircleIcon className="h-5 w-5 text-orange-600" />
                <span className="font-medium text-orange-900">Ready Check Active</span>
                <span className="text-sm text-orange-700">
                  ({stats.ready_students} of {stats.connected_students} ready)
                </span>
              </div>
              <p className="text-orange-800 text-sm">
                Students are responding to the ready check. Click &quot;Start Ready Check&quot; again to send a new one.
              </p>
            </div>
          )}
          
          {stats.current_prompt && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <PaperAirplaneIcon className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900">Current Prompt Active</span>
                <span className="text-sm text-blue-700">
                  (sent at {formatDate(stats.current_prompt.sent_at)})
                </span>
              </div>
              <p className="text-blue-800 text-sm">
                {stats.current_prompt.statement.length > 100 
                  ? `${stats.current_prompt.statement.substring(0, 100)}...`
                  : stats.current_prompt.statement
                }
              </p>
            </div>
          )}

          {/* Group Statistics */}
          {Object.keys(stats.group_stats).length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Group Connections</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(stats.group_stats).map(([groupName, groupStat]) => (
                  <div key={groupName} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{groupName}</span>
                      <span className="text-sm text-gray-600">
                        {groupStat.connected_members}/{groupStat.total_members}
                      </span>
                    </div>
                    <div className="mt-1 w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${(groupStat.connected_members / groupStat.total_members) * 100}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved Prompts */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Saved Prompts ({savedPrompts.length})
          </h3>
          {!presentationActive && (
            <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
              Start presentation to send prompts
            </div>
          )}
        </div>

        {savedPrompts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No saved prompts available</p>
            <p className="text-sm">Create prompts in the workflow editor first</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedPrompts.map((prompt) => (
              <div
                key={prompt.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedPrompt?.id === prompt.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedPrompt(selectedPrompt?.id === prompt.id ? null : prompt)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-gray-900 font-medium">
                      {prompt.statement.length > 80 
                        ? `${prompt.statement.substring(0, 80)}...`
                        : prompt.statement
                      }
                    </p>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-600">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        prompt.hasInput ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {prompt.hasInput ? `Input: ${prompt.inputType}` : 'No Input'}
                      </span>
                      {prompt.useRandomListItem && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          Random List Item
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSendPrompt(prompt);
                    }}
                    disabled={!isConnected || !presentationActive}
                    className={`ml-4 inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md ${
                      isConnected && presentationActive
                        ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                        : 'text-gray-400 bg-gray-200 cursor-not-allowed'
                    }`}
                  >
                    <PlayIcon className="h-4 w-4 mr-2" />
                    Send
                  </button>
                </div>
                
                {selectedPrompt?.id === prompt.id && (
                  <div className="mt-4 pt-4 border-t border-indigo-200">
                    <div className="text-sm space-y-2">
                      <p><strong>Full Statement:</strong></p>
                      <p className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border">
                        {prompt.statement}
                      </p>
                      {prompt.hasInput && (
                        <div className="space-y-1">
                          <p><strong>Input Type:</strong> {prompt.inputType}</p>
                          {prompt.inputPlaceholder && (
                            <p><strong>Placeholder:</strong> {prompt.inputPlaceholder}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roomcast Modal */}
      <RoomcastModal
        isOpen={showRoomcastModal}
        onClose={() => setShowRoomcastModal(false)}
        onStartWithoutRoomcast={() => {
          setShowRoomcastModal(false);
          onStartPresentation();
        }}
        deploymentId={deploymentId}
      />
    </div>
  );
};
