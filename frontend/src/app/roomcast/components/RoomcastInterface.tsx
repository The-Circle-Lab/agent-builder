"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  TvIcon, 
  UserGroupIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowLeftIcon 
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';
import { 
  RoomcastCodeInfo, 
  RoomcastConnectedMessage, 
  RoomcastRegisteredMessage, 
  RoomcastPromptMessage, 
  RoomcastGroupInfoMessage,
  LivePresentationPrompt,
  StudentResponseReceivedMessage,
  GroupSummaryMessage,
  TimerStartedMessage,
  TimerUpdateMessage,
  TimerExpiredMessage
} from '../../components/deployments/livePresentation/types/livePresentation';
import { Timer } from '../../components/deployments/livePresentation/components/Timer';

interface RoomcastInterfaceProps {
  code: string;
  onDisconnect: () => void;
}

interface ConnectionState {
  status: 'connecting' | 'connected' | 'registered' | 'disconnected' | 'error';
  error: string | null;
}

export default function RoomcastInterface({ code, onDisconnect }: RoomcastInterfaceProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'connecting',
    error: null
  });
  const [codeInfo, setCodeInfo] = useState<RoomcastCodeInfo | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [availableGroups, setAvailableGroups] = useState<string[]>([]);
  const [groupsArePredicted, setGroupsArePredicted] = useState<boolean>(false);
  const [connectedGroups, setConnectedGroups] = useState<string[]>([]);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [groupExplanation, setGroupExplanation] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<LivePresentationPrompt | null>(null);
  const [responsesByStudent, setResponsesByStudent] = useState<Record<string, { response?: string; timestamp?: string }>>({});
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [groupSummary, setGroupSummary] = useState<{ text: string; key_themes?: string[]; response_count?: number } | null>(null);
  const [timerActive, setTimerActive] = useState(false);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(0);
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<string | null>(null);
  // Local drift tracking
  const lastTimerSyncRef = useRef<number | null>(null);
  const lastServerRemainingRef = useRef<number>(0);
  const [wsRef, setWsRef] = useState<WebSocket | null>(null);
  const debug = (...args: unknown[]) => console.log('[Roomcast]', ...args);

  // Fetch code info
  useEffect(() => {
    const fetchCodeInfo = async () => {
      try {
        const url = `${API_CONFIG.BASE_URL}/api/deploy/live-presentation/roomcast/${code}/info`;
        debug('Fetching code info', { url });
        const response = await fetch(url);
        
        if (response.ok) {
          const info: RoomcastCodeInfo = await response.json();
          debug('Code info OK', info);
          setCodeInfo(info);
          setAvailableGroups(info.expected_groups);
          setGroupsArePredicted(!!info.groups_are_predicted);
        } else if (response.status === 404) {
          debug('Code invalid (404)');
          setConnectionState({ status: 'error', error: 'Invalid code' });
        } else if (response.status === 410) {
          debug('Code expired (410)');
          setConnectionState({ status: 'error', error: 'Code expired' });
        } else {
          debug('Code info failed', { status: response.status });
          setConnectionState({ status: 'error', error: 'Failed to validate code' });
        }
      } catch (err) {
        debug('Code info fetch error', err);
        setConnectionState({ status: 'error', error: 'Network error' });
      }
    };

    fetchCodeInfo();
  }, [code]);

  // Connect to WebSocket
  type RoomcastIncoming = { type: string; [key: string]: unknown };

  const handleWebSocketMessage = useCallback((message: unknown) => {
    debug('handleWebSocketMessage', message);
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }
    const msg = message as RoomcastIncoming;
    switch (msg.type) {
      case 'roomcast_connected':
        {
          const connectedMsg = msg as unknown as RoomcastConnectedMessage;
          debug('roomcast_connected', connectedMsg);
          setAvailableGroups(connectedMsg.expected_groups);
          setGroupsArePredicted(!!connectedMsg.groups_are_predicted);
          setConnectedGroups(connectedMsg.connected_groups);
          // Ensure members are hidden until explicit group info message
          setGroupMembers([]);
        }
        break;
      case 'roomcast_registered':
        {
          const registeredMsg = msg as unknown as RoomcastRegisteredMessage;
          debug('roomcast_registered', registeredMsg);
          setSelectedGroup(registeredMsg.group_name);
          setConnectionState({ status: 'registered', error: null });
          // Ensure members are hidden until explicit group info message
          setGroupMembers([]);
        }
        break;
      case 'roomcast_prompt':
        {
          const promptMsg = msg as unknown as RoomcastPromptMessage;
          debug('roomcast_prompt', { group: promptMsg.group_name, statement: promptMsg.prompt?.statement });
          setCurrentPrompt(promptMsg.prompt);
          // Clear previous group info when new prompt arrives
          setGroupMembers([]);
          // If timer already hit 0, remove timer instance on new display content
          if (timerRemainingSeconds === 0) {
            debug('roomcast_prompt: clearing expired timer before displaying new content');
            setTimerActive(false);
            setTimerDurationSeconds(0);
            setTimerStartTime(null);
            lastTimerSyncRef.current = null;
            lastServerRemainingRef.current = 0;
          }
        }
        break;
      case 'roomcast_group_info':
        {
          const groupInfoMsg = msg as unknown as RoomcastGroupInfoMessage;
          debug('roomcast_group_info', groupInfoMsg);
          setGroupMembers(groupInfoMsg.members);
          setGroupExplanation(groupInfoMsg.explanation || null);
          // Reset progress map for any new members not seen yet
          setResponsesByStudent(prev => {
            const next: Record<string, { response?: string; timestamp?: string }> = { ...prev };
            groupInfoMsg.members.forEach(m => { if (!next[m]) next[m] = {}; });
            return next;
          });
        }
        break;
      case 'student_response_received':
        {
          // Progress update for a single student
            const s = msg as unknown as StudentResponseReceivedMessage;
            const studentName = s.student?.user_name;
            if (studentName) {
              setResponsesByStudent(prev => ({
                ...prev,
                [studentName]: { response: String(s.response || ''), timestamp: String(s.timestamp || '') }
              }));
            }
        }
        break;
      case 'summary_generation_started':
        setSummaryGenerating(true);
        break;
      case 'group_summary':
        {
          const gs = msg as unknown as GroupSummaryMessage;
          setSummaryGenerating(false);
          setGroupSummary(gs.summary || null);
        }
        break;
      case 'timer_started':
        {
          const timerMsg = msg as unknown as TimerStartedMessage;
          debug('timer_started', timerMsg);
          setTimerActive(true);
          setTimerRemainingSeconds(timerMsg.remaining_seconds);
          setTimerDurationSeconds(timerMsg.duration_seconds);
          setTimerStartTime(timerMsg.start_time);
          lastTimerSyncRef.current = Date.now();
          lastServerRemainingRef.current = timerMsg.remaining_seconds;
        }
        break;
      case 'timer_stopped':
        {
          debug('timer_stopped');
          setTimerActive(false);
          setTimerRemainingSeconds(0);
          setTimerDurationSeconds(0);
          setTimerStartTime(null);
          lastTimerSyncRef.current = null;
        }
        break;
      case 'timer_update':
        {
          const timerMsg = msg as unknown as TimerUpdateMessage;
          debug('timer_update', timerMsg);
          if (timerActive) {
            setTimerRemainingSeconds(timerMsg.remaining_seconds);
            lastTimerSyncRef.current = Date.now();
            lastServerRemainingRef.current = timerMsg.remaining_seconds;
          }
        }
        break;
      case 'timer_expired':
        {
          const timerMsg = msg as unknown as TimerExpiredMessage;
          debug('timer_expired', timerMsg);
          setTimerRemainingSeconds(0);
          lastTimerSyncRef.current = Date.now();
          lastServerRemainingRef.current = 0;
          // Timer will be marked as inactive by a subsequent timer_stopped message
        }
        break;
      case 'ready_check':
        {
          debug('ready_check message received');
          // Clear group info when ready check starts
          setGroupMembers([]);
          // Show ready check prompt instead of clearing everything
          const readyCheckPrompt: LivePresentationPrompt = {
            id: 'ready_check',
            statement: "Ready Check 📋\n\nPlease hit the I'm ready button on your devices.",
            hasInput: false,
            inputType: 'none',
            inputPlaceholder: '',
            useRandomListItem: false,
            listVariableId: undefined,
            isSystemPrompt: true,
            category: 'system'
          };
          setCurrentPrompt(readyCheckPrompt);
        }
        break;
      case 'error':
        debug('roomcast_error', msg);
        setConnectionState({ status: 'error', error: (msg as { message?: string }).message || 'Unknown error' });
        break;
    }
  }, [timerRemainingSeconds, timerActive]);

  const connectWebSocket = useCallback(() => {
    if (!codeInfo || wsRef) return;

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = API_CONFIG.BASE_URL.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}//${wsHost}/api/deploy/ws/live-presentation/roomcast/${code}`;
      debug('Connecting WS', { wsProtocol, wsHost, wsUrl });

      const ws = new WebSocket(wsUrl);
      setWsRef(ws);

      ws.onopen = () => {
        debug('WS open');
        setConnectionState({ status: 'connected', error: null });
      };

      ws.onmessage = (event) => {
        try {
          debug('WS message', event.data);
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          debug('WS message parse error', err);
        }
      };

      ws.onclose = (e) => {
        debug('WS close', { code: e.code, reason: e.reason, wasClean: e.wasClean });
        setConnectionState({ status: 'disconnected', error: e.reason || 'Connection lost' });
        setWsRef(null);
      };

      ws.onerror = (e) => {
        debug('WS error', e);
        setConnectionState({ status: 'error', error: 'Connection failed' });
        setWsRef(null);
      };

    } catch (err) {
      debug('WS connect throw', err);
      setConnectionState({ status: 'error', error: 'Failed to connect' });
    }
  }, [codeInfo, code, wsRef, handleWebSocketMessage]);

  // Connect WebSocket when code info is available
  useEffect(() => {
    if (codeInfo && connectionState.status === 'connecting') {
      debug('Initial WS connect attempt');
      connectWebSocket();
    }
  }, [codeInfo, connectionState.status, connectWebSocket]);

  const handleGroupSelection = (groupName: string) => {
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      debug('register_roomcast', { groupName });
      wsRef.send(JSON.stringify({
        type: 'register_roomcast',
        group_name: groupName
      }));
    }
  };

  const handleDisconnect = () => {
    debug('manual disconnect');
    if (wsRef) {
      wsRef.close();
      setWsRef(null);
    }
    onDisconnect();
  };

  const handleReconnect = () => {
    debug('manual reconnect');
    // Reset state to connecting and attempt to reconnect
    setConnectionState({ status: 'connecting', error: null });
    // Ensure previous socket is cleared before trying again
    if (wsRef) {
      try { wsRef.close(); } catch {}
    }
    setWsRef(null);
    setTimeout(() => connectWebSocket(), 200);
  };

  const renderAssignedItem = useCallback((): React.ReactNode => {
    if (!currentPrompt || !currentPrompt.assigned_list_item) return null;
    const item = currentPrompt.assigned_list_item as unknown;
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const title = typeof obj.title === 'string' ? obj.title : String(obj.title ?? '');
      const description = typeof obj.description === 'string' ? obj.description : undefined;
      return (
        <div>
          <div className="font-medium">{title}</div>
          {description ? (
            <div className="mt-2 text-sm">{description}</div>
          ) : null}
        </div>
      );
    }
    const safeText = String(item);
    return <span>{safeText}</span>;
  }, [currentPrompt]);

  useEffect(() => {
    debug('connectionState changed', connectionState);
  }, [connectionState]);

  // Local ticking for timer on roomcast display
  useEffect(() => {
    if (!timerActive || !timerStartTime || timerDurationSeconds <= 0) return;

    const normalizeIsoToUtc = (iso: string): string => {
      if (!iso) return iso;
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) return iso;
      return iso + 'Z';
    };

    const startMs = new Date(normalizeIsoToUtc(timerStartTime)).getTime();
    const endMs = startMs + timerDurationSeconds * 1000;

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endMs - now) / 1000));

      if (lastTimerSyncRef.current) {
        const elapsedSinceSyncMs = now - lastTimerSyncRef.current;
        const derivedFromSync = Math.max(0, lastServerRemainingRef.current - Math.round(elapsedSinceSyncMs / 1000));
        const drift = Math.abs(derivedFromSync - remaining);
        setTimerRemainingSeconds(drift > 2 ? remaining : derivedFromSync);
      } else {
        setTimerRemainingSeconds(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerStartTime, timerDurationSeconds]);

  // Render connection states
  if (connectionState.status === 'error') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <ExclamationTriangleIcon className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-6">{connectionState.error}</p>
          <button
            onClick={handleDisconnect}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (connectionState.status === 'connecting') {
    return (
      <div className="min-h-screen bg-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <TvIcon className="h-8 w-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connecting...</h2>
          <p className="text-gray-600 mb-6">Connecting to presentation: {codeInfo?.title}</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (connectionState.status === 'disconnected') {
    return (
      <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Connection Lost</h2>
          <p className="text-gray-600 mb-6">We lost connection to the presentation server.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleReconnect}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Reconnect
            </button>
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              Back to Code Entry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Group selection screen
  if (connectionState.status === 'connected' && !selectedGroup) {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <UserGroupIcon className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Your Group</h2>
            <p className="text-gray-600">Choose which group this display will represent</p>
            <p className="text-sm text-gray-500 mt-1">
              Presentation: {codeInfo?.title}
            </p>
            {groupsArePredicted && (
              <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">Preview Mode:</span> Groups haven&apos;t been generated yet, but you can connect now
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {availableGroups.map((group) => {
              const isConnected = connectedGroups.includes(group);
              return (
                <button
                  key={group}
                  onClick={() => handleGroupSelection(group)}
                  disabled={isConnected}
                  className={`w-full p-4 text-purple-800 text-left rounded-lg border-2 transition-colors ${
                    isConnected
                      ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
                      : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{group}</span>
                    {isConnected && (
                      <span className="text-xs text-gray-500">Already connected</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={handleDisconnect}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back to code entry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main display interface
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <CheckCircleIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg text-gray-900">{selectedGroup}</h1>
              <p className="text-sm text-gray-600">{codeInfo?.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full border ${connectionState.status === 'registered' || connectionState.status === 'connected' ? 'text-green-700 bg-green-50 border-green-200' : 'text-yellow-700 bg-yellow-50 border-yellow-200'}`}>
              {connectionState.status === 'registered' || connectionState.status === 'connected' ? 'Connected' : 'Connecting...'}
            </span>
          <button
            onClick={handleDisconnect}
            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50"
          >
            Disconnect
          </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {groupMembers.length > 0 && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            {/* Group Number - Large and Centered */}
            <div className="text-center mb-6">
              <h1 className="text-6xl font-bold text-indigo-600 mb-2">
                <h1 className="text-6xl font-bold text-indigo-600 mb-2">
                  {selectedGroup ? selectedGroup.replace(/([A-Za-z]+)(\d+)$/, '$1 $2') : ''}
                </h1>
              </h1>
            </div>
            
            {/* Group Members Section */}
            <h2 className="text-xl font-semibold mb-4 flex items-center text-gray-900 justify-center">
              <UserGroupIcon className="h-6 w-6 mr-2" />
              Group Members
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {groupMembers.map((member, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                  <span className="text-sm font-medium text-gray-900">
                    {member.split('@')[0]}
                  </span>
                </div>
              ))}
            </div>

            {/* Group Explanation */}
            {groupExplanation && (
              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="text-lg font-semibold text-amber-800 mb-2 flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Why You&apos;re Grouped Together
                </h3>
                <p className="text-amber-700 text-center leading-relaxed">
                  {groupExplanation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Timer Display - Centered above content prompts/waiting message */}
        {timerActive && timerDurationSeconds > 0 && (
          <div className="flex justify-center mb-8">
            <Timer
              remainingSeconds={timerRemainingSeconds}
              durationSeconds={timerDurationSeconds}
              size="large"
              className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-full p-4 border-2 border-indigo-200"
            />
          </div>
        )}

        {currentPrompt ? (
          <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200">
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-lg leading-relaxed text-gray-900">
                {currentPrompt.statement}
              </div>
              
              {!!currentPrompt.assigned_list_item && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-2">Your Group&apos;s Topic:</h3>
                  <div className="text-blue-800">
                    {renderAssignedItem()}
                  </div>
                </div>
              )}

              {/* Submission Progress */}
              {groupMembers.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold mb-4 text-gray-900">Submission Progress</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {groupMembers.map(member => {
                      const submitted = !!responsesByStudent[member]?.response;
                      return (
                        <div key={member} className={`p-3 rounded-lg border flex flex-col items-center text-center ${submitted ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                          <span className="text-sm font-medium text-gray-800">{member.split('@')[0]}</span>
                          <span className={`mt-2 text-xs font-semibold uppercase tracking-wide ${submitted ? 'text-green-700' : 'text-gray-400'}`}>{submitted ? 'Submitted' : 'Pending'}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 text-sm text-gray-600">
                    {Object.values(responsesByStudent).filter(r => r.response).length} / {groupMembers.length} responses received
                  </div>
                </div>
              )}

              {/* Summary States */}
              {summaryGenerating && !groupSummary && (
                <div className="mt-10 p-6 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center space-x-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  <span className="text-indigo-700 font-medium">Generating AI group summary...</span>
                </div>
              )}

              {groupSummary && (
                <div className="mt-10 p-6 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="text-2xl font-bold text-green-800 mb-4">Group Summary</h3>
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap mb-4">{groupSummary.text}</p>
                  <div className="text-xs text-green-700 flex items-center justify-between">
                    <span>Based on {groupSummary.response_count || Object.values(responsesByStudent).filter(r => r.response).length} responses</span>
                    <span className="font-medium">AI Generated</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-16">
            <TvIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">
              Waiting for Instructions
            </h2>
            <p className="text-gray-500">
              Your instructor will send prompts that will appear here
            </p>
            {groupsArePredicted && (
              <div className="mt-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg inline-block">
                <p className="text-sm text-amber-700">
                  <span className="font-medium">Preview Mode:</span> Groups haven&apos;t been created yet
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
