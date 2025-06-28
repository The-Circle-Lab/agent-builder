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
