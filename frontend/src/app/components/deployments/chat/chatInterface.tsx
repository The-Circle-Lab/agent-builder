"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatDeploymentAPI } from "../../../../lib/chatDeploymentAPI";
import { ChatInterfaceProps, Message } from "./types/chat";
import { useWebSocket } from "./hooks/useWebSocket";
import { useConversations } from "./hooks/useConversations";
import { useDeploymentFiles } from "./hooks/useDeploymentFiles";
import { formatChatHistory } from "./utils/messageParser";
import { ConversationSidebar } from "./components/conversationSidebar";
import { ChatHeader } from "./components/chatHeader";
import { ChatInput } from "./components/chatInput";
import { StreamingMessageRenderer } from "./components/messageRenderer";
import { FilesPanel } from "./components/filesPanel";

export default function ChatInterface({ deploymentId, workflowName, onBack, embedded = false }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [useWebSocketMode, setUseWebSocketMode] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use conversation management hook
  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    isLoadingConversations,
    loadConversations,
    createNewConversation,
    loadConversationMessages,
    deleteConversation,
    ensureConversation
  } = useConversations(deploymentId);

  // Use deployment files hook
  const { fileCount } = useDeploymentFiles(deploymentId);

  // WebSocket handlers
  const handleTyping = () => setIsLoading(true);
  const handleStreamStart = () => setIsLoading(false);
  
  const handleStreamChunk = (chunk: string, sources: string[]) => {
    setMessages(prev => {
      const hasStreamingMessage = prev.some(msg => !msg.isUser && msg.isStreaming);
      
      if (hasStreamingMessage) {
        return prev.map(msg => {
          if (!msg.isUser && msg.isStreaming) {
            return { 
              ...msg, 
              text: chunk,
              sources: sources,
              timestamp: new Date()
            };
          }
          return msg;
        });
      } else {
        const streamingMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: chunk,
          isUser: false,
          timestamp: new Date(),
          isStreaming: true,
          sources: sources
        };
        return [...prev, streamingMessage];
      }
    });
  };

  const handleResponse = (response: string, sources?: string[]) => {
    setIsLoading(false);
    setMessages(prev => {
      const hasStreamingMessage = prev.some(msg => !msg.isUser && msg.isStreaming);
      
      if (hasStreamingMessage) {
        return prev.map(msg => {
          if (!msg.isUser && msg.isStreaming) {
            return { 
              ...msg, 
              text: response,
              sources: sources,
              isStreaming: false 
            };
          }
          return msg;
        });
      } else {
        const responseMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: response,
          isUser: false,
          timestamp: new Date(),
          sources: sources,
          isStreaming: false,
        };
        return [...prev, responseMessage];
      }
    });
  };

  const handleWebSocketError = (error: string) => {
    if (error.includes('session') || error.includes('authenticated') || error.includes('cookie')) {
      setUseWebSocketMode(false);
    } else {
      setError(error);
    }
    setIsLoading(false);
  };

  // Use WebSocket hook
  const { connected: wsConnected, sendMessage: sendWebSocketMessage } = useWebSocket({
    deploymentId,
    enabled: useWebSocketMode,
    onTyping: handleTyping,
    onStreamStart: handleStreamStart,
    onStreamChunk: handleStreamChunk,
    onResponse: handleResponse,
    onError: handleWebSocketError
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleCreateNewConversation = async () => {
    try {
      await createNewConversation();
      setMessages([]);
      setShowSidebar(false);
    } catch {
      // Error is handled in the hook
    }
  };

  const handleLoadConversation = async (conversationId: number) => {
    try {
      setIsLoading(true);
      const loadedMessages = await loadConversationMessages(conversationId);
      setMessages(loadedMessages);
      setShowSidebar(false);
    } catch {
      // Error is handled in the hook
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (messageText: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setError("");

    // Use WebSocket if connected, otherwise fall back to REST API
    if (useWebSocketMode && wsConnected) {
      setIsLoading(true);
      
      try {
        const conversationId = await ensureConversation(messages);
        const history = formatChatHistory(messages);
        sendWebSocketMessage(messageText, history, conversationId || undefined);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        setIsLoading(false);
      }
    } else {
      // REST API fallback
      setIsLoading(true);
      
      try {
        const conversationId = await ensureConversation(messages);
        const history = formatChatHistory(messages);
        const response = await ChatDeploymentAPI.chatWithDeployment(
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

  return (
    <div className={`flex bg-gray-50 ${embedded ? 'h-full' : 'h-screen'}`}>
      {/* Sidebar */}
      {showSidebar && (
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          isLoading={isLoadingConversations}
          onClose={() => setShowSidebar(false)}
          onNewConversation={handleCreateNewConversation}
          onSelectConversation={handleLoadConversation}
          onDeleteConversation={deleteConversation}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <ChatHeader
          workflowName={workflowName}
          currentConversationId={currentConversationId}
          wsConnected={wsConnected}
          fileCount={fileCount}
          onBack={onBack}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onToggleFiles={() => setShowFilesPanel(!showFilesPanel)}
          embedded={embedded}
        />

        {/* Messages */}
        <div className={`flex-1 overflow-y-auto space-y-4 ${embedded ? 'p-3' : 'p-6'}`}>
          {messages.length === 0 && (
            <div className={`text-center ${embedded ? 'py-6' : 'py-12'}`}>
              <div className="text-gray-400 text-lg mb-2">👋</div>
              <h3 className={`font-medium text-gray-900 mb-2 ${embedded ? 'text-sm' : 'text-lg'}`}>Welcome to {workflowName}</h3>
              <p className={`text-gray-600 ${embedded ? 'text-xs' : 'text-base'}`}>Start a conversation by typing a message below.</p>
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
              
              <div className={`chat-bubble ${embedded ? 'max-w-xs text-sm' : 'max-w-xs lg:max-w-md'} ${
                message.isUser ? "chat-bubble-primary" : "bg-gray-100 chat-bubble-assistant"
              }`}>
                <StreamingMessageRenderer message={message} />
              </div>

              {/* Sources for assistant messages */}
              {!message.isUser && message.sources && message.sources.length > 0 && (
                <div className="chat-footer">
                  <div className="mt-1">
                    <p className="text-xs text-gray-500 mb-1">Sources:</p>
                    <div className="space-y-1">
                      {message.sources.map((source, index) => {
                        const filename = source.split('/').pop() || source;
                        return (
                          <div key={index} className={`text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center space-x-1 ${embedded ? 'text-xs' : 'text-xs'}`}>
                            <svg className={`flex-shrink-0 ${embedded ? 'w-2.5 h-2.5' : 'w-3 h-3'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <div className={`chat-bubble bg-gray-100 chat-bubble-assistant ${embedded ? 'max-w-xs text-sm' : 'max-w-xs lg:max-w-md'}`}>
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <ChatInput
          isLoading={isLoading}
          error={error}
          onSendMessage={handleSendMessage}
          onClearError={() => setError("")}
        />
      </div>

      {/* Files Panel */}
      {!embedded && (
        <FilesPanel
          deploymentId={deploymentId}
          isOpen={showFilesPanel}
          onClose={() => setShowFilesPanel(false)}
        />
      )}
    </div>
  );
} 
