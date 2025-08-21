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
}

export interface GroupInfo {
  group_name: string;
  group_members: string[];
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

export interface PresentationStats {
  deployment_id: string;
  title: string;
  session_active: boolean;
  ready_check_active: boolean;
  total_students: number;
  connected_students: number;
  ready_students: number;
  students: StudentConnection[];
  group_stats: Record<string, GroupStats>;
  current_prompt?: LivePresentationPrompt & { sent_at: string };
  saved_prompts_count: number;
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
}

// WebSocket message types
export type MessageType = 
  | 'welcome'
  | 'prompt_received'
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
  | 'error';

export interface WebSocketMessage {
  type: MessageType;
  [key: string]: unknown;
}

export interface WelcomeMessage {
  type: 'welcome';
  message: string;
  group_info?: GroupInfo;
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

export type TypedWebSocketMessage = 
  | WelcomeMessage
  | PromptReceivedMessage 
  | GroupInfoMessage
  | GroupSummaryMessage
  | ReadyCheckMessage
  | StatsUpdateMessage
  | ConnectionUpdateMessage
  | ErrorMessage
  | TeacherConnectedMessage
  | StudentResponseReceivedMessage
  | SummaryGenerationStartedMessage
  | GroupInfoSentMessage
  | GroupSummaryGeneratedMessage;

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

export type TeacherMessage = SendPromptMessage | SendGroupInfoMessage | SendReadyCheckMessage | GetStatsMessage | RebuildVariableMappingMessage;




