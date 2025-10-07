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
  RoomcastNavigationPromptMessage,
  RoomcastNavigationUpdateMessage,
  RoomcastSubmissionUpdatedMessage,
  RoomcastGroupInfoMessage,
  LivePresentationPrompt,
  NavigationSubmissionPayload,
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
  const [currentPromptWithResponses, setCurrentPromptWithResponses] = useState<LivePresentationPrompt | null>(null);
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
  // Navigation state for cycling through group submissions
  const [currentSubmissionIndex, setCurrentSubmissionIndex] = useState(0);
  // Summary form state
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [summaryCategory, setSummaryCategory] = useState('');
  const [summaryPurpose, setSummaryPurpose] = useState('');
  const [summaryPlatform, setSummaryPlatform] = useState('');
  const [summaryStrategy, setSummaryStrategy] = useState('');
  // Matching result state
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    best_match: {
      student_name: string;
      url: string;
      name: string;
      purpose: string;
      platform: string;
    };
    similarity_score: number;
    reasoning: string;
    all_scores: Record<string, number>;
  } | null>(null);
  
  // Quiz state
  const [quizData, setQuizData] = useState<{
    mystery_submission: { url: string; name: string; purpose: string; platform: string };
    category_options: string[];
    correct_category: string;
    source_group: string;
  } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<{
    is_correct: boolean;
    correct_category: string;
    full_summary: { category: string; purpose: string; platform: string; strategy: string };
    source_group: string;
  } | null>(null);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  
  const debug = (...args: unknown[]) => console.log('[Roomcast]', ...args);

  const normalizeNavigationSubmission = (
    payload?: NavigationSubmissionPayload | LivePresentationPrompt['currentSubmission'] | Record<string, unknown> | null
  ): LivePresentationPrompt['currentSubmission'] | undefined => {
    if (!payload) {
      return undefined;
    }

    const submissionSource =
      typeof payload === 'object' && payload !== null && 'submission' in payload
        ? (payload as NavigationSubmissionPayload).submission
        : payload;

    if (submissionSource && typeof submissionSource === 'object') {
      return { ...(submissionSource as Record<string, unknown>) };
    }

    return undefined;
  };

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
      case 'roomcast_navigation_prompt':
        {
          // Handle navigation prompt - shows one submission at a time
          const navMsg = msg as unknown as RoomcastNavigationPromptMessage;
          debug('roomcast_navigation_prompt', navMsg);

          const normalizedPrompt = navMsg.prompt
            ? {
                ...navMsg.prompt,
                currentSubmission: normalizeNavigationSubmission(navMsg.prompt.currentSubmission)
              }
            : null;

          if (normalizedPrompt) {
            delete (normalizedPrompt as Record<string, unknown>).group_submission_responses;
            delete (normalizedPrompt as Record<string, unknown>).groupSubmissions;
          }

          setCurrentPrompt(normalizedPrompt || null);
          setCurrentPromptWithResponses(null);
          setResponsesByStudent({});
          setGroupMembers([]);
          setGroupSummary(null);
          setSummaryGenerating(false);
        }
        break;

      case 'roomcast_navigation_update':
        {
          const updateMsg = msg as unknown as RoomcastNavigationUpdateMessage;
          debug('roomcast_navigation_update', updateMsg);

          setCurrentPrompt(prev => {
            if (!prev) {
              return prev;
            }

            const normalizedSubmission = normalizeNavigationSubmission(updateMsg.currentSubmission ?? undefined);

            return {
              ...prev,
              currentSubmissionIndex:
                typeof updateMsg.currentIndex === 'number' ? updateMsg.currentIndex : prev.currentSubmissionIndex,
              currentStudentName: updateMsg.currentSubmission?.studentName ?? prev.currentStudentName,
              currentSubmission: normalizedSubmission ?? prev.currentSubmission
            };
          });
        }
        break;

      case 'roomcast_submission_updated':
        {
          const updatedMsg = msg as unknown as RoomcastSubmissionUpdatedMessage;
          debug('roomcast_submission_updated', updatedMsg);

          setCurrentPrompt(prev => {
            if (!prev) {
              return prev;
            }

            if ((prev.currentSubmissionIndex ?? 0) !== updatedMsg.submissionIndex) {
              return prev;
            }

            const current = prev.currentSubmission;
            if (current && typeof current === 'object') {
              if ('type' in current && current.type === 'websiteInfo') {
                return {
                  ...prev,
                  currentSubmission: {
                    ...current,
                    data: {
                      ...(current.data as Record<string, unknown> ?? {}),
                      ...updatedMsg.updatedData
                    }
                  }
                };
              }

              return {
                ...prev,
                currentSubmission: {
                  ...current,
                  ...updatedMsg.updatedData
                }
              };
            }

            return prev;
          });
        }
        break;
      case 'roomcast_prompt':
        {
          const promptMsg = msg as unknown as RoomcastPromptMessage;
          debug('roomcast_prompt', { group: promptMsg.group_name, statement: promptMsg.prompt?.statement });
          
          // Always clear old responses first when any new prompt arrives
          setCurrentPromptWithResponses(null);
          
          // Clear and reinitialize response tracking for the new prompt
          // This ensures we start fresh and don't show stale data from previous prompts
          const newResponsesByStudent: Record<string, { response?: string; timestamp?: string }> = {};
          
          // If this prompt includes group_submission_responses (past responses from DB),
          // initialize the response tracking from that data
          if (promptMsg.prompt?.group_submission_responses) {
            Object.keys(promptMsg.prompt.group_submission_responses).forEach(studentName => {
              // Mark these students as having submitted (from historical data)
              newResponsesByStudent[studentName] = { 
                response: 'submitted', // Use a marker to indicate they have responses
                timestamp: new Date().toISOString() 
              };
            });
            debug('Initialized response tracking from group_submission_responses', Object.keys(newResponsesByStudent));
          }
          
          // If prompt includes live_response_state, use that to show current submissions
          if (promptMsg.prompt && typeof promptMsg.prompt === 'object' && 'live_response_state' in promptMsg.prompt) {
            const liveState = (promptMsg.prompt as unknown as { live_response_state?: Record<string, { response?: string; timestamp?: string }> }).live_response_state;
            if (liveState) {
              Object.entries(liveState).forEach(([studentName, responseData]) => {
                newResponsesByStudent[studentName] = responseData;
              });
              debug('Updated response tracking from live_response_state', Object.keys(liveState));
            }
          }
          
          setResponsesByStudent(newResponsesByStudent);
          
          // Store the base prompt without responses
          const basePrompt = promptMsg.prompt ? { ...promptMsg.prompt } : null;
          if (basePrompt && typeof basePrompt === 'object') {
            delete (basePrompt as LivePresentationPrompt).group_submission_responses;
            delete (basePrompt as unknown as { live_response_state?: unknown }).live_response_state;
          }
          
          setCurrentPrompt(basePrompt);
          
          // Only set responses if this specific prompt has them
          if (promptMsg.prompt && promptMsg.prompt.group_submission_responses) {
            setCurrentPromptWithResponses(promptMsg.prompt);
          }
          
          // Reset submission navigation to first item
          setCurrentSubmissionIndex(0);
          
          // Clear previous group info when new prompt arrives
          setGroupMembers([]);
          // Clear summary state for new prompt
          setGroupSummary(null);
          setSummaryGenerating(false);
          
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
          // Add any new members to progress map while preserving existing response data
          setResponsesByStudent(prev => {
            const next: Record<string, { response?: string; timestamp?: string }> = { ...prev };
            groupInfoMsg.members.forEach(m => { 
              if (!next[m]) {
                next[m] = {}; // Initialize new members with empty state
              }
            });
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
      case 'summary_match_processing':
        {
          debug('summary_match_processing', msg);
          setMatchingInProgress(true);
          setMatchResult(null);
        }
        break;
      case 'summary_match_result':
        {
          const matchMsg = msg as unknown as {
            best_match: {
              student_name: string;
              url: string;
              name: string;
              purpose: string;
              platform: string;
            };
            similarity_score: number;
            reasoning: string;
            all_scores: Record<string, number>;
          };
          debug('summary_match_result', matchMsg);
          setMatchingInProgress(false);
          setMatchResult({
            best_match: matchMsg.best_match,
            similarity_score: matchMsg.similarity_score,
            reasoning: matchMsg.reasoning,
            all_scores: matchMsg.all_scores
          });
        }
        break;
      case 'summary_quiz':
        {
          const quizMsg = msg as unknown as {
            mystery_submission: { url: string; name: string; purpose: string; platform: string };
            category_options: string[];
            correct_category: string;
            source_group: string;
          };
          debug('summary_quiz', quizMsg);
          setQuizData(quizMsg);
          setSelectedAnswer(null);
          setQuizResult(null);
          setSubmittingAnswer(false);
        }
        break;
      case 'quiz_result':
        {
          const resultMsg = msg as unknown as {
            is_correct: boolean;
            correct_category: string;
            full_summary: { category: string; purpose: string; platform: string; strategy: string };
            source_group: string;
          };
          debug('quiz_result', resultMsg);
          setQuizResult(resultMsg);
          setSubmittingAnswer(false);
        }
        break;
      case 'summary_match_error':
        {
          const errorMsg = msg as unknown as { error: string };
          debug('summary_match_error', errorMsg);
          setMatchingInProgress(false);
          alert(`Error finding match: ${errorMsg.error}`);
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

  const handleSummarySubmit = () => {
    if (!wsRef || wsRef.readyState !== WebSocket.OPEN) {
      alert('Not connected to server');
      return;
    }

    const summaryData = {
      category: summaryCategory,
      purpose: summaryPurpose,
      platform: summaryPlatform,
      strategy: summaryStrategy
    };

    debug('Submitting summary', summaryData);

    // Send summary to backend for matching
    wsRef.send(JSON.stringify({
      type: 'submit_summary',
      summary_data: summaryData
    }));

    // Reset to show loading state
    setMatchingInProgress(true);
    setMatchResult(null);
  };

  const handleQuizAnswer = (category: string) => {
    if (!wsRef || wsRef.readyState !== WebSocket.OPEN) {
      alert('Not connected to server');
      return;
    }

    if (!category) {
      return;
    }

    setSelectedAnswer(category);
    setSubmittingAnswer(true);

    debug('Submitting quiz answer', category);

    // Send answer to backend
    wsRef.send(JSON.stringify({
      type: 'submit_quiz_answer',
      selected_category: category
    }));
  };

  // Compute the display prompt - show base prompt with responses only if we have matching responses
  const displayPrompt = React.useMemo(() => {
    if (!currentPrompt) return null;
    
    // If we have responses and they should be displayed, merge them with the base prompt
    if (currentPromptWithResponses && currentPromptWithResponses.group_submission_responses) {
      return {
        ...currentPrompt,
        group_submission_responses: currentPromptWithResponses.group_submission_responses
      };
    }
    
    // Otherwise, show just the base prompt without responses
    return currentPrompt;
  }, [currentPrompt, currentPromptWithResponses]);

  const renderAssignedItem = useCallback((): React.ReactNode => {
    if (!displayPrompt || !displayPrompt.assigned_list_item) return null;
    const item = displayPrompt.assigned_list_item as unknown;
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
  }, [displayPrompt]);

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

        {/* Quiz Interface */}
        {quizData && !quizResult && (
          <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-purple-300 mb-8">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-purple-900 mb-2">
                🎯 Category Quiz
              </h2>
              <p className="text-xl text-gray-700">
                Which category does this submission belong to?
              </p>
            </div>

            {/* Mystery Submission */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-6 mb-8 border-2 border-purple-200">
              <h3 className="text-2xl font-bold text-purple-900 mb-4">Mystery Submission</h3>
              <div className="space-y-4">
                {quizData.mystery_submission.name && (
                  <div>
                    <span className="text-sm font-semibold text-gray-600 uppercase">Website Name:</span>
                    <p className="text-xl text-gray-900 mt-1">{quizData.mystery_submission.name}</p>
                  </div>
                )}
                {quizData.mystery_submission.url && (
                  <div>
                    <span className="text-sm font-semibold text-gray-600 uppercase">URL:</span>
                    <p className="text-lg text-indigo-600 mt-1 break-all">{quizData.mystery_submission.url}</p>
                  </div>
                )}
                {quizData.mystery_submission.purpose && (
                  <div>
                    <span className="text-sm font-semibold text-gray-600 uppercase">Purpose:</span>
                    <p className="text-xl text-gray-900 mt-1">{quizData.mystery_submission.purpose}</p>
                  </div>
                )}
                {quizData.mystery_submission.platform && (
                  <div>
                    <span className="text-sm font-semibold text-gray-600 uppercase">Platform:</span>
                    <p className="text-xl text-gray-900 mt-1">{quizData.mystery_submission.platform}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Category Options */}
            <div className="grid grid-cols-1 gap-4">
              <p className="text-xl font-semibold text-gray-900 mb-2">Select the category:</p>
              {quizData.category_options.map((category) => (
                <button
                  key={category}
                  onClick={() => handleQuizAnswer(category)}
                  disabled={submittingAnswer}
                  className={`p-6 rounded-lg text-xl font-semibold transition-all transform hover:scale-105 ${
                    selectedAnswer === category
                      ? 'bg-purple-600 text-white ring-4 ring-purple-300'
                      : 'bg-white text-purple-900 border-2 border-purple-300 hover:bg-purple-100'
                  } ${submittingAnswer ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {category}
                </button>
              ))}
            </div>

            {submittingAnswer && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center text-lg text-purple-900">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mr-3"></div>
                  Checking answer...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quiz Result */}
        {quizResult && (
          <div className="bg-white rounded-lg p-8 shadow-lg border-2 border-purple-300 mb-8">
            <div className="text-center mb-8">
              {quizResult.is_correct ? (
                <>
                  <div className="text-8xl mb-4">✅</div>
                  <h2 className="text-5xl font-bold text-green-600 mb-2">Correct!</h2>
                </>
              ) : (
                <>
                  <div className="text-8xl mb-4">❌</div>
                  <h2 className="text-5xl font-bold text-red-600 mb-2">Incorrect</h2>
                  <p className="text-2xl text-gray-700">
                    The correct category was: <span className="font-bold text-purple-900">{quizResult.correct_category}</span>
                  </p>
                </>
              )}
            </div>

            {/* Full Summary Reveal */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-6 border-2 border-purple-200">
              <h3 className="text-3xl font-bold text-purple-900 mb-4">
                Full Summary from {quizResult.source_group}
              </h3>
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <span className="text-sm font-semibold text-gray-600 uppercase">Category:</span>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{quizResult.full_summary.category}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <span className="text-sm font-semibold text-gray-600 uppercase">Purpose:</span>
                  <p className="text-xl text-gray-900 mt-1">{quizResult.full_summary.purpose}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <span className="text-sm font-semibold text-gray-600 uppercase">Platform:</span>
                  <p className="text-xl text-gray-900 mt-1">{quizResult.full_summary.platform}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border border-purple-200">
                  <span className="text-sm font-semibold text-gray-600 uppercase">Strategy:</span>
                  <p className="text-xl text-gray-900 mt-1">{quizResult.full_summary.strategy}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {displayPrompt ? (
          <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-200">
            <div className="prose max-w-none">
              <div className="whitespace-pre-wrap text-3xl leading-relaxed text-gray-900">
                {displayPrompt.statement}
              </div>
              
              {/* Navigation Display - Show current submission for navigation prompts */}
              {displayPrompt.enableGroupSubmissionNavigation && displayPrompt.currentSubmission && (
                (() => {
                  const currentSubmission = displayPrompt.currentSubmission;
                  
                  // Check if this is websiteInfo type with array data
                  if (
                    currentSubmission.type === 'websiteInfo' &&
                    currentSubmission.data &&
                    Array.isArray(currentSubmission.data)
                  ) {
                    const websites = currentSubmission.data as Array<{
                      url?: string;
                      name?: string;
                      purpose?: string;
                      platform?: string;
                    }>;

                    return (
                      <div className="mt-6 p-6 bg-indigo-50 border-2 border-indigo-200 rounded-lg">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-xl font-semibold text-indigo-900">
                            {displayPrompt.currentStudentName}&apos;s Submission
                          </h3>
                          <span className="text-sm text-indigo-600 font-medium">
                            {(displayPrompt.currentSubmissionIndex ?? 0) + 1} of {displayPrompt.totalSubmissions ?? 0}
                          </span>
                        </div>

                        {websites.length > 0 ? (
                          <div className="space-y-6">
                            {websites.map((website, idx) => (
                              <div key={idx} className="bg-white p-4 rounded-lg border border-indigo-200">
                                {websites.length > 1 && (
                                  <div className="text-xs font-semibold text-indigo-500 mb-2">
                                    Website {idx + 1} of {websites.length}
                                  </div>
                                )}
                                <div className="space-y-3">
                                  {website.name && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                      <p className="text-2xl font-bold text-gray-900 mt-1">{website.name}</p>
                                    </div>
                                  )}
                                  {website.url && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">URL:</span>
                                      <a
                                        href={website.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xl text-blue-600 hover:underline block mt-1 break-all"
                                      >
                                        {website.url}
                                      </a>
                                    </div>
                                  )}
                                  {website.purpose && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                      <p className="text-lg text-gray-800 mt-1">{website.purpose}</p>
                                    </div>
                                  )}
                                  {website.platform && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Platform:</span>
                                      <p className="text-gray-700 mt-1">{website.platform}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center text-gray-600">
                            <p>No website submissions available.</p>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Handle other submission types (backwards compatibility for single object)
                  const submissionData = (() => {
                    if (!currentSubmission) return undefined;
                    if (
                      currentSubmission.type === 'websiteInfo' &&
                      currentSubmission.data &&
                      typeof currentSubmission.data === 'object' &&
                      !Array.isArray(currentSubmission.data)
                    ) {
                      return currentSubmission.data as Record<string, unknown>;
                    }
                    return currentSubmission as Record<string, unknown>;
                  })();

                  const getString = (value: unknown): string | undefined =>
                    typeof value === 'string' && value.trim().length > 0 ? value : undefined;

                  const websiteName = submissionData ? getString(submissionData['name']) : undefined;
                  const websiteUrl = submissionData ? getString(submissionData['url']) : undefined;
                  const websitePurpose = submissionData ? getString(submissionData['purpose']) : undefined;
                  const websitePlatform = submissionData ? getString(submissionData['platform']) : undefined;

                  return (
                    <div className="mt-6 p-6 bg-indigo-50 border-2 border-indigo-200 rounded-lg">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-semibold text-indigo-900">
                          {displayPrompt.currentStudentName}&apos;s Submission
                        </h3>
                        <span className="text-sm text-indigo-600 font-medium">
                          {(displayPrompt.currentSubmissionIndex ?? 0) + 1} of {displayPrompt.totalSubmissions ?? 0}
                        </span>
                      </div>

                      {websiteUrl || websiteName || websitePurpose || websitePlatform ? (
                        <div className="space-y-4">
                          {websiteName && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">Website Name:</span>
                              <p className="text-2xl font-bold text-gray-900 mt-1">{websiteName}</p>
                            </div>
                          )}
                          {websiteUrl && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">URL:</span>
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xl text-blue-600 hover:underline block mt-1 break-all"
                              >
                                {websiteUrl}
                              </a>
                            </div>
                          )}
                          {websitePurpose && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">Purpose:</span>
                              <p className="text-lg text-gray-800 mt-1">{websitePurpose}</p>
                            </div>
                          )}
                          {websitePlatform && (
                            <div>
                              <span className="text-sm font-medium text-gray-600">Platform:</span>
                              <p className="text-gray-700 mt-1">{websitePlatform}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center text-gray-600">
                          <p>No submission data available yet.</p>
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
              
              {!!displayPrompt.assigned_list_item && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-2">Your Group&apos;s Topic:</h3>
                  <div className="text-blue-800">
                    {renderAssignedItem()}
                  </div>
                </div>
              )}

              {/* Group Submission Responses - Show one at a time with navigation */}
              {!displayPrompt.enableGroupSubmissionNavigation && displayPrompt?.group_submission_responses && Object.keys(displayPrompt.group_submission_responses).length > 0 && (() => {
                const submissionEntries = Object.entries(displayPrompt.group_submission_responses);
                const totalSubmissions = submissionEntries.length;
                const currentEntry = submissionEntries[currentSubmissionIndex];
                const isAtEnd = currentSubmissionIndex === totalSubmissions - 1;
                
                if (!currentEntry) return null;
                
                const [memberName, responses] = currentEntry;
                
                return (
                  <div className="mt-6 px-4 py-2 bg-amber-50 rounded-lg border border-amber-200">
                    {!showSummaryForm ? (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <button
                            onClick={() => setCurrentSubmissionIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentSubmissionIndex === 0}
                            className="p-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          
                          <div className="text-center flex-1">
                            <h3 className="font-semibold text-amber-900 mb-1">Your Group&apos;s Responses</h3>
                            <p className="text-sm text-amber-700">{currentSubmissionIndex + 1} of {totalSubmissions}</p>
                          </div>
                          
                          <button
                            onClick={() => setCurrentSubmissionIndex(prev => Math.min(totalSubmissions - 1, prev + 1))}
                            disabled={currentSubmissionIndex === totalSubmissions - 1}
                            className="p-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </div>
                        
                        <div className="bg-white rounded-lg px-6 py-4 border border-amber-200 shadow-sm">
                          <h4 className="font-semibold text-amber-800 mb-4 text-center text-xl border-b border-amber-200 pb-3">
                            {memberName.split('@')[0]}
                          </h4>
                          <div className="space-y-4">
                            {Object.entries(responses).map(([promptId, responseData]) => {
                              // Extract the actual response content
                              let responseContent = '';
                              if (typeof responseData === 'object' && responseData?.response) {
                                responseContent = responseData.response;
                              } else {
                                responseContent = String(responseData);
                              }

                              // Try to parse as website info first
                              let websiteData = null;
                              let websiteArray: Array<{ url?: string; name?: string; purpose?: string; platform?: string }> = [];
                              
                              try {
                                const parsed = JSON.parse(responseContent);
                                
                                // Check if it's an array of website objects
                                if (Array.isArray(parsed)) {
                                  const hasWebsiteFields = parsed.some(item => 
                                    item && typeof item === 'object' && 
                                    ('url' in item || 'name' in item || 'purpose' in item || 'platform' in item)
                                  );
                                  
                                  if (hasWebsiteFields) {
                                    websiteArray = parsed;
                                  }
                                } 
                                // Check if it's a single website object
                                else if (parsed && typeof parsed === 'object' && ('url' in parsed || 'name' in parsed)) {
                                  websiteData = parsed;
                                }
                              } catch {
                                // Not website JSON, continue with other parsing
                              }

                              // If it's an array of website data, display each website
                              if (websiteArray.length > 0) {
                                return (
                                  <div key={promptId} className="space-y-4">
                                    {websiteArray.map((website, idx) => (
                                      <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        {websiteArray.length > 1 && (
                                          <div className="text-xs font-semibold text-gray-500 mb-2">
                                            Website {idx + 1} of {websiteArray.length}
                                          </div>
                                        )}
                                        <div className="space-y-3">
                                          {website.name && (
                                            <div>
                                              <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                              <p className="text-xl font-bold text-gray-900 mt-1">{website.name}</p>
                                            </div>
                                          )}
                                          {website.url && (
                                            <div>
                                              <span className="text-sm font-medium text-gray-600">URL:</span>
                                              <a
                                                href={website.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                                              >
                                                {website.url}
                                              </a>
                                            </div>
                                          )}
                                          {website.purpose && (
                                            <div>
                                              <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                              <p className="text-lg text-gray-800 mt-1">{website.purpose}</p>
                                            </div>
                                          )}
                                          {website.platform && (
                                            <div>
                                              <span className="text-sm font-medium text-gray-600">Platform:</span>
                                              <p className="text-gray-700 mt-1">{website.platform}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }

                              // If it's a single website data object, display it
                              if (websiteData) {
                                return (
                                  <div key={promptId} className="space-y-3">
                                    {websiteData.name && (
                                      <div>
                                        <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                        <p className="text-xl font-bold text-gray-900 mt-1">{websiteData.name}</p>
                                      </div>
                                    )}
                                    {websiteData.url && (
                                      <div>
                                        <span className="text-sm font-medium text-gray-600">URL:</span>
                                        <a
                                          href={websiteData.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                                        >
                                          {websiteData.url}
                                        </a>
                                      </div>
                                    )}
                                    {websiteData.purpose && (
                                      <div>
                                        <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                        <p className="text-lg text-gray-800 mt-1">{websiteData.purpose}</p>
                                      </div>
                                    )}
                                    {websiteData.platform && (
                                      <div>
                                        <span className="text-sm font-medium text-gray-600">Platform:</span>
                                        <p className="text-gray-700 mt-1">{websiteData.platform}</p>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              // Check if it's a JSON array of plain strings
                              let responseItems: string[] = [];
                              try {
                                const parsed = JSON.parse(responseContent);
                                if (Array.isArray(parsed)) {
                                  // Make sure they're simple strings/numbers, not objects
                                  if (parsed.every(item => typeof item === 'string' || typeof item === 'number')) {
                                    responseItems = parsed.map(item => String(item));
                                  } else {
                                    // Array of objects we couldn't parse, just show the raw content
                                    responseItems = [responseContent];
                                  }
                                } else {
                                  responseItems = [responseContent];
                                }
                              } catch {
                                // Not JSON, treat as single text response
                                responseItems = [responseContent];
                              }

                              return (
                                <div key={promptId} className="text-sm">
                                  {responseItems.length > 1 ? (
                                    <div className="space-y-2">
                                      {responseItems.map((item, index) => (
                                        <div key={index} className="flex items-start group">
                                          <div className="w-2 h-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full mt-2 mr-3 flex-shrink-0 group-hover:scale-110 transition-transform"></div>
                                          <span className="flex-1 text-gray-700 font-medium leading-relaxed text-lg">{item}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-gray-700 font-medium leading-relaxed text-lg">{responseItems[0]}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* Finish button when at the end */}
                        {isAtEnd && (
                          <div className="mt-4 flex justify-center">
                            <button
                              onClick={() => setShowSummaryForm(true)}
                              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-lg font-semibold shadow-md"
                            >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Finish
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      /* Summary Form */
                      <div className="bg-white rounded-lg p-6 border border-amber-200 shadow-sm">
                        <h3 className="text-2xl font-bold text-amber-900 mb-4 text-center">
                          Summarize Your Group&apos;s Submissions
                        </h3>
                        <p className="text-amber-700 mb-6 text-center">
                          Based on all the submissions you just saw, provide a comprehensive summary
                        </p>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              General Category
                            </label>
                            <input
                              type="text"
                              value={summaryCategory}
                              onChange={(e) => setSummaryCategory(e.target.value)}
                              placeholder="What general category do these submissions fall under?"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-800"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Purpose Summary
                            </label>
                            <textarea
                              value={summaryPurpose}
                              onChange={(e) => setSummaryPurpose(e.target.value)}
                              placeholder="Describe the common purpose across all submissions..."
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-800"
                              rows={4}
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Platform Summary
                            </label>
                            <input
                              type="text"
                              value={summaryPlatform}
                              onChange={(e) => setSummaryPlatform(e.target.value)}
                              placeholder="What platform(s) were commonly used?"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-800"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Strategy
                            </label>
                            <textarea
                              value={summaryStrategy}
                              onChange={(e) => setSummaryStrategy(e.target.value)}
                              placeholder="How could we help people detect or avoid these items?"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-gray-800"
                              rows={4}
                            />
                          </div>
                          
                          <div className="flex gap-3 pt-4">
                            <button
                              onClick={() => {
                                setShowSummaryForm(false);
                                setSummaryCategory('');
                                setSummaryPurpose('');
                                setSummaryPlatform('');
                                setSummaryStrategy('');
                                setMatchResult(null);
                                setMatchingInProgress(false);
                              }}
                              className="flex-1 px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-semibold"
                              disabled={matchingInProgress}
                            >
                              Back
                            </button>
                            <button
                              onClick={handleSummarySubmit}
                              disabled={!summaryCategory.trim() || !summaryPurpose.trim() || !summaryPlatform.trim() || !summaryStrategy.trim() || matchingInProgress}
                              className="flex-1 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {matchingInProgress ? (
                                <>
                                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Finding Match...
                                </>
                              ) : matchResult ? (
                                'Match Found!'
                              ) : (
                                'Submit & Find Match'
                              )}
                            </button>
                          </div>
                          
                          {/* Display matching result */}
                          {matchResult && (
                            <div className="mt-6 p-6 bg-green-50 border-2 border-green-500 rounded-lg">
                              <div className="flex items-center gap-2 mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <h3 className="text-2xl font-bold text-green-900">Best Match Found!</h3>
                              </div>
                              
                              <div className="bg-white rounded-lg p-4 mb-4">
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-lg font-semibold text-gray-900">
                                    {matchResult.best_match.student_name}&apos;s Submission
                                  </h4>
                                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">
                                    {(matchResult.similarity_score * 100).toFixed(0)}% Match
                                  </span>
                                </div>
                                
                                <div className="space-y-3">
                                  {matchResult.best_match.name && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                      <p className="text-xl font-bold text-gray-900 mt-1">{matchResult.best_match.name}</p>
                                    </div>
                                  )}
                                  {matchResult.best_match.url && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">URL:</span>
                                      <a
                                        href={matchResult.best_match.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                                      >
                                        {matchResult.best_match.url}
                                      </a>
                                    </div>
                                  )}
                                  {matchResult.best_match.purpose && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                      <p className="text-lg text-gray-800 mt-1">{matchResult.best_match.purpose}</p>
                                    </div>
                                  )}
                                  {matchResult.best_match.platform && (
                                    <div>
                                      <span className="text-sm font-medium text-gray-600">Platform:</span>
                                      <p className="text-gray-700 mt-1">{matchResult.best_match.platform}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                                <h5 className="text-sm font-semibold text-blue-900 mb-2">Why This Match?</h5>
                                <p className="text-blue-800 text-sm leading-relaxed">{matchResult.reasoning}</p>
                              </div>
                              
                              {matchResult.all_scores && Object.keys(matchResult.all_scores).length > 1 && (
                                <div className="bg-gray-50 rounded-lg p-4">
                                  <h5 className="text-sm font-semibold text-gray-900 mb-3">All Scores:</h5>
                                  <div className="space-y-2">
                                    {Object.entries(matchResult.all_scores)
                                      .sort(([, a], [, b]) => b - a)
                                      .map(([name, score]) => (
                                        <div key={name} className="flex items-center justify-between">
                                          <span className="text-sm text-gray-700">{name}</span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-32 bg-gray-200 rounded-full h-2">
                                              <div
                                                className="bg-amber-600 h-2 rounded-full transition-all"
                                                style={{ width: `${score * 100}%` }}
                                              ></div>
                                            </div>
                                            <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                                              {(score * 100).toFixed(0)}%
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

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
