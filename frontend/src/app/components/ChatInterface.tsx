"use client";

import React, { useState, useRef, useEffect } from "react";
import { DeploymentAPI, ConversationResponse, MessageResponse } from "./agentBuilder/scripts/deploymentAPI";
import ReactMarkdown from "react-markdown";
import { API_CONFIG } from "@/lib/constants";

interface ChatInterfaceProps {
  deploymentId: string;
  workflowName: string;
  onBack?: () => void;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  sources?: string[];
  timestamp: Date;
  isStreaming?: boolean;
}

interface ParsedTextPart {
  type: 'text' | 'citation';
  content: string | string[];
}

interface WebSocketMessage {
  type: 'auth_success' | 'typing' | 'stream' | 'response' | 'error' | 'pong';
  message?: string;
  chunk?: string;
  response?: string;
  sources?: string[];
}

export default function ChatInterface({ deploymentId, workflowName, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  
  // WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [useWebSocket, setUseWebSocket] = useState(true); // Toggle for WebSocket vs REST
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentStreamingMessageRef = useRef<string>("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket connection functions
  const connectWebSocket = () => {
    try {
      // Check if WebSocket is available
      if (typeof WebSocket === 'undefined') {
        console.error('[WebSocket] WebSocket API not available in this browser');
        setError("WebSocket not supported");
        setUseWebSocket(false);
        return;
      }
      
      // Convert HTTP base URL to WebSocket URL
      const baseUrl = API_CONFIG.BASE_URL;
      const wsProtocol = baseUrl.startsWith('https://') ? 'wss:' : 'ws:';
      const wsHost = baseUrl.replace(/^https?:\/\//, '');
      const wsUrl = `${wsProtocol}//${wsHost}/api/deploy/ws/${deploymentId}`;
      
      // WebSocket will automatically include cookies with the connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setWsConnected(true);
        setReconnectAttempts(0);
        setError("");
        
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
        setError("WebSocket connection error");
      };
      
      ws.onclose = (event) => {
        setWsConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // If connection closed immediately with specific codes, it's likely auth failure
        if (event.code === 1002 || event.code === 1003 || (event.code === 1000 && reconnectAttempts === 0)) {
          setUseWebSocket(false);
          return;
        }
        
        // Attempt reconnection
        if (reconnectAttempts < 5) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, timeout);
        } else {
          setError("Failed to connect to chat service. Please refresh the page.");
          setUseWebSocket(false);
        }
      };
      
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError("Failed to establish WebSocket connection");
    }
  };
  
  const disconnectWebSocket = () => {
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
    
    setWsConnected(false);
  };
  
  const handleWebSocketMessage = (data: WebSocketMessage) => {
    console.log('WebSocket message received:', data.type, data);
    
    switch (data.type) {
      case 'auth_success':
        console.log('WebSocket authentication successful');
        break;
        
      case 'typing':
        console.log('Assistant is typing...');
        setIsLoading(true);
        break;
        
      case 'stream':
        if (data.chunk) {
          console.log(`Received streaming chunk (${data.chunk.length} chars):`, data.chunk);
          currentStreamingMessageRef.current += data.chunk;
          
          setMessages(prev => {
            // Check if there's already a streaming message
            const hasStreamingMessage = prev.some(msg => !msg.isUser && msg.isStreaming);
            
            if (hasStreamingMessage) {
              // Update existing streaming message
              console.log('Updating existing streaming message');
              return prev.map(msg => {
                if (!msg.isUser && msg.isStreaming) {
                  return { ...msg, text: currentStreamingMessageRef.current };
                }
                return msg;
              });
            } else {
              // Create new streaming message
              console.log('Creating new streaming message');
              const streamingMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: currentStreamingMessageRef.current,
                isUser: false,
                timestamp: new Date(),
                isStreaming: true,
              };
              setIsLoading(false); // Hide loading indicator now that streaming started
              return [...prev, streamingMessage];
            }
          });
        } else {
          console.log('Received empty streaming chunk');
        }
        break;
        
      case 'response':
        console.log('Received final response:', data.response, 'Sources:', data.sources);
        setIsLoading(false);
        currentStreamingMessageRef.current = "";
        
        setMessages(prev => {
          // Check if there's a streaming message to update
          const hasStreamingMessage = prev.some(msg => !msg.isUser && msg.isStreaming);
          
          if (hasStreamingMessage) {
            // Update existing streaming message
            console.log('Finalizing streaming message');
            return prev.map(msg => {
              if (!msg.isUser && msg.isStreaming) {
                return { 
                  ...msg, 
                  text: data.response || "", 
                  sources: data.sources,
                  isStreaming: false 
                };
              }
              return msg;
            });
          } else {
            // Create new message if no streaming message exists
            console.log('Creating new response message (no streaming chunks received)');
            const responseMessage: Message = {
              id: (Date.now() + 1).toString(),
              text: data.response || "",
              isUser: false,
              timestamp: new Date(),
              sources: data.sources,
              isStreaming: false,
            };
            return [...prev, responseMessage];
          }
        });
        break;
        
      case 'error':
        console.error('WebSocket error:', data.message);
        // If it's an authentication error, fall back to REST API
        if (data.message && (data.message.includes('session') || data.message.includes('authenticated') || data.message.includes('cookie'))) {
          console.log('Authentication error detected, falling back to REST API');
          setUseWebSocket(false);
          disconnectWebSocket();
        } else {
          setError(data.message || "Chat error occurred");
        }
        setIsLoading(false);
        break;
        
      case 'pong':
        console.log('Received pong');
        break;
        
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  // Function to parse and replace source citations with buttons
  const parseSourceCitations = (text: string, messageSources: string[] = []): ParsedTextPart[] => {
    // Create a set of source filenames for quick lookup
    const sourceFilenames = new Set(
      messageSources.map(source => {
        // Extract filename from full path and remove extension
        const filename = source.split('/').pop() || source;
        return filename.replace(/\.(pdf|txt|doc|docx)$/i, '');
      })
    );

    // Regex to match citations like:
    // (filename) or (filename, Page X) or (file1, Page X; file2; file3, Page Y)
    const citationRegex = /\(([^)]+(?:;\s*[^)]+)*)\)/g;
    
    const parts: ParsedTextPart[] = [];
    let lastIndex = 0;
    let match;

    while ((match = citationRegex.exec(text)) !== null) {
      // Parse the citation content to check if it matches actual sources
      const citationContent = match[1];
      const citedSources = citationContent.split(';').map(source => {
        const trimmed = source.trim();
        // Extract filename (everything before the first comma or the whole string)
        const filename = trimmed.split(',')[0].trim();
        return filename;
      });

      // Check if any of the cited sources match actual message sources
      const validSources = citedSources.filter(source => sourceFilenames.has(source));
      
      // Only format as citation if we have valid sources
      if (validSources.length > 0) {
        // Add text before the citation
        if (match.index > lastIndex) {
          parts.push({
            type: 'text',
            content: text.slice(lastIndex, match.index)
          });
        }

        // Add the citation as a special element (only valid sources)
        parts.push({
          type: 'citation',
          content: validSources
        });

        lastIndex = match.index + match[0].length;
      }
      // If no valid sources, the citation stays as regular text and we don't advance lastIndex
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex)
      });
    }

    return parts;
  };

  // Component for rendering source citation buttons
  const SourceCitationButton = ({ filename }: { filename: string }) => (
    <button
      className="inline-flex items-center px-2 py-0.5 mx-0.5 my-0.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-xs font-normal text-gray-700 transition-colors duration-150 whitespace-nowrap"
      onClick={() => {
        // You can add click handler here if needed (e.g., to highlight the source)
        console.log('Clicked source:', filename);
      }}
      title={`Source: ${filename}`}
    >
      <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate max-w-32">{filename}</span>
    </button>
  );

  // Component for rendering text with source citations
  const TextWithCitations = ({ text, sources }: { text: string; sources?: string[] }) => {
    const parts = parseSourceCitations(text, sources);
    
    return (
      <span>
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return <span key={index}>{part.content}</span>;
          } else if (part.type === 'citation') {
            return (
              <span key={index} className="inline-flex flex-wrap items-center">
                {(part.content as string[]).map((filename, fileIndex) => (
                  <SourceCitationButton key={fileIndex} filename={filename} />
                ))}
              </span>
            );
          }
          return null;
        })}
      </span>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Function to create ReactMarkdown components with access to message sources
  const createMarkdownComponents = (sources?: string[], isUserMessage: boolean = false) => ({
    // Custom styling for markdown elements
    p: ({ children, ...props }: React.ComponentProps<'p'>) => (
      <p className="mb-2 last:mb-0" {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </p>
    ),
    h1: ({ children, ...props }: React.ComponentProps<'h1'>) => (
      <h1 className="text-lg font-bold mb-2" {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </h1>
    ),
    h2: ({ children, ...props }: React.ComponentProps<'h2'>) => (
      <h2 className="text-base font-semibold mb-2" {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </h2>
    ),
    h3: ({ children, ...props }: React.ComponentProps<'h3'>) => (
      <h3 className="text-sm font-medium mb-1" {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </h3>
    ),
    ul: ({ children, ...props }: React.ComponentProps<'ul'>) => (
      <ul className="list-disc list-outside mb-2 space-y-1 pl-5" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }: React.ComponentProps<'ol'>) => (
      <ol className="list-decimal list-outside mb-2 space-y-1 pl-5" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }: React.ComponentProps<'li'>) => (
      <li className="mb-1" {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </li>
    ),
    code: ({ children, className, ...props }: React.ComponentProps<'code'>) => {
      const isInline = !className;
      return isInline ? (
        <code className={`px-1 py-0.5 rounded text-xs font-mono ${
          isUserMessage 
            ? "bg-blue-500 text-blue-100" 
            : "bg-gray-100 text-gray-500"
        }`} style={isUserMessage ? undefined : { backgroundColor: '#f3f4f6', color: '#4b5563' }} {...props}>
          {children}
        </code>
      ) : (
        <pre className={`p-2 rounded text-xs font-mono overflow-x-auto ${
          isUserMessage 
            ? "bg-blue-500 text-blue-100" 
            : "bg-gray-100 text-gray-500"
        }`} style={isUserMessage ? undefined : { backgroundColor: '#f3f4f6', color: '#4b5563' }}>
          <code className={`${
            isUserMessage 
              ? "text-blue-100" 
              : "text-gray-500"
          }`}>{children}</code>
        </pre>
      );
    },
    blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
      <blockquote className={`border-l-2 pl-2 my-2 ${
        isUserMessage 
          ? "border-blue-300 text-blue-100" 
          : "border-gray-300 text-gray-600"
      }`} {...props}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </blockquote>
    ),
    strong: ({ children, ...props }: React.ComponentProps<'strong'>) => <strong className="font-semibold" {...props}>{children}</strong>,
    em: ({ children, ...props }: React.ComponentProps<'em'>) => <em className="italic" {...props}>{children}</em>,
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversations on component mount
  useEffect(() => {
    loadConversations();
  }, [deploymentId]);

  // WebSocket connection management
  useEffect(() => {
    if (!useWebSocket) {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      connectWebSocket();
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      disconnectWebSocket();
    };
  }, [deploymentId, useWebSocket]);

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const fetchedConversations = await DeploymentAPI.getConversations(deploymentId);
      setConversations(fetchedConversations);
    } catch (err) {
      console.error('Failed to load conversations:', err);
      setError(`Failed to load conversations: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const createNewConversation = async (title?: string) => {
    try {
      const newConversation = await DeploymentAPI.createConversation(deploymentId, title);
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newConversation.id);
      setMessages([]); // Clear current messages
      setShowSidebar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create conversation");
    }
  };

  const loadConversation = async (conversationId: number) => {
    try {
      setIsLoading(true);
      const messages: MessageResponse[] = await DeploymentAPI.getConversationMessages(deploymentId, conversationId);
      
      // Convert MessageResponse to Message format
      const convertedMessages: Message[] = messages.map(msg => ({
        id: msg.id.toString(),
        text: msg.message_text,
        isUser: msg.is_user_message,
        sources: msg.sources || undefined,
        timestamp: new Date(msg.created_at)
      }));
      
      setMessages(convertedMessages);
      setCurrentConversationId(conversationId);
      setShowSidebar(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = async (conversationId: number) => {
    try {
      await DeploymentAPI.deleteConversation(deploymentId, conversationId);
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      // If deleting current conversation, clear messages
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  };

  const formatChatHistory = (messages: Message[]) => {
    return messages
      .filter(msg => !msg.isUser || messages.indexOf(msg) < messages.length - 1)
      .map(msg => [msg.text, ""]) // Format for API
      .slice(-10); // Keep last 10 exchanges
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputMessage;
    setInputMessage("");
    setError("");

    // Use WebSocket if connected, otherwise fall back to REST API
    if (useWebSocket && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // WebSocket path
      // Reset streaming state
      currentStreamingMessageRef.current = "";
      setIsLoading(true); // Show loading indicator until first chunk arrives

      try {
        // Auto-create conversation if none exists and this is the first message
        let conversationId = currentConversationId;
        if (!conversationId && messages.length === 0) {
          try {
            const newConversation = await DeploymentAPI.createConversation(
              deploymentId, 
              `Chat ${new Date().toLocaleDateString()}`
            );
            conversationId = newConversation.id;
            setCurrentConversationId(conversationId);
            setConversations(prev => [newConversation, ...prev]);
          } catch (convErr) {
            console.error('Failed to auto-create conversation:', convErr);
          }
        }

        const history = formatChatHistory(messages);
        
        // Send message via WebSocket
        wsRef.current.send(JSON.stringify({
          type: 'chat',
          message: messageText,
          history: history,
          conversation_id: conversationId || undefined
        }));

      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsLoading(false);
      }
    } else {
      // REST API fallback path
      setIsLoading(true);
      
      try {
        // Auto-create conversation if none exists and this is the first message
        let conversationId = currentConversationId;
        if (!conversationId && messages.length === 0) {
          try {
            const newConversation = await DeploymentAPI.createConversation(
              deploymentId, 
              `Chat ${new Date().toLocaleDateString()}`
            );
            conversationId = newConversation.id;
            setCurrentConversationId(conversationId);
            setConversations(prev => [newConversation, ...prev]);
          } catch (convErr) {
            console.error('Failed to auto-create conversation:', convErr);
          }
        }

        const history = formatChatHistory(messages);
        const response = await DeploymentAPI.chatWithDeployment(
          deploymentId,
          messageText,
          history,
          conversationId || undefined
        );

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response.response,
          isUser: false,
          sources: response.sources,
          timestamp: new Date(),
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Update conversation ID if it was returned from the chat
        if (response.conversation_id && !currentConversationId) {
          setCurrentConversationId(response.conversation_id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      {showSidebar && (
        <div className="w-80 bg-white border-r shadow-sm flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
              <button
                onClick={() => setShowSidebar(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <button
              onClick={() => createNewConversation()}
              className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
            >
              New Conversation
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {isLoadingConversations ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-2">Loading conversations...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-gray-500">No conversations yet</p>
              </div>
            ) : (
              <div className="p-2">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                      currentConversationId === conversation.id
                        ? 'bg-blue-50 border border-blue-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div 
                      onClick={() => loadConversation(conversation.id)}
                      className="flex-1"
                    >
                      <h3 className="font-medium text-gray-900 text-sm truncate">
                        {conversation.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {conversation.message_count} messages • {new Date(conversation.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Delete this conversation?')) {
                          deleteConversation(conversation.id);
                        }
                      }}
                      className="mt-2 text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {onBack && (
                <button
                  onClick={onBack}
                  className="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Back</span>
                </button>
              )}

              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span>Conversations</span>
              </button>
              
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{workflowName}</h1>
                <p className="text-sm text-gray-500">
                  {currentConversationId ? `Conversation ${currentConversationId}` : 'Chat Interface'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
                            <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${
                wsConnected 
                  ? "bg-green-100 text-green-800" 
                  : "bg-gray-100 text-gray-600"
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  wsConnected ? "bg-green-500" : "bg-gray-400"
                }`}></div>
                <span>{wsConnected ? "Live" : "Chat"}</span>
              </div>
            </div>
          </div>
        </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">👋</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Welcome to {workflowName}</h3>
            <p className="text-gray-600">Start a conversation by typing a message below.</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`chat ${message.isUser ? "chat-end" : "chat-start"}`}>
            <div className="chat-header text-header">
              {message.isUser ? "You" : "Assistant"}
              <time className="text-xs text-header ml-1">
                {message.timestamp.toLocaleTimeString()}
              </time>
            </div>
            
            <div className={`chat-bubble max-w-xs lg:max-w-md ${
              message.isUser ? "chat-bubble-primary" : "bg-gray-100 text-gray-700"
            }`}>
              <div className="text-sm prose prose-sm max-w-none">
                <ReactMarkdown
                  components={createMarkdownComponents(message.sources, message.isUser)}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
            </div>

            {/* Sources for assistant messages */}
            {!message.isUser && message.sources && message.sources.length > 0 && (
              <div className="chat-footer">
                <div className="mt-1">
                  <p className="text-xs text-gray-500 mb-1">Sources:</p>
                  <div className="space-y-1">
                    {message.sources.map((source, index) => {
                      // Extract filename from path for better display
                      const filename = source.split('/').pop() || source;
                      return (
                        <div key={index} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center space-x-1">
                          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="truncate" title={source}>{filename}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

                  {isLoading && !messages.some(msg => msg.isStreaming) && (
            <div className="chat chat-start">
              <div className="chat-header text-header">
                Assistant
              </div>
            <div className="chat-bubble bg-gray-100 text-gray-700 max-w-xs lg:max-w-md">
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-6 py-2">
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={() => setError("")}
              className="ml-2 text-red-800 hover:text-red-900"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t p-6">
        <div className="flex space-x-4">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-black"
            rows={3}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition duration-200"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              "Send"
            )}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
