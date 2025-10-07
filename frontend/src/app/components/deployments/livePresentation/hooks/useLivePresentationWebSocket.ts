import { useState, useEffect, useRef, useCallback } from 'react';
import { API_CONFIG } from '@/lib/constants';
import { 
  WebSocketMessage, 
  TypedWebSocketMessage,
  PresentationStats, 
  LivePresentationPrompt, 
  GroupInfo,
  StudentResponse,
  TeacherMessage,
  GroupSummaryMessage,
  RoomcastStatus,
  NavigationUpdateMessage,
  SubmissionUpdatedMessage
} from '../types/livePresentation';

interface UseLivePresentationWebSocketProps {
  deploymentId: string;
  isTeacher: boolean;
  userName?: string;
}

interface WebSocketState {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  error: string | null;
}

export const useLivePresentationWebSocket = ({
  deploymentId,
  isTeacher,
  userName
}: UseLivePresentationWebSocketProps) => {
  const [socketState, setSocketState] = useState<WebSocketState>({
    isConnected: false,
    connectionStatus: 'disconnected',
    error: null
  });

  // Student states
  const [currentPrompt, setCurrentPrompt] = useState<LivePresentationPrompt | null>(null);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [readyCheckActive, setReadyCheckActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState<string | null>(null);
  const [livePresentationMessage, setLivePresentationMessage] = useState<string | null>(null);
  const [groupSummary, setGroupSummary] = useState<GroupSummaryMessage | null>(null);
  const [waitingForSummary, setWaitingForSummary] = useState(false);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [presentationActive, setPresentationActive] = useState(false);
  const messageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Teacher states
  const [stats, setStats] = useState<PresentationStats | null>(null);
  const [savedPrompts, setSavedPrompts] = useState<LivePresentationPrompt[]>([]);
  const [studentResponses, setStudentResponses] = useState<StudentResponse[]>([]);
  const [roomcastStatus, setRoomcastStatus] = useState<RoomcastStatus | null>(null);

  // Timer states
  const [timerActive, setTimerActive] = useState(false);
  const [timerRemainingSeconds, setTimerRemainingSeconds] = useState(0);
  const [timerDurationSeconds, setTimerDurationSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<string | null>(null);
  // Track last server push for timer to allow drift correction
  const lastTimerSyncRef = useRef<number | null>(null);
  const lastServerRemainingRef = useRef<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3; // Reduce max attempts
  const lastConnectAttempt = useRef<number>(0);

  // Helper function to set live presentation message with optional timeout
  const setMessageWithTimeout = useCallback((message: string | null, timeoutMs?: number) => {
    // Clear existing timeout
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current);
      messageTimeoutRef.current = null;
    }

    setLivePresentationMessage(message);

    // Set timeout to clear message if specified
    if (message && timeoutMs) {
      messageTimeoutRef.current = setTimeout(() => {
        setLivePresentationMessage(null);
        messageTimeoutRef.current = null;
      }, timeoutMs);
    }
  }, []);

  const handleMessage = useCallback((message: TypedWebSocketMessage) => {
    console.log('🎤 Received message:', message.type, message);

    switch (message.type) {
      case 'welcome':
        setWelcomeMessage(message.message);
        if (message.group_info) {
          setGroupInfo(message.group_info);
        }
        // Set presentation active state from message
        if (typeof message.presentation_active === 'boolean') {
          setPresentationActive(message.presentation_active);
        }
        // Don't set live presentation message for welcome, it's handled in waiting screen
        break;

      case 'waiting_for_teacher':
        setWelcomeMessage(message.message);
        if (message.group_info) {
          setGroupInfo(message.group_info);
        }
        // Set presentation active state from message
        if (typeof message.presentation_active === 'boolean') {
          setPresentationActive(message.presentation_active);
        }
        break;

      case 'presentation_started':
        setPresentationActive(true);
        setMessageWithTimeout(
          message.message || "The teacher has started the presentation. You may now participate.",
          5000
        );
        break;

      case 'presentation_ended':
        setPresentationActive(false);
        setCurrentPrompt(null); // Clear any active prompt
        setReadyCheckActive(false); // Clear any ready check
        setGroupSummary(null); // Clear any summary
        setWaitingForSummary(false);
        setSummaryGenerating(false);
        setMessageWithTimeout(
          message.message || "The teacher has ended the presentation. Thank you for participating!",
          10000
        );
        break;

      case 'prompt_received':
        setCurrentPrompt(message.prompt);
        setGroupSummary(null); // Clear previous summary when new prompt arrives
        setWaitingForSummary(false); // Reset waiting state
        setSummaryGenerating(false); // Reset generation state
        setMessageWithTimeout(null); // Clear message when prompt is received
        break;

      case 'navigation_update':
        {
          const msg = message as NavigationUpdateMessage;
          console.log('🧭 Navigation update received:', msg);
          
          // Update the current prompt with new navigation state
          setCurrentPrompt(prev => {
            if (!prev || !prev.enableGroupSubmissionNavigation) return prev;
            
            const updatedSubmission = msg.currentSubmission?.submission 
              ? { ...msg.currentSubmission.submission }
              : prev.currentSubmission;
            
            return {
              ...prev,
              currentSubmissionIndex: msg.currentIndex,
              currentStudentName: msg.currentSubmission?.studentName,
              currentSubmission: updatedSubmission
            };
          });
        }
        break;

      case 'submission_updated':
        {
          const msg = message as SubmissionUpdatedMessage;
          console.log('📝 Submission updated:', msg);
          
          // Update the current submission data
          setCurrentPrompt(prev => {
            if (!prev || !prev.enableGroupSubmissionNavigation) return prev;
            if (prev.currentSubmissionIndex !== msg.submissionIndex) return prev;
            
            const currentSub = prev.currentSubmission || {};
            
            return {
              ...prev,
              currentSubmission: {
                ...currentSub,
                ...msg.updatedData
              }
            };
          });
        }
        break;

      case 'send_prompt':
        // Direct prompt from server (includes navigation prompts)
        setCurrentPrompt(message.prompt);
        setGroupSummary(null);
        setWaitingForSummary(false);
        setSummaryGenerating(false);
        setMessageWithTimeout(null);
        break;

      case 'navigation_update':
        {
          const updateMsg = message as NavigationUpdateMessage;
          setCurrentPrompt(prev => {
            if (!prev) return prev;

            const submissionPayload = updateMsg.currentSubmission?.submission ?? updateMsg.currentSubmission;
            const normalizedSubmission = submissionPayload && typeof submissionPayload === 'object'
              ? { ...(submissionPayload as Record<string, unknown>) }
              : prev.currentSubmission;

            return {
              ...prev,
              currentSubmissionIndex: typeof updateMsg.currentIndex === 'number'
                ? updateMsg.currentIndex
                : prev.currentSubmissionIndex,
              currentStudentName: updateMsg.currentSubmission?.studentName ?? prev.currentStudentName,
              currentSubmission: normalizedSubmission ?? prev.currentSubmission
            };
          });
        }
        break;

      case 'submission_updated':
        {
          const updatedMsg = message as SubmissionUpdatedMessage;
          setCurrentPrompt(prev => {
            if (!prev) return prev;

            // Only update if the currently displayed submission matches index
            if ((prev.currentSubmissionIndex ?? 0) !== updatedMsg.submissionIndex) {
              return prev;
            }

            if (prev.currentSubmission && typeof prev.currentSubmission === 'object') {
              const current = prev.currentSubmission;
              if ('type' in current && current.type === 'websiteInfo') {
                return {
                  ...prev,
                  currentSubmission: {
                    ...current,
                    data: { ...(current.data as Record<string, unknown> ?? {}), ...updatedMsg.updatedData }
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

      case 'group_info':
        setGroupInfo(message.group_info);
        if (message.group_info) {
          // Format group name to add space between "Group" and number
          const formattedGroupName = message.group_info.group_name.replace(/^Group(\d+)$/, 'Group $1');
          
          // Get other members (exclude current user)
          const currentUser = userName;
          const otherMembers = message.group_info.group_members.filter((member: string) => member !== currentUser);
          
          // Create member list message
          let membersList = '';
          if (otherMembers.length > 0) {
            const memberNames = otherMembers.map((email: string) => email.split('@')[0]); // Extract names from emails
            membersList = `. Your group members are: ${memberNames.join(', ')}.`;
          }
          
          // Add prefix for late-joining students
          const prefix = message.is_late_join ? "You've joined " : "You've been assigned to ";
          
          setMessageWithTimeout(
            `${prefix}${formattedGroupName} with ${message.group_info.group_members.length} members${membersList}`
            // No timeout - keep message on screen
          );
        } else {
          setMessageWithTimeout("Group information updated.");
        }
        break;

      case 'ready_check':
        setReadyCheckActive(true);
        setIsReady(false);
        
        // Different message for late-joining students
        const readyMessage = message.is_late_join 
          ? "A ready check is currently active. Please click 'I'm Ready' when you're ready to continue."
          : (message.message || "Please click 'I'm Ready' when you're ready to continue.");
        
        setMessageWithTimeout(
          readyMessage
          // No timeout for ready check - stays until ready button is clicked
        );
        break;

      case 'teacher_connected':
        if (isTeacher) {
          setStats(message.stats);
          setSavedPrompts(message.saved_prompts || []);
          // Set presentation active state from message
          if (typeof message.presentation_active === 'boolean') {
            setPresentationActive(message.presentation_active);
          }
        }
        break;

      case 'presentation_state_changed':
        if (isTeacher) {
          setPresentationActive(message.presentation_active);
          console.log(`🎤 Presentation ${message.action}:`, message.presentation_active);
        }
        break;

      case 'connection_test':
        // Student receives connection test - no special handling needed, just logged
        console.log('🔍 Received connection test from server');
        break;

      case 'connection_test_result':
        // Teacher receives connection test results
        if (isTeacher && message.stats) {
          setStats(message.stats);
          setMessageWithTimeout(
            `${message.message} (${message.failed_count} students removed)`,
            5000
          );
        }
        break;

      case 'connection_update':
        if (isTeacher && message.stats) {
          setStats(message.stats);
        }
        break;

      case 'student_response_received':
        if (isTeacher) {
          const response: StudentResponse = {
            response: message.response,
            prompt_id: message.prompt_id,
            timestamp: message.timestamp,
            user_id: message.student.user_id,
            user_name: message.student.user_name
          };
          setStudentResponses(prev => [response, ...prev]);
        }
        break;

      case 'summary_submitted':
        if (isTeacher) {
          // Add summary submission as a special response type
          const summaryResponse: StudentResponse = {
            response: JSON.stringify({
              type: 'summary_submission',
              group_name: message.group_name,
              summary: message.summary_data,
              match_result: message.match_result
            }),
            prompt_id: 'summary_' + message.group_name,
            timestamp: message.timestamp,
            user_id: message.group_name,
            user_name: `${message.group_name} Summary`
          };
          setStudentResponses(prev => [summaryResponse, ...prev]);
          console.log('📊 Received summary submission from', message.group_name);
        }
        break;

      case 'stats_update':
        if (isTeacher) {
          setStats(message.stats);
        }
        break;

      case 'group_info_sent':
        if (isTeacher) {
          console.log('✅ Group info sent:', message);
          // You could add a toast notification here if needed
        }
        break;

      case 'summary_generation_started':
        if (!isTeacher) {
          console.log('🎯 Summary generation started:', message);
          setSummaryGenerating(true); // Switch to generation state
          setWaitingForSummary(false); // No longer waiting, now generating
        }
        break;

      case 'group_summary':
        if (!isTeacher) {
          console.log('📝 Received group summary:', message);
          setGroupSummary(message as GroupSummaryMessage);
          setWaitingForSummary(false); // Clear waiting state when summary arrives
          setSummaryGenerating(false); // Clear generation state when summary arrives
          // Don't show live presentation message anymore since summary replaces response
        }
        break;

      case 'group_summary_generated':
        if (isTeacher) {
          console.log('📊 Group summary generated:', message);
          // You could add this to a teacher summary list or show notification
        }
        break;

      case 'roomcast_status':
        console.log('📺 Roomcast status updated:', message);
        setRoomcastStatus(message.status);
        
        // For students: show a message about roomcast mode change
        if (!isTeacher) {
          if (message.status.enabled) {
            setMessageWithTimeout(
              "The presentation is now in Roomcast mode. Look for displays around the room showing content for your group.",
              8000
            );
          } else {
            setMessageWithTimeout(
              "Roomcast mode has been disabled. Continue following the presentation normally.",
              5000
            );
          }
        }
        break;

      case 'timer_started':
        setTimerActive(true);
        setTimerRemainingSeconds(message.remaining_seconds);
        setTimerDurationSeconds(message.duration_seconds);
        setTimerStartTime(message.start_time);
  lastTimerSyncRef.current = Date.now();
  lastServerRemainingRef.current = message.remaining_seconds;
        break;

      case 'timer_stopped':
        setTimerActive(false);
        setTimerRemainingSeconds(0);
        setTimerDurationSeconds(0);
        setTimerStartTime(null);
  lastTimerSyncRef.current = null;
        break;

      case 'timer_update':
        if (timerActive) {
          setTimerRemainingSeconds(message.remaining_seconds);
          lastTimerSyncRef.current = Date.now();
          lastServerRemainingRef.current = message.remaining_seconds;
        }
        break;

      case 'timer_expired':
        setTimerRemainingSeconds(0);
  lastTimerSyncRef.current = Date.now();
  lastServerRemainingRef.current = 0;
        // Timer will be marked as inactive by a subsequent timer_stopped message
        break;

      case 'error':
        setSocketState(prev => ({ ...prev, error: message.message }));
        break;

      default:
        console.log('Unknown message type:', (message as TypedWebSocketMessage).type);
    }
  }, [isTeacher, setMessageWithTimeout, userName, timerActive]);

  // Local ticking for timer (frontend countdown) with drift correction vs server syncs
  useEffect(() => {
    if (!timerActive || !timerStartTime || timerDurationSeconds <= 0) return;

    // Ensure we interpret server start_time as UTC if no timezone present
    const normalizeIsoToUtc = (iso: string): string => {
      if (!iso) return iso;
      // If already has 'Z' or timezone offset, return as-is
      if (/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) return iso;
      return iso + 'Z';
    };

    const startMs = new Date(normalizeIsoToUtc(timerStartTime)).getTime();
    const endMs = startMs + timerDurationSeconds * 1000;

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.round((endMs - now) / 1000));

      // If we have a recent server sync (within last 12s) prefer monotonic decrement from that to smooth out jitter
      if (lastTimerSyncRef.current) {
        const elapsedSinceSyncMs = now - lastTimerSyncRef.current;
        const derivedFromSync = Math.max(0, lastServerRemainingRef.current - Math.round(elapsedSinceSyncMs / 1000));
        // If drift between calculated absolute remaining and derivedFromSync is > 2s, snap to absolute
        const drift = Math.abs(derivedFromSync - remaining);
        setTimerRemainingSeconds(drift > 2 ? remaining : derivedFromSync);
      } else {
        setTimerRemainingSeconds(remaining);
      }
    };

    tick(); // initial
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timerStartTime, timerDurationSeconds]);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('🎤 Connection already in progress, skipping');
      return;
    }

    // Also check if we're already connecting via state
    if (socketState.connectionStatus === 'connecting') {
      console.log('🎤 Already connecting via state, skipping');
      return;
    }

    // Rate limiting: don't allow connections more frequently than every 3 seconds in development
    const now = Date.now();
    const minDelay = process.env.NODE_ENV === 'development' ? 3000 : 1000;
    if (now - lastConnectAttempt.current < minDelay) {
      console.log(`🎤 Rate limited: too soon since last connection attempt (${now - lastConnectAttempt.current}ms < ${minDelay}ms)`);
      return;
    }
    lastConnectAttempt.current = now;

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setSocketState(prev => ({ ...prev, connectionStatus: 'connecting', error: null }));

    try {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = API_CONFIG.BASE_URL.replace(/^https?:\/\//, '');
      const role = isTeacher ? 'teacher' : 'student';
      const wsUrl = `${wsProtocol}//${wsHost}/api/deploy/ws/live-presentation/${deploymentId}/${role}`;

      console.log('🎤 Attempting WebSocket connection:', {
        protocol: wsProtocol,
        host: wsHost,
        role,
        url: wsUrl,
        baseUrl: API_CONFIG.BASE_URL
      });

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🎤 WebSocket connected to: ' + wsUrl);
        setSocketState({
          isConnected: true,
          connectionStatus: 'connected',
          error: null
        });

        reconnectAttempts.current = 0;

        // No need to send authentication - WebSocket uses session cookies
        console.log('🎤 WebSocket authenticated via session cookies');
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleMessage(message as TypedWebSocketMessage);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('🎤 WebSocket disconnected:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          url: wsUrl
        });
        setSocketState(prev => ({ 
          ...prev, 
          isConnected: false, 
          connectionStatus: 'disconnected',
          error: event.code !== 1000 ? `Connection failed (${event.code}): ${event.reason || 'Unknown error'}` : null
        }));

        // Only attempt to reconnect for unexpected disconnections (not clean closes)
        // and only if we haven't exceeded max attempts
        if (event.code !== 1000 && event.code !== 1001 && reconnectAttempts.current < maxReconnectAttempts) {
          console.log(`🎤 Will attempt reconnect ${reconnectAttempts.current + 1}/${maxReconnectAttempts}`);
          // Don't immediately reconnect here - let the useEffect handle it with proper delay
        } else {
          console.log(`🎤 Not reconnecting: code=${event.code}, attempts=${reconnectAttempts.current}/${maxReconnectAttempts}`);
        }
      };

      ws.onerror = (error) => {
        console.error('🎤 WebSocket error:', {
          error,
          url: wsUrl,
          readyState: ws.readyState,
          protocol: ws.protocol
        });
        setSocketState(prev => ({ 
          ...prev, 
          connectionStatus: 'error',
          error: `Connection failed to ${wsUrl}`
        }));
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setSocketState(prev => ({ 
        ...prev, 
        connectionStatus: 'error',
        error: 'Failed to connect'
      }));
    }
  }, [deploymentId, isTeacher, handleMessage, socketState.connectionStatus]);

  const disconnect = useCallback(() => {
    console.log('🎤 Disconnecting WebSocket');
    
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Reset reconnect attempts and rate limiting
    reconnectAttempts.current = 0;
    lastConnectAttempt.current = 0;
    
    // Close WebSocket if open
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    
    setSocketState({
      isConnected: false,
      connectionStatus: 'disconnected',
      error: null
    });
  }, []);

  // Student actions
  const sendReady = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && !isTeacher) {
      wsRef.current.send(JSON.stringify({ type: 'student_ready' }));
      setIsReady(true);
      // Clear the ready check message and state when ready is clicked
      if (readyCheckActive) {
        setMessageWithTimeout(null);
        setReadyCheckActive(false);
      }
    }
  }, [isTeacher, readyCheckActive, setMessageWithTimeout]);

  const sendResponse = useCallback((promptId: string, response: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && !isTeacher) {
      // Check if this is an edit submission action
      if (promptId === 'edit_submission') {
        try {
          const editData = JSON.parse(response);
          wsRef.current.send(JSON.stringify({
            type: 'edit_submission',
            editData: editData
          }));
        } catch (e) {
          console.error('Failed to parse edit submission data:', e);
        }
      }
      // Check if this is a navigation action (starts with 'navigate_')
      else if (promptId.startsWith('navigate_')) {
        // Parse the response as navigation data
        try {
          const navData = JSON.parse(response);
          wsRef.current.send(JSON.stringify({
            type: promptId, // 'navigate_next' or 'navigate_previous'
            ...navData
          }));
        } catch (e) {
          console.error('Failed to parse navigation data:', e);
        }
      } else {
        // Regular student response
        wsRef.current.send(JSON.stringify({
          type: 'student_response',
          prompt_id: promptId,
          response: response
        }));
        // Set waiting state after sending response
        setWaitingForSummary(true);
      }
    }
  }, [isTeacher]);

  // Teacher actions
  const sendMessage = useCallback((message: TeacherMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && isTeacher) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, [isTeacher]);

  const sendPrompt = useCallback((prompt: LivePresentationPrompt) => {
    sendMessage({ type: 'send_prompt', prompt });
  }, [sendMessage]);

  const sendGroupInfo = useCallback((includeExplanations?: boolean) => {
    sendMessage({ 
      type: 'send_group_info',
      includeExplanations: includeExplanations || false
    });
  }, [sendMessage]);

  const startReadyCheck = useCallback(() => {
    sendMessage({ type: 'send_ready_check' });
  }, [sendMessage]);

  const requestStats = useCallback(() => {
    sendMessage({ type: 'get_stats' });
  }, [sendMessage]);

  const rebuildVariableMapping = useCallback(() => {
    sendMessage({ type: 'rebuild_variable_mapping' });
  }, [sendMessage]);

  const startPresentation = useCallback(() => {
    sendMessage({ type: 'start_presentation' });
  }, [sendMessage]);

  const endPresentation = useCallback(() => {
    sendMessage({ type: 'end_presentation' });
  }, [sendMessage]);

  const testConnections = useCallback(() => {
    sendMessage({ type: 'test_connections' });
  }, [sendMessage]);

  const startTimer = useCallback((minutes: number, seconds: number) => {
    sendMessage({ type: 'start_timer', minutes, seconds });
  }, [sendMessage]);

  const stopTimer = useCallback(() => {
    // Optimistically clear local timer state immediately
    setTimerActive(false);
    setTimerRemainingSeconds(0);
    setTimerDurationSeconds(0);
    setTimerStartTime(null);
    lastTimerSyncRef.current = null;
    lastServerRemainingRef.current = 0;
    sendMessage({ type: 'stop_timer' });
  }, [sendMessage]);

  const rotateSummaries = useCallback(() => {
    sendMessage({ type: 'rotate_summaries' });
  }, [sendMessage]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    let isMounted = true;

    // Add a small delay to prevent rapid reconnections during React development mode
    const connectTimeout: NodeJS.Timeout = setTimeout(() => {
      if (isMounted && socketState.connectionStatus === 'disconnected') {
        console.log('🎤 Initial connection attempt');
        connect();
      }
    }, 100);
    
    return () => {
      isMounted = false;
      if (connectTimeout) {
        clearTimeout(connectTimeout);
      }
      // Clean up message timeout
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current);
        messageTimeoutRef.current = null;
      }
      console.log('🎤 Component unmounting, disconnecting...');
      disconnect();
    };
  }, [deploymentId, isTeacher]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: connect/disconnect excluded from deps to prevent connection loops

  // DISABLED: Auto-reconnect logic in development to prevent resource exhaustion
  // This can be re-enabled in production if needed
  useEffect(() => {
    // Disable auto-reconnect for now to prevent "Insufficient resources" error
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!isProduction) {
      console.log('🎤 Auto-reconnect disabled in development mode');
      return;
    }

    if (socketState.connectionStatus === 'disconnected' && 
        reconnectAttempts.current < maxReconnectAttempts &&
        socketState.error) {
      
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      console.log(`🎤 Scheduling reconnect attempt ${reconnectAttempts.current + 1} in ${delay}ms`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          connect();
        }
      }, delay);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [socketState.connectionStatus, socketState.error]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: connect excluded from deps as it would cause reconnection loops

  return {
    // Connection state
    ...socketState,
    
    // Student state
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
    
    // Teacher state
    stats,
    savedPrompts,
    studentResponses,
    roomcastStatus,
    
    // Timer state
    timerActive,
    timerRemainingSeconds,
    timerDurationSeconds,
    timerStartTime,
    
    // Student actions
    sendReady,
    sendResponse,
    
    // Teacher actions
    sendPrompt,
    sendGroupInfo,
    startReadyCheck,
    requestStats,
    rebuildVariableMapping,
    startPresentation,
    endPresentation,
    testConnections,
    startTimer,
    stopTimer,
    rotateSummaries,
    
    // Connection actions
    connect,
    disconnect,
    manualReconnect: () => {
      console.log('🎤 Manual reconnect requested');
      reconnectAttempts.current = 0; // Reset attempts for manual reconnect
      lastConnectAttempt.current = 0; // Reset rate limiting for manual reconnect
      disconnect(); // Clean disconnect first
      setTimeout(() => connect(), 500); // Then reconnect after short delay
    }
  };
};
