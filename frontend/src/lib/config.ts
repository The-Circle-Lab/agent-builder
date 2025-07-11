import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface Config {
  api: {
    base_url: string;
    timeout: number;
    retry_attempts: number;
  };
  ui: {
    debounce_delay: number;
    animation_duration: number;
    max_file_size: number;
  };
  validation: {
    email: {
      min_length: number;
      max_length: number;
    };
    password: {
      min_length: number;
      max_length: number;
    };
    workflow_name: {
      min_length: number;
      max_length: number;
    };
  };
  files: {
    supported_types: string[];
    max_upload_size: number;
  };
}

let cachedConfig: Config | null = null;

// Function to substitute environment variables in config values
function substituteEnvVars(value: any): any {
  if (typeof value === 'string') {
    // Handle ${VAR_NAME:default_value} pattern
    return value.replace(/\$\{([^:}]+)(?::([^}]*))?\}/g, (_, varName, defaultValue) => {
      const envValue = process.env[varName];
      return envValue !== undefined ? envValue : (defaultValue || '');
    });
  } else if (Array.isArray(value)) {
    return value.map(substituteEnvVars);
  } else if (typeof value === 'object' && value !== null) {
    const result: any = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = substituteEnvVars(val);
    }
    return result;
  }
  return value;
}

// Load and parse the config file
function loadConfigFromFile(): Config {
  try {
    const configPath = path.join(process.cwd(), 'config.yaml');
    const configContent = fs.readFileSync(configPath, 'utf8');
    const rawConfig = yaml.load(configContent) as any;
    
    // Substitute environment variables
    const processedConfig = substituteEnvVars(rawConfig);
    
    return processedConfig as Config;
  } catch (error) {
    console.warn('Failed to load config.yaml, using defaults:', error);
    // Return default config if file doesn't exist
    return getDefaultConfig();
  }
}

// Default configuration fallback
function getDefaultConfig(): Config {
  return {
    api: {
      base_url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
      timeout: 30000,
      retry_attempts: 3,
    },
    ui: {
      debounce_delay: 300,
      animation_duration: 200,
      max_file_size: 10 * 1024 * 1024, // 10MB
    },
    validation: {
      email: {
        min_length: 5,
        max_length: 254,
      },
      password: {
        min_length: 6,
        max_length: 128,
      },
      workflow_name: {
        min_length: 1,
        max_length: 100,
      },
    },
    files: {
      supported_types: ['.pdf', '.docx', '.doc'],
      max_upload_size: 10 * 1024 * 1024, // 10MB
    },
  };
}

// Main config loader function
export function loadConfig(): Config {
  if (cachedConfig === null) {
    // In browser environment, we can't read files, so use defaults with env vars
    if (typeof window !== 'undefined') {
      cachedConfig = getDefaultConfig();
    } else {
      // In Node.js environment (build time), we can read the file
      cachedConfig = loadConfigFromFile();
    }
  }
  return cachedConfig;
}

// Convenience functions for accessing specific config sections
export const getApiConfig = () => loadConfig().api;
export const getUIConfig = () => loadConfig().ui;
export const getValidationConfig = () => loadConfig().validation;
export const getFilesConfig = () => loadConfig().files; 
