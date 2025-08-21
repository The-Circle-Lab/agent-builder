"use client";

import React, { useState, useEffect } from 'react';
import { useLivePresentationWebSocket } from './hooks/useLivePresentationWebSocket';
import { StudentHeader } from './components/studentHeader';
import { PromptDisplay } from './components/promptDisplay';
import { WaitingScreen } from './components/waitingScreen';
import { LivePresentationInfo } from './types/livePresentation';
import { API_CONFIG } from '@/lib/constants';

interface LivePresentationInterfaceProps {
  deploymentId: string;
  userId: string;
  userName: string;
}

export default function LivePresentationInterface({ 
  deploymentId, 
  userId, 
  userName 
}: LivePresentationInterfaceProps) {
  const [deploymentInfo, setDeploymentInfo] = useState<LivePresentationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    isConnected,
    connectionStatus,
    error: wsError,
    currentPrompt,
    groupInfo,
    readyCheckActive,
    isReady,
    welcomeMessage,
    livePresentationMessage,
    groupSummary,
    waitingForSummary,
    summaryGenerating,
    sendReady,
    sendResponse
  } = useLivePresentationWebSocket({
    deploymentId,
    isTeacher: false,
    userId,
    userName
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

  const handleResponse = (promptId: string, response: string) => {
    sendResponse(promptId, response);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading presentation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const title = deploymentInfo?.title || 'Live Presentation';

  // Show waiting screen only when not connected
  if (!isConnected) {
    return (
      <WaitingScreen
        title={title}
        welcomeMessage={welcomeMessage}
        groupInfo={groupInfo}
        connectionStatus={connectionStatus}
        error={wsError}
      />
    );
  }

  // Main presentation interface - always show header when connected
  return (
    <div className="min-h-screen bg-gray-50">
      <StudentHeader
        title={title}
        userName={userName}
        connectionStatus={connectionStatus}
        groupInfo={groupInfo}
        readyCheckActive={readyCheckActive}
        isReady={isReady}
        onReady={sendReady}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPrompt ? (
          <PromptDisplay
            prompt={currentPrompt}
            onResponse={handleResponse}
            disabled={!isConnected}
            groupSummary={groupSummary}
            waitingForSummary={waitingForSummary}
            summaryGenerating={summaryGenerating}
          />
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            {livePresentationMessage ? (
              <>
                <div className="border-l-4 border-indigo-500 bg-indigo-50 p-6 mb-6 rounded-r-lg">
                  <h2 className="text-3xl font-bold text-indigo-600 mb-2">
                    {livePresentationMessage}
                  </h2>
                </div>
                {/* Only show "waiting for next prompt" if it's not a ready check */}
                {!readyCheckActive && (
                  <p className="text-sm text-gray-500">
                    Waiting for next prompt...
                  </p>
                )}
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Waiting for Next Prompt
                </h2>
                <p className="text-gray-600">
                  Your instructor will send the next prompt shortly.
                </p>
              </>
            )}
          </div>
        )}

        {/* Connection status indicator */}
        {!isConnected && (
          <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <p className="text-sm font-medium">Connection lost - attempting to reconnect...</p>
          </div>
        )}
      </div>
    </div>
  );
}
