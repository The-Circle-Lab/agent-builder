"use client";

import React, { useState, useEffect } from 'react';
import { TvIcon } from '@heroicons/react/24/outline';
import { useLivePresentationWebSocket } from './hooks/useLivePresentationWebSocket';
import { StudentHeader } from './components/studentHeader';
import { PromptDisplay } from './components/promptDisplay';
import { InteractivePromptDisplay } from './components/InteractivePromptDisplay';
import { WaitingScreen } from './components/waitingScreen';
import { Timer } from './components/Timer';
import { LivePresentationInfo } from './types/livePresentation';
import { API_CONFIG } from '@/lib/constants';

interface LivePresentationInterfaceProps {
  deploymentId: string;
  userName: string;
}

export default function LivePresentationInterface({ deploymentId, userName }: LivePresentationInterfaceProps) {
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
    presentationActive,
    roomcastStatus,
    timerActive,
    timerRemainingSeconds,
    timerDurationSeconds,
    sendReady,
    sendResponse
  } = useLivePresentationWebSocket({ deploymentId, isTeacher: false, userName });

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/live-presentation/${deploymentId}/info`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch deployment info');
        setDeploymentInfo(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load presentation');
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [deploymentId]);

  const handleResponse = (promptId: string, response: string) => sendResponse(promptId, response);
  const isRoomcastEnabled = roomcastStatus?.enabled ?? deploymentInfo?.roomcast?.enabled ?? false;
  const title = deploymentInfo?.title || 'Live Presentation';

  // Roomcast branch
  if (isRoomcastEnabled && isConnected) {
    return (
      <div className="min-h-screen bg-indigo-50">
        <StudentHeader
          title={title}
          userName={userName}
          connectionStatus={connectionStatus}
          groupInfo={groupInfo}
          readyCheckActive={readyCheckActive}
          isReady={isReady}
          onReady={sendReady}
          isRoomcastMode
        />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-indigo-100 border-l-4 border-indigo-500 p-6 mb-8 rounded-r-lg">
            <div className="flex items-center">
              <TvIcon className="h-8 w-8 text-indigo-600 mr-3" />
              <div>
                <h2 className="text-xl font-bold text-indigo-900 mb-2">Roomcast Mode Active</h2>
                <p className="text-indigo-700">
                  Submit your responses here. Full instructions appear on the room display.
                  {groupInfo && (
                    <>
                      <span className="block mt-1 font-medium">You are in {groupInfo.group_name.replace(/^Group(\d+)$/, 'Group $1')}</span>
                      {groupInfo.explanation && (
                        <span className="block mt-2 text-sm bg-indigo-50 border border-indigo-300 rounded px-3 py-2">
                          <strong className="text-indigo-800">Why you&apos;re grouped:</strong><br />
                          <span className="text-indigo-700">{groupInfo.explanation}</span>
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
          {currentPrompt ? (
            <InteractivePromptDisplay
              prompt={currentPrompt}
              onResponse={handleResponse}
              disabled={!isConnected}
              groupSummary={groupSummary}
              waitingForSummary={waitingForSummary}
              summaryGenerating={summaryGenerating}
              hideAssignedTopic
              roomcastMode
            />
          ) : (
            <div className="bg-white rounded-lg shadow-md p-8 text-center border-2 border-indigo-200">
              {!presentationActive ? (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-6 rounded-r-lg">
                  <h2 className="text-2xl font-bold text-yellow-600 mb-2">Waiting for presentation to start</h2>
                  <p className="text-yellow-700">The roomcast session is ready. Your instructor will begin when ready.</p>
                </div>
              ) : livePresentationMessage ? (
                <div className="border-l-4 border-indigo-500 bg-indigo-50 p-6 rounded-r-lg">
                  <h2 className="text-2xl font-bold text-indigo-600 mb-2">{livePresentationMessage}</h2>
                </div>
              ) : (
                <div>
                  <TvIcon className="h-16 w-16 text-indigo-400 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-gray-700 mb-2">Waiting for next prompt</h2>
                  <p className="text-gray-500">Watch the room displays for instructions</p>
                </div>
              )}
            </div>
          )}
          {/* Group summary intentionally hidden on student device during roomcast mode */}
        </div>
        {!isConnected && (
          <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <p className="text-sm font-medium">Connection lost - attempting to reconnect...</p>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading presentation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Retry</button>
          </div>
        </div>
      </div>
    );
  }

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

  // Standard (non-roomcast) branch
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
        isRoomcastMode={false}
      />
      
  {/* Timer Display - moved: show centered under the current prompt when active */}
      
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
            {!presentationActive ? (
              <div className="border-l-4 border-yellow-500 bg-yellow-50 p-6 mb-6 rounded-r-lg">
                <h2 className="text-3xl font-bold text-yellow-600 mb-2">Wait for the teacher to start the presentation</h2>
                <p className="text-yellow-700">You&apos;re connected and ready. The presentation will begin when your instructor is ready.</p>
              </div>
            ) : livePresentationMessage ? (
              <div className="border-l-4 border-indigo-500 bg-indigo-50 p-6 mb-6 rounded-r-lg">
                <h2 className="text-3xl font-bold text-indigo-600 mb-2">{livePresentationMessage}</h2>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Waiting for Next Prompt</h2>
                <p className="text-gray-600">Your instructor will send the next prompt shortly.</p>
              </>
            )}
          </div>
        )}
        {/* Centered timer under the prompt */}
        {currentPrompt && timerActive && timerDurationSeconds > 0 && (
          <div className="flex justify-center mt-6">
            <Timer
              remainingSeconds={timerRemainingSeconds}
              durationSeconds={timerDurationSeconds}
              size="medium"
              className="bg-white/90 backdrop-blur-sm shadow-lg rounded-full p-2"
            />
          </div>
        )}
        {groupSummary && (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6 border-2 border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-4">Group Summary</h3>
            <div className="prose max-w-none">
              <p className="text-gray-800 mb-4">{groupSummary.summary.text}</p>
              {groupSummary.summary.key_themes?.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Key Themes:</h4>
                  <ul className="list-disc list-inside text-gray-700 space-y-1">
                    {groupSummary.summary.key_themes.map((t, i) => (<li key={i}>{t}</li>))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {!isConnected && (
          <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <p className="text-sm font-medium">Connection lost - attempting to reconnect...</p>
          </div>
        )}
      </div>
    </div>
  );
}
