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

function getDefaultConfig(): Config {
  return {
    api: {
      base_url:
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
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
      supported_types: [".pdf", ".docx", ".doc"],
      max_upload_size: 10 * 1024 * 1024, // 10MB
    },
  };
}

export function loadConfig(): Config {
  if (cachedConfig === null) {
    if (typeof window !== "undefined") {
      cachedConfig = getDefaultConfig();
    } else {
      cachedConfig = getDefaultConfig();
    }
  }
  return cachedConfig;
}

export const getApiConfig = () => loadConfig().api;
export const getUIConfig = () => loadConfig().ui;
export const getValidationConfig = () => loadConfig().validation;
export const getFilesConfig = () => loadConfig().files;
