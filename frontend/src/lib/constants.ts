import { getApiConfig, getUIConfig, getValidationConfig } from './config';

// Environment and API Configuration
const apiConfig = getApiConfig();
export const API_CONFIG = {
  BASE_URL: apiConfig.base_url,
  TIMEOUT: apiConfig.timeout,
  RETRY_ATTEMPTS: apiConfig.retry_attempts,
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
const uiConfig = getUIConfig();
export const UI = {
  DEBOUNCE_DELAY: uiConfig.debounce_delay,
  ANIMATION_DURATION: uiConfig.animation_duration,
  MAX_FILE_SIZE: uiConfig.max_file_size,
  SUPPORTED_FILE_TYPES: ['.pdf', '.docx', '.doc'] as const,
} as const;

// Validation Rules
const validationConfig = getValidationConfig();
export const VALIDATION = {
  EMAIL: {
    MIN_LENGTH: validationConfig.email.min_length,
    MAX_LENGTH: validationConfig.email.max_length,
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  PASSWORD: {
    MIN_LENGTH: validationConfig.password.min_length,
    MAX_LENGTH: validationConfig.password.max_length,
  },
  WORKFLOW_NAME: {
    MIN_LENGTH: validationConfig.workflow_name.min_length,
    MAX_LENGTH: validationConfig.workflow_name.max_length,
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
  MCQ: 'mcq',
  PROMPT: 'prompt',
} as const;

export type AppState = typeof APP_STATES[keyof typeof APP_STATES]; 
