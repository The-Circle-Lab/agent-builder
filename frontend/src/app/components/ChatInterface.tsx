"use client";

import React, { useState, useRef, useEffect } from "react";
import { DeploymentAPI, ChatResponse } from "./agentBuilder/scripts/deploymentAPI";
import ReactMarkdown from "react-markdown";

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
}

interface ParsedTextPart {
  type: 'text' | 'citation';
  content: string | string[];
}

export default function ChatInterface({ deploymentId, workflowName, onBack }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
            : "bg-gray-100 text-gray-800"
        }`} {...props}>
          {children}
        </code>
      ) : (
        <pre className={`p-2 rounded text-xs font-mono overflow-x-auto ${
          isUserMessage 
            ? "bg-blue-500 text-blue-100" 
            : "bg-gray-100 text-gray-800"
        }`}>
          <code>{children}</code>
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
    setInputMessage("");
    setIsLoading(true);
    setError("");

    try {
      const history = formatChatHistory(messages);
      const response: ChatResponse = await DeploymentAPI.chatWithDeployment(
        deploymentId,
        inputMessage,
        history
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.response,
        isUser: false,
        sources: response.sources,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
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
            
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{workflowName}</h1>
              <p className="text-sm text-gray-500">Chat Interface</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
              Active
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
          <div
            key={message.id}
            className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.isUser
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-900 shadow-sm border"
              }`}
            >
              <div className="text-sm prose prose-sm max-w-none">
                <ReactMarkdown
                  components={createMarkdownComponents(message.sources, message.isUser)}
                >
                  {message.text}
                </ReactMarkdown>
              </div>
              
              {/* Sources for assistant messages */}
              {!message.isUser && message.sources && message.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
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
              )}
              
              <p className="text-xs mt-1 opacity-70">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-900 shadow-sm border max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
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
  );
} 
