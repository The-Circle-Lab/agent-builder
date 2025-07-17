import { useRef, useState, useCallback, useEffect } from 'react';
import { API_CONFIG } from '@/lib/constants';
import { WebSocketMessage } from '../types/chat';
import { processThinkTags } from '../utils/messageParser';

interface UseWebSocketProps {
  deploymentId: string;
  enabled: boolean;
  onTyping: () => void;
  onStreamStart: () => void;
  onStreamChunk: (chunk: string, sources: string[]) => void;
  onResponse: (response: string, sources?: string[]) => void;
  onError: (error: string) => void;
}

export const useWebSocket = ({
  deploymentId,
  enabled,
  onTyping,
  onStreamStart,
  onStreamChunk,
  onResponse,
  onError
}: UseWebSocketProps) => {
  const [connected, setConnected] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentStreamingMessageRef = useRef<string>("");
  const currentStreamingSourcesRef = useRef<string[]>([]);
  const reconnectAttemptsRef = useRef<number>(0);

  const handleWebSocketMessage = useCallback((data: WebSocketMessage) => {
    switch (data.type) {
      case 'auth_success':
        break;
        
      case 'typing':
        onTyping();
        // Clear any previous streaming state for new response
        currentStreamingMessageRef.current = "";
        currentStreamingSourcesRef.current = [];
        break;
        
      case 'stream':
        if (data.chunk) {
          currentStreamingMessageRef.current += data.chunk;
          
          // Use sources from early message or chunk data
          const availableSources = currentStreamingSourcesRef.current.length > 0 
            ? currentStreamingSourcesRef.current 
            : (data.sources || []);
          
          onStreamStart();
          onStreamChunk(currentStreamingMessageRef.current, availableSources);
        }
        break;
        
      case 'response':
        currentStreamingMessageRef.current = "";
        currentStreamingSourcesRef.current = [];
        
        if (data.response) {
          // Remove think tags from final response
          const processedResponse = processThinkTags(data.response, false);
          onResponse(processedResponse, data.sources);
        }
        break;
        
      case 'error':
        onError(data.message || "Chat error occurred");
        break;
        
      case 'pong':
        break;
        
      case 'sources':
        currentStreamingSourcesRef.current = data.sources || [];
        break;
        
      default:
        break;
    }
  }, [onTyping, onStreamStart, onStreamChunk, onResponse, onError]);

  const connectWebSocket = useCallback(() => {
    try {
      // Check if WebSocket is available
      if (typeof WebSocket === 'undefined') {
        onError("WebSocket not supported");
        return;
      }
      
      // Reset reconnect attempts when starting a fresh connection
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        reconnectAttemptsRef.current = 0;
      }
      
      // Try to get session ID from cookie for fallback
      const sessionId = document.cookie
        .split('; ')
        .find(row => row.startsWith('sid='))
        ?.split('=')[1];
      
      // Convert HTTP base URL to WebSocket URL
      const baseUrl = API_CONFIG.BASE_URL;
      const wsProtocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
      const wsHost = baseUrl.replace(/^https?:\/\//, '');
      let wsUrl = `${wsProtocol}//${wsHost}/api/deploy/ws/${deploymentId}`;
      
      // Add session ID as query parameter if available (fallback for cookie issues)
      if (sessionId) {
        wsUrl += `?sid=${sessionId}`;
      }
      
      // WebSocket will automatically include cookies with the connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Setup ping interval for connection health
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch {
          // Silently ignore parsing errors
        }
      };
      
      ws.onerror = () => {
        onError("WebSocket connection error");
      };
      
      ws.onclose = (event) => {
        setConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // If connection closed immediately with specific codes, it's likely auth failure
        if (event.code === 1002 || event.code === 1003 || (event.code === 1000 && reconnectAttemptsRef.current === 0)) {
          onError("Authentication failed. Please refresh the page and try again.");
          return;
        }
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < 5 && enabled) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1;
            connectWebSocket();
          }, timeout);
        } else {
          onError("Failed to connect to chat service. Please refresh the page.");
        }
      };
      
    } catch {
      onError("Failed to establish WebSocket connection");
    }
  }, [deploymentId, handleWebSocketMessage, onError, enabled]);

  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setConnected(false);
  }, []);

  const sendMessage = useCallback((message: string, history: string[][], conversationId?: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    // Reset streaming state
    currentStreamingMessageRef.current = "";
    
    wsRef.current.send(JSON.stringify({
      type: 'chat',
      message: message,
      history: history,
      conversation_id: conversationId || undefined
    }));
  }, []);

  // Connection management
  useEffect(() => {
    if (!enabled) {
      disconnectWebSocket();
      return;
    }
    
    // Only connect if not already connected
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      const timeoutId = setTimeout(() => {
        connectWebSocket();
      }, 100);
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [enabled, connectWebSocket, disconnectWebSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, [disconnectWebSocket]);

  return {
    connected,
    sendMessage,
    isReady: connected && wsRef.current?.readyState === WebSocket.OPEN
  };
}; 
