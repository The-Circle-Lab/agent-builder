// Generic API types
export interface ApiCallFunction<T = unknown, Args extends unknown[] = unknown[]> {
  (...args: Args): Promise<ApiResponse<T>>;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  status: number;
}

// Hook types
export interface UseApiOptions<T = unknown> {
  immediate?: boolean;
  retries?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
}

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseApiReturn<T> extends UseApiState<T> {
  execute: (...args: unknown[]) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<T | null>;
}

// Utility types
export type NonEmptyArray<T> = [T, ...T[]];
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = 
  Pick<T, Exclude<keyof T, Keys>> & 
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

// Event handler types
export type EventHandler<T = Event> = (event: T) => void;
export type AsyncEventHandler<T = Event> = (event: T) => Promise<void>;

// Common component props
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface LoadingProps {
  loading?: boolean;
  loadingText?: string;
}

export interface ErrorProps {
  error?: string | null;
  onErrorDismiss?: () => void;
}

// Class-related types
export type ClassRole = 'student' | 'instructor';

export interface User {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at: string;
  student?: boolean;
}

export interface Class {
  id: number;
  name: string;
  description?: string;
  instructor_id: number;
  join_code: string;
  created_at: string;
  user_role: 'instructor' | 'student';
  member_count?: number;
}

export interface ClassMember {
  id: number;
  email: string;
  role: ClassRole;
  joined_at: string;
}

export interface Workflow {
  id: number;
  name: string;
  description?: string;
  class_id: number;
  workflow_data?: {
    nodes: ReactFlowNode[];
    edges: ReactFlowEdge[];
  };
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  deployment_id: string;
  workflow_id: number;
  workflow_name: string;
  is_active: boolean;
  created_at: string;
  instructor_id: number;
  is_chat_enabled: boolean;
  is_code_enabled: boolean;
  type?: 'chat' | 'code' | 'mcq';
  is_loaded?: boolean;
  is_open?: boolean;
  grade?: [number, number] | null;
  configuration?: {
    provider: string;
    model: string;
    has_rag: boolean;
    mcp_enabled: boolean;
  };
}

// ReactFlow types to avoid importing from @xyflow/react in SSR components
export interface ReactFlowNode {
  id: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  type?: string;
  width?: number;
  height?: number;
  selected?: boolean;
  dragging?: boolean;
  [key: string]: unknown;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  data?: Record<string, unknown>;
  style?: React.CSSProperties;
  animated?: boolean;
  selected?: boolean;
  [key: string]: unknown;
}

export interface ReactFlowConnection {
  source: string | null;
  target: string | null;
  sourceHandle: string | null;
  targetHandle: string | null;
}

export interface Conversation {
  id: number;
  deployment_id: string;
  title: string;
  workflow_name: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: number;
  message_text: string;
  is_user_message: boolean;
  sources?: string[];
  created_at: string;
} 
