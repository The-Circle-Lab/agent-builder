import { useState, useCallback, useRef, useEffect } from 'react';
import { API_CONFIG } from '@/lib/constants';
import type { 
  ApiCallFunction, 
  ApiResponse, 
  UseApiOptions, 
  UseApiReturn, 
  UseApiState 
} from '@/lib/types';

export function useApi<T = unknown>(
  apiCall: ApiCallFunction<T>,
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const { immediate = false, retries = API_CONFIG.RETRY_ATTEMPTS, onSuccess, onError } = options;
  
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: immediate,
    error: null,
  });

  const lastCallArgs = useRef<unknown[]>([]);
  const retryCount = useRef(0);

  const execute = useCallback(async (...args: unknown[]): Promise<T | null> => {
    lastCallArgs.current = args;
    retryCount.current = 0;

    setState(prev => ({ ...prev, loading: true, error: null }));

    const attemptRequest = async (): Promise<T | null> => {
      try {
        const response = await apiCall(...args);

        if (response.error) {
          if (retryCount.current < retries && response.status >= 500) {
            retryCount.current++;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount.current) * 1000));
            return attemptRequest();
          }

          setState(prev => ({ ...prev, loading: false, error: response.error! }));
          onError?.(response.error);
          return null;
        }

        setState(prev => ({ ...prev, loading: false, data: response.data!, error: null }));
        onSuccess?.(response.data);
        return response.data!;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        setState(prev => ({ ...prev, loading: false, error: errorMessage }));
        onError?.(errorMessage);
        return null;
      }
    };

    return attemptRequest();
  }, [apiCall, retries, onSuccess, onError]);

  const retry = useCallback(() => {
    return execute(...lastCallArgs.current);
  }, [execute]);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
    retryCount.current = 0;
  }, []);

  // Execute immediately if requested
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  return {
    ...state,
    execute,
    reset,
    retry,
  };
}

// Specialized hooks for common patterns
export function useApiMutation<T = unknown>(
  apiCall: ApiCallFunction<T>,
  options?: UseApiOptions<T>
) {
  return useApi(apiCall, { ...options, immediate: false });
}

export function useApiQuery<T = unknown>(
  apiCall: () => Promise<ApiResponse<T>>,
  options?: UseApiOptions<T>
) {
  return useApi(apiCall, { ...options, immediate: true });
} 
