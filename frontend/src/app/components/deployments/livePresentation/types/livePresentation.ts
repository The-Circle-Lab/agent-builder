export interface SubmissionResponse {
  response: string;
  [key: string]: unknown;
}

export interface LivePresentationPrompt {
  id: string;
  statement: string;
  hasInput: boolean;
  inputType?: "textarea" | "text" | "none";
  inputPlaceholder?: string;
  useRandomListItem?: boolean;
  listVariableId?: string;
  assigned_list_item?: unknown; // The specific list item assigned to this student's group
  isSystemPrompt?: boolean;
  category?: string;
  is_late_join?: boolean; // Flag to indicate this prompt was sent to a late-joining student
  submission_responses?: Record<string, SubmissionResponse | string>;
  group_submission_responses?: Record<string, Record<string, SubmissionResponse | string>>;
  
  // Group submission navigation fields
  enableGroupSubmissionNavigation?: boolean;
  submissionPromptId?: string;
  allowEditing?: boolean;
  currentSubmissionIndex?: number; // Current navigation index
  totalSubmissions?: number; // Total number of submissions in group
  currentStudentName?: string; // Name of student whose submission is displayed
  currentSubmission?: {
    type?: string;
    data?: Record<string, unknown>;
    url?: string;
    name?: string;
    purpose?: string;
    platform?: string;
    [key: string]: unknown;
  }; // The actual submission data being displayed
}

export interface GroupInfo {
  group_name: string;
  group_members: string[];
  explanation?: string;
}

export interface StudentConnection {
  user_id: string;
  user_name: string;
  status: 'connected' | 'ready' | 'disconnected';
  connected_at: string;
  last_activity: string;
  response_count: number;
  group_info?: GroupInfo;
}

export interface GroupStats {
  total_members: number;
  connected_members: number;
  members: string[];
}

export interface RoomcastStatus {
  enabled: boolean;
  code: string | null;
  code_expires_at: string | null;
  expected_groups: string[];
  groups_are_predicted?: boolean;
  connected_groups: string[];
  waiting: boolean;
}

export interface PresentationStats {
  deployment_id: string;
  title: string;
  session_active: boolean;
  presentation_active: boolean;
  ready_check_active: boolean;
  total_students: number;
  connected_students: number;
  ready_students: number;
  students: StudentConnection[];
  group_stats: Record<string, GroupStats>;
  current_prompt?: LivePresentationPrompt & { sent_at: string };
  saved_prompts_count: number;
  roomcast?: RoomcastStatus;
  timer?: TimerStatus;
}

export interface TimerStatus {
  active: boolean;
  remaining_seconds: number;
  duration_seconds: number;
  start_time: string | null;
}

export interface StudentResponse {
  response: string;
  prompt_id: string;
  timestamp: string;
  user_id: string;
  user_name: string;
}

export interface GroupSummary {
  text: string;
  key_themes: string[];
  response_count: number;
  generated_at: string;
}

export interface GroupSummaryMessage {
  type: 'group_summary';
  prompt_id: string;
  group_name: string;
  summary: GroupSummary;
}

export interface LivePresentationInfo {
  deployment_id: string;
  title: string;
  description: string;
  saved_prompts: LivePresentationPrompt[];
  roomcast?: {
    enabled: boolean;
    code: string | null;
    expected_groups: string[];
    groups_are_predicted?: boolean;
  };
}

// WebSocket message types
export type MessageType = 
  | 'welcome'
  | 'waiting_for_teacher'
  | 'presentation_started'
  | 'presentation_ended'
  | 'presentation_state_changed'
  | 'prompt_received'
  | 'navigation_update'
  | 'submission_updated'
  | 'group_info'
  | 'group_info_sent'
  | 'group_summary'
  | 'group_summary_generated'
  | 'summary_generation_started'
  | 'ready_check'
  | 'teacher_connected'
  | 'connection_update'
  | 'student_response_received'
  | 'stats_update'
  | 'connection_test'
  | 'connection_test_result'
  | 'roomcast_status'
  | 'roomcast_connected'
  | 'roomcast_registered'
  | 'roomcast_navigation_prompt'
  | 'roomcast_navigation_update'
  | 'roomcast_submission_updated'
  | 'roomcast_prompt'
  | 'roomcast_group_info'
  | 'timer_started'
  | 'timer_stopped'
  | 'timer_update'
  | 'timer_expired'
  | 'error';

export interface WebSocketMessage {
  type: MessageType;
  [key: string]: unknown;
}

export interface WelcomeMessage {
  type: 'welcome';
  message: string;
  group_info?: GroupInfo;
  presentation_active?: boolean;
}

export interface WaitingForTeacherMessage {
  type: 'waiting_for_teacher';
  message: string;
  group_info?: GroupInfo;
  presentation_active?: boolean;
}

export interface PresentationStartedMessage {
  type: 'presentation_started';
  message: string;
  presentation_active: boolean;
}

export interface PresentationEndedMessage {
  type: 'presentation_ended';
  message: string;
  presentation_active: boolean;
}

export interface PresentationStateChangedMessage {
  type: 'presentation_state_changed';
  action: 'started' | 'ended';
  presentation_active: boolean;
  timestamp: string;
}

export interface ConnectionTestMessage {
  type: 'connection_test';
  message: string;
}

export interface ConnectionTestResultMessage {
  type: 'connection_test_result';
  message: string;
  failed_count: number;
  stats: PresentationStats;
}

export interface PromptReceivedMessage {
  type: 'prompt_received';
  prompt: LivePresentationPrompt;
}

export interface GroupInfoMessage {
  type: 'group_info';
  group_info: GroupInfo;
  is_late_join?: boolean;
}

export interface ReadyCheckMessage {
  type: 'ready_check';
  active: boolean;
  is_late_join?: boolean;
  message?: string;
}

export interface StatsUpdateMessage {
  type: 'stats_update';
  stats: PresentationStats;
}

export interface ConnectionUpdateMessage {
  type: 'connection_update';
  students: StudentConnection[];
  stats?: PresentationStats;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface TeacherConnectedMessage {
  type: 'teacher_connected';
  stats: PresentationStats;
  saved_prompts?: LivePresentationPrompt[];
  presentation_active?: boolean;
}

export interface StudentResponseReceivedMessage {
  type: 'student_response_received';
  response: string;
  prompt_id: string;
  timestamp: string;
  student: {
    user_id: string;
    user_name: string;
  };
}

export interface SummaryGenerationStartedMessage {
  type: 'summary_generation_started';
  prompt_id: string;
}

export interface GroupInfoSentMessage {
  type: 'group_info_sent';
}

export interface GroupSummaryGeneratedMessage {
  type: 'group_summary_generated';
  prompt_id: string;
}

export interface TimerStartedMessage {
  type: 'timer_started';
  duration_seconds: number;
  remaining_seconds: number;
  start_time: string;
}

export interface TimerStoppedMessage {
  type: 'timer_stopped';
}

export interface TimerUpdateMessage {
  type: 'timer_update';
  remaining_seconds: number;
  duration_seconds: number;
}

export interface TimerExpiredMessage {
  type: 'timer_expired';
  remaining_seconds: number;
  duration_seconds: number;
}

export type TypedWebSocketMessage = 
  | WelcomeMessage
  | WaitingForTeacherMessage
  | PresentationStartedMessage
  | PresentationEndedMessage
  | PresentationStateChangedMessage
  | PromptReceivedMessage 
  | SendPromptMessage
  | NavigationUpdateMessage
  | SubmissionUpdatedMessage
  | GroupInfoMessage
  | GroupSummaryMessage
  | ReadyCheckMessage
  | StatsUpdateMessage
  | ConnectionUpdateMessage
  | ConnectionTestMessage
  | ConnectionTestResultMessage
  | ErrorMessage
  | TeacherConnectedMessage
  | StudentResponseReceivedMessage
  | SummaryGenerationStartedMessage
  | GroupInfoSentMessage
  | GroupSummaryGeneratedMessage
  | TimerStartedMessage
  | TimerStoppedMessage
  | TimerUpdateMessage
  | TimerExpiredMessage
  | RoomcastStatusMessage
  | RoomcastConnectedMessage
  | RoomcastRegisteredMessage
  | RoomcastNavigationPromptMessage
  | RoomcastNavigationUpdateMessage
  | RoomcastSubmissionUpdatedMessage
  | RoomcastPromptMessage
  | RoomcastGroupInfoMessage;

// Student message types
export interface StudentReadyMessage {
  type: 'student_ready';
}

export interface StudentResponseMessage {
  type: 'student_response';
  prompt_id: string;
  response: string;
}

export interface StudentJoinMessage {
  type: 'student_join';
  user_id: string;
  user_name: string;
  access_token: string;
}

// Teacher message types
export interface SendPromptMessage {
  type: 'send_prompt';
  prompt: LivePresentationPrompt;
}

export interface SendGroupInfoMessage {
  type: 'send_group_info';
  includeExplanations?: boolean;
}

export interface SendReadyCheckMessage {
  type: 'send_ready_check';
}

export interface GetStatsMessage {
  type: 'get_stats';
}

export interface RebuildVariableMappingMessage {
  type: 'rebuild_variable_mapping';
}

export interface StartPresentationMessage {
  type: 'start_presentation';
}

export interface EndPresentationMessage {
  type: 'end_presentation';
}

export interface TestConnectionsMessage {
  type: 'test_connections';
}

export interface StartTimerMessage {
  type: 'start_timer';
  minutes: number;
  seconds: number;
}

export interface StopTimerMessage {
  type: 'stop_timer';
}

export type TeacherMessage = 
  | SendPromptMessage 
  | SendGroupInfoMessage 
  | SendReadyCheckMessage 
  | GetStatsMessage 
  | RebuildVariableMappingMessage
  | StartPresentationMessage
  | EndPresentationMessage
  | TestConnectionsMessage
  | StartTimerMessage
  | StopTimerMessage;

// Roomcast message types
export interface RoomcastStatusMessage {
  type: 'roomcast_status';
  status: RoomcastStatus;
}

export interface RoomcastConnectedMessage {
  type: 'roomcast_connected';
  deployment_id: string;
  expected_groups: string[];
  groups_are_predicted?: boolean;
  connected_groups: string[];
}

export interface RoomcastRegisteredMessage {
  type: 'roomcast_registered';
  group_name: string;
}

export interface NavigationSubmissionPayload {
  studentName?: string;
  userId?: string;
  submission?: {
    type?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  } | Record<string, unknown> | null;
}

export interface NavigationUpdateMessage {
  type: 'navigation_update';
  currentIndex: number;
  currentSubmission?: NavigationSubmissionPayload;
}

export interface SubmissionUpdatedMessage {
  type: 'submission_updated';
  submissionIndex: number;
  updatedData: Record<string, unknown>;
}

export interface RoomcastNavigationPromptMessage {
  type: 'roomcast_navigation_prompt';
  group_name: string;
  prompt: LivePresentationPrompt;
}

export interface RoomcastNavigationUpdateMessage {
  type: 'roomcast_navigation_update';
  currentIndex: number;
  currentSubmission?: NavigationSubmissionPayload;
}

export interface RoomcastSubmissionUpdatedMessage {
  type: 'roomcast_submission_updated';
  submissionIndex: number;
  updatedData: Record<string, unknown>;
}

export interface RoomcastPromptMessage {
  type: 'roomcast_prompt';
  group_name: string;
  prompt: LivePresentationPrompt;
}

export interface RoomcastGroupInfoMessage {
  type: 'roomcast_group_info';
  group_name: string;
  members: string[];
  explanation?: string;
}

export interface RoomcastCodeInfo {
  deployment_id: string;
  title: string;
  expected_groups: string[];
  groups_are_predicted?: boolean;
  roomcast_enabled: boolean;
}

