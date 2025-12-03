import { VALIDATION, ERROR_MESSAGES } from './constants';

// Type guard functions
export const isString = (value: unknown): value is string => typeof value === 'string';
export const isNumber = (value: unknown): value is number => typeof value === 'number';
export const isEmail = (email: string): boolean => VALIDATION.EMAIL.PATTERN.test(email);

// Validation functions
export const validateEmail = (email: string): { isValid: boolean; error?: string } => {
  if (!email) return { isValid: false, error: ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD };
  if (!isEmail(email)) return { isValid: false, error: ERROR_MESSAGES.VALIDATION.EMAIL_INVALID };
  return { isValid: true };
};

export const validatePassword = (password: string): { isValid: boolean; error?: string } => {
  if (!password) return { isValid: false, error: ERROR_MESSAGES.VALIDATION.REQUIRED_FIELD };
  if (password.length < VALIDATION.PASSWORD.MIN_LENGTH) {
    return { isValid: false, error: ERROR_MESSAGES.VALIDATION.PASSWORD_TOO_SHORT };
  }
  return { isValid: true };
};

export const validatePasswordMatch = (password: string, confirmPassword: string): { isValid: boolean; error?: string } => {
  if (password !== confirmPassword) {
    return { isValid: false, error: ERROR_MESSAGES.VALIDATION.PASSWORD_MISMATCH };
  }
  return { isValid: true };
};

// Error handling utilities
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (isString(error)) return error;
  return 'An unexpected error occurred';
};

export const sanitizeErrorMessage = (error: unknown): string => {
  const baseMessage = (() => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (typeof error === 'number' || typeof error === 'boolean') return String(error);
    if (error === null || error === undefined) return 'An unexpected error occurred';
    try {
      return JSON.stringify(error);
    } catch {
      return 'An unexpected error occurred';
    }
  })();

  // Remove potentially sensitive information from error messages
  const sensitivePatterns = [
    /(?:password|token|key|secret)[\s\S]*$/i,
    /(?:stack trace|traceback)[\s\S]*$/i,
  ];
  
  let sanitized = baseMessage;
  sensitivePatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  
  return sanitized;
};

// HTTP status code handling
export const getHttpErrorMessage = (status: number): string => {
  switch (status) {
    case 401: return ERROR_MESSAGES.UNAUTHORIZED;
    case 403: return ERROR_MESSAGES.FORBIDDEN;
    case 404: return ERROR_MESSAGES.NOT_FOUND;
    case 500:
    case 502:
    case 503:
    case 504: return ERROR_MESSAGES.SERVER_ERROR;
    default: return ERROR_MESSAGES.NETWORK;
  }
};

// Debounce utility
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// Safe JSON parsing
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

// Environment utilities
export const isDevelopment = (): boolean => process.env.NODE_ENV === 'development';
export const isProduction = (): boolean => process.env.NODE_ENV === 'production';

// DOM utilities
export const scrollToTop = (): void => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// Date utilities
export const formatDate = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateTime = (date: Date | string): string => {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}; 
