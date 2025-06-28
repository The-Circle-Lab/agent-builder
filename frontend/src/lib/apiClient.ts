import { API_CONFIG } from './constants';
import { getHttpErrorMessage, sanitizeErrorMessage, isDevelopment } from './utils';
import type { ApiResponse } from './types';

interface RequestConfig extends RequestInit {
  timeout?: number;
}

class ApiClient {
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(baseUrl: string = API_CONFIG.BASE_URL, timeout: number = API_CONFIG.TIMEOUT) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  private async request<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    const { timeout = this.timeout, ...requestConfig } = config;
    
    // Setup timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...requestConfig,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...requestConfig.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Log only in development
      if (isDevelopment()) {
        console.log(`API ${requestConfig.method || 'GET'} ${endpoint}:`, response.status);
      }

      if (!response.ok) {
        const errorData = await this.safeJsonParse<{ detail?: string }>(response);
        const errorMessage = errorData?.detail || getHttpErrorMessage(response.status);
        
        return {
          error: sanitizeErrorMessage(errorMessage),
          status: response.status,
        };
      }

      const data = await this.safeJsonParse<T>(response);
      return { data, status: response.status };
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          error: 'Request timed out. Please try again.',
          status: 408,
        };
      }

      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return {
        error: sanitizeErrorMessage(errorMessage),
        status: 0,
      };
    }
  }

  private async safeJsonParse<T>(response: Response): Promise<T | undefined> {
    try {
      const text = await response.text();
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined;
    }
  }

  // HTTP Methods
  async get<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  async patch<T>(endpoint: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export types for consumers
export type { ApiResponse, RequestConfig }; 
