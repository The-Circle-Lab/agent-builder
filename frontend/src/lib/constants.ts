// Environment and API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
} as const;

// Application Routes
export const ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    ME: '/me',
  },
  CLASSES: '/api/classes',
  WORKFLOWS: '/api/workflows',
  DOCUMENTS: '/api/documents',
  DEPLOYMENTS: '/api/deploy',
} as const;

// UI Constants
export const UI = {
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 200,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_FILE_TYPES: ['.pdf', '.docx', '.doc'] as const,
} as const;

// Validation Rules
export const VALIDATION = {
  EMAIL: {
    MIN_LENGTH: 5,
    MAX_LENGTH: 254,
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 128,
  },
  WORKFLOW_NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
  },
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK: 'Network error. Please check your connection and try again.',
  UNAUTHORIZED: 'Session expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'A server error occurred. Please try again later.',
  VALIDATION: {
    EMAIL_INVALID: 'Please enter a valid email address.',
    PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION.PASSWORD.MIN_LENGTH} characters.`,
    PASSWORD_MISMATCH: 'Passwords do not match.',
    REQUIRED_FIELD: 'This field is required.',
  },
} as const;

// Application States
export const APP_STATES = {
  LOADING: 'loading',
  LOGIN: 'login',
  CLASSES: 'classes',
  CLASS_DETAIL: 'classDetail',
  WORKFLOWS: 'workflows',
  EDITOR: 'editor',
  DEPLOYMENTS: 'deployments',
  CHAT: 'chat',
  CODE: 'code',
} as const;

export type AppState = typeof APP_STATES[keyof typeof APP_STATES]; 
