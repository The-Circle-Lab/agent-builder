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

export interface Class {
  id: number;
  code: string;
  name: string;
  description?: string;
  created_at: string;
  is_active: boolean;
  user_role: ClassRole;
  member_count: number;
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
  created_at: string;
  updated_at: string;
  is_public: boolean;
  workflow_data: any;
}

export interface Deployment {
  deployment_id: string;
  workflow_name: string;
  created_at: string;
  chat_url: string;
  is_loaded: boolean;
  configuration: {
    provider: string;
    model: string;
    has_rag: boolean;
    mcp_enabled: boolean;
  };
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
