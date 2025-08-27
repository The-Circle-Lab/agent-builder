import React, { useState, useEffect } from 'react';
import { 
  XMarkIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useLivePresentationWebSocket } from '../hooks/useLivePresentationWebSocket';
import { TeacherControlPanel } from './teacherControlPanel';
import { StudentResponsesPanel } from './studentResponsesPanel';
import { LivePresentationInfo, LivePresentationPrompt } from '../types/livePresentation';
import { API_CONFIG } from '@/lib/constants';

interface LivePresentationAdminProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export const LivePresentationAdmin: React.FC<LivePresentationAdminProps> = ({
  deploymentId,
  deploymentName,
  onClose
}) => {
  const [deploymentInfo, setDeploymentInfo] = useState<LivePresentationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'control' | 'responses'>('control');

  const {
    isConnected,
    connectionStatus,
    error: wsError,
    stats,
    savedPrompts,
    studentResponses,
    presentationActive,
    sendPrompt,
    sendGroupInfo,
    startReadyCheck,
    requestStats,
    manualReconnect,
    startPresentation,
    endPresentation
  } = useLivePresentationWebSocket({
    deploymentId,
    isTeacher: true
  });

  // Fetch deployment info
  useEffect(() => {
    const fetchDeploymentInfo = async () => {
      try {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/info`,
          { credentials: 'include' }
        );

        if (response.ok) {
          const info = await response.json();
          setDeploymentInfo(info);
        } else {
          throw new Error('Failed to fetch deployment info');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load presentation');
      } finally {
        setLoading(false);
      }
    };

    fetchDeploymentInfo();
  }, [deploymentId]);

  // Auto-refresh stats every 10 seconds when connected
  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(() => {
        requestStats();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [isConnected, requestStats]);

  const handleSendPrompt = (prompt: LivePresentationPrompt) => {
    sendPrompt(prompt);
    // Optionally switch to responses tab to see incoming responses
    setActiveTab('responses');
  };

  const handleRefreshStats = () => {
    requestStats();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading presentation admin...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="flex space-x-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
              >
                Retry
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Live Presentation Admin
              </h2>
              <p className="text-sm text-gray-600">
                {deploymentInfo?.title || deploymentName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('control')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'control'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Control Panel
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'responses'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Student Responses
              {studentResponses.length > 0 && (
                <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  {studentResponses.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {wsError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Connection Error</h3>
                  <p className="mt-1 text-sm text-red-700">{wsError}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'control' && (
            <TeacherControlPanel
              stats={stats}
              savedPrompts={savedPrompts}
              connectionStatus={connectionStatus}
              presentationActive={presentationActive}
              onSendPrompt={handleSendPrompt}
              onSendGroupInfo={sendGroupInfo}
              onStartReadyCheck={startReadyCheck}
              onRefreshStats={handleRefreshStats}
              onStartPresentation={startPresentation}
              onEndPresentation={endPresentation}
              manualReconnect={manualReconnect}
            />
          )}

          {activeTab === 'responses' && (
            <StudentResponsesPanel
              responses={studentResponses}
              students={stats?.students || []}
              currentPromptId={stats?.current_prompt?.id}
            />
          )}
        </div>
      </div>
    </div>
  );
};
