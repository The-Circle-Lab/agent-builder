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
    console.log('WebSocket message received:', data.type, data);
    
    switch (data.type) {
      case 'auth_success':
        console.log('WebSocket authentication successful');
        break;
        
      case 'typing':
        console.log('Assistant is typing...');
        onTyping();
        // Clear any previous streaming state for new response
        currentStreamingMessageRef.current = "";
        currentStreamingSourcesRef.current = [];
        break;
        
      case 'stream':
        if (data.chunk) {
          console.log(`Received streaming chunk (${data.chunk.length} chars):`, data.chunk);
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
        console.log('Received final response:', data.response, 'Sources:', data.sources);
        currentStreamingMessageRef.current = "";
        currentStreamingSourcesRef.current = [];
        
        if (data.response) {
          // Remove think tags from final response
          const processedResponse = processThinkTags(data.response, false);
          onResponse(processedResponse, data.sources);
        }
        break;
        
      case 'error':
        console.error('WebSocket error:', data.message);
        onError(data.message || "Chat error occurred");
        break;
        
      case 'pong':
        console.log('Received pong');
        break;
        
      case 'sources':
        console.log('Received sources:', data.sources);
        currentStreamingSourcesRef.current = data.sources || [];
        break;
        
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }, [onTyping, onStreamStart, onStreamChunk, onResponse, onError]);

  const connectWebSocket = useCallback(() => {
    try {
      // Check if WebSocket is available
      if (typeof WebSocket === 'undefined') {
        console.error('[WebSocket] WebSocket API not available in this browser');
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
      
      console.log(`[WebSocket] Connecting to: ${wsUrl}`);
      console.log(`[WebSocket] Base URL: ${baseUrl}`);
      console.log(`[WebSocket] Deployment ID: ${deploymentId}`);
      console.log(`[WebSocket] Session ID available: ${!!sessionId}`);
      
      // WebSocket will automatically include cookies with the connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[WebSocket] Connection opened successfully');
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
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      ws.onerror = () => {
        onError("WebSocket connection error");
      };
      
      ws.onclose = (event) => {
        console.log(`[WebSocket] Connection closed. Code: ${event.code}, Reason: ${event.reason}, Clean: ${event.wasClean}`);
        setConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Log close codes for debugging
        const closeCodeMessages: Record<number, string> = {
          1000: 'Normal closure',
          1001: 'Going away',
          1002: 'Protocol error',
          1003: 'Unsupported data',
          1006: 'Abnormal closure',
          1011: 'Server error',
          1015: 'TLS handshake failure'
        };
        
        console.log(`[WebSocket] Close reason: ${closeCodeMessages[event.code] || 'Unknown'}`);
        
        // If connection closed immediately with specific codes, it's likely auth failure
        if (event.code === 1002 || event.code === 1003 || (event.code === 1000 && reconnectAttemptsRef.current === 0)) {
          console.log('[WebSocket] Connection closed due to authentication or protocol error');
          onError("Authentication failed. Please refresh the page and try again.");
          return;
        }
        
        // Attempt reconnection
        if (reconnectAttemptsRef.current < 5 && enabled) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
          console.log(`[WebSocket] Attempting reconnection ${reconnectAttemptsRef.current + 1}/5 in ${timeout}ms`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current = reconnectAttemptsRef.current + 1;
            connectWebSocket();
          }, timeout);
        } else {
          console.log('[WebSocket] Max reconnection attempts reached or connection disabled');
          onError("Failed to connect to chat service. Please refresh the page.");
        }
      };
      
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
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
  }, [enabled]); // Only depend on enabled, not the callbacks

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, []);

  return {
    connected,
    sendMessage,
    isReady: connected && wsRef.current?.readyState === WebSocket.OPEN
  };
}; 
