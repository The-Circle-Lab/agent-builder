export interface ChatInterfaceProps {
  deploymentId: string;
  workflowName: string;
  onBack?: () => void;
  embedded?: boolean; // For embedded mode in code interface
}

export interface Message {
  id: string;
  text: string;
  isUser: boolean;
  sources?: string[];
  timestamp: Date;
  isStreaming?: boolean;
}

export interface ParsedTextPart {
  type: 'text' | 'citation' | 'thinking';
  content: string | string[];
}

export interface WebSocketMessage {
  type: 'auth_success' | 'typing' | 'stream' | 'response' | 'error' | 'pong' | 'sources';
  message?: string;
  chunk?: string;
  response?: string;
  sources?: string[];
}

export interface ChatRequest {
  type: 'chat';
  message: string;
  history: string[][];
  conversation_id?: number;
}

export interface PingRequest {
  type: 'ping';
} 
