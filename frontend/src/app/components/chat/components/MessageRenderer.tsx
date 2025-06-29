import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types/chat';
import { processThinkTags, parseSourceCitations } from '../utils/messageParser';

// Component for rendering thinking text
const ThinkingText = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-xs text-gray-400 italic opacity-70 bg-gray-50 px-1 py-0.5 rounded">
    {children}
  </span>
);

// Component for rendering source citation buttons
export const SourceCitationButton = ({ filename }: { filename: string }) => (
  <button
    className="inline-flex items-center px-2 py-0.5 mx-0.5 my-0.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-xs font-normal text-gray-700 transition-colors duration-150 whitespace-nowrap"
    onClick={() => {
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
                <SourceCitationButton key={`${index}-${fileIndex}`} filename={filename} />
              ))}
            </span>
          );
        } else if (part.type === 'thinking') {
          return (
            <ThinkingText key={index}>{part.content as string}</ThinkingText>
          );
        }
        return null;
      })}
    </span>
  );
};

// Create markdown components with custom styling
const createMarkdownComponents = (
  sources?: string[],
  isUserMessage: boolean = false,
  inline: boolean = false,
) => ({
  p: ({ children, ...props }: React.ComponentProps<'p'>) => {
    const Wrapper: React.ElementType = inline ? 'span' : 'p';
    const wrapperProps = inline ? props : { ...props, className: "mb-2 last:mb-0" };

    return (
      <Wrapper {...wrapperProps}>
        {React.Children.map(children, (child) => {
          if (typeof child === 'string') {
            return <TextWithCitations text={child} sources={sources} />;
          }
          return child;
        })}
      </Wrapper>
    );
  },
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

// Streaming-optimized message renderer
export const StreamingMessageRenderer = ({ message }: { message: Message }) => {
  // Process think tags first (show during streaming, remove when done)
  const processedText = processThinkTags(message.text, message.isStreaming);
  
  // Parse the text to extract thinking parts and citations
  const parts = parseSourceCitations(processedText, message.sources);
  
  // If we have thinking content or citations, render them specially
  if (parts.some(part => part.type !== 'text')) {
    return (
      <div className="text-sm prose prose-sm max-w-none">
        {parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <ReactMarkdown
                key={`text-${index}`}
                components={createMarkdownComponents(message.sources, message.isUser, true)}
              >
                {part.content as string}
              </ReactMarkdown>
            );
          } else if (part.type === 'citation') {
            return (
              <span key={`citation-${index}`} className="inline-flex flex-wrap items-center">
                {(part.content as string[]).map((filename, fileIndex) => (
                  <SourceCitationButton key={`${index}-${fileIndex}`} filename={filename} />
                ))}
              </span>
            );
          } else if (part.type === 'thinking') {
            return (
              <ThinkingText key={`thinking-${index}`}>
                {part.content as string}
              </ThinkingText>
            );
          }
          return null;
        })}
      </div>
    );
  }
  
  // Otherwise, render as normal markdown
  return (
    <div className="text-sm prose prose-sm max-w-none">
      <ReactMarkdown
        key={message.isStreaming ? `streaming-${message.text.length}` : `final-${message.id}`}
        components={createMarkdownComponents(message.sources, message.isUser)}
      >
        {processedText}
      </ReactMarkdown>
    </div>
  );
}; 
