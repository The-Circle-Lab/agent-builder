import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Message } from '../types/chat';
import { processThinkTags, parseSourceCitations } from '../utils/messageParser';
import SourceCitation from './sourceCitation';

// Component for rendering thinking text
const ThinkingText = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-block text-xs text-gray-400 italic opacity-70 bg-gray-50 px-1 py-0.5 rounded">
    {children}
  </span>
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
              {(part.content as string[]).map((filename, fileIndex) => {
                const citation = new SourceCitation(filename);
                return <span key={`${index}-${fileIndex}`}>{citation.render()}</span>;
              })}
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
          : "bg-gray-100 text-black"
      }`} style={isUserMessage ? undefined : { backgroundColor: '#f3f4f6', color: '#000000' }} {...props}>
        {children}
      </code>
    ) : (
      <pre className={`p-2 rounded text-xs font-mono overflow-x-auto ${
        isUserMessage 
          ? "bg-blue-500 text-blue-100" 
          : "bg-gray-100 text-black"
      }`} style={isUserMessage ? undefined : { backgroundColor: '#f3f4f6', color: '#000000' }}>
        <code className={`${
          isUserMessage 
            ? "text-blue-100" 
            : "text-black"
        }`}>{children}</code>
      </pre>
    );
  },
  blockquote: ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
    <blockquote className={`border-l-2 pl-2 my-2 ${
      isUserMessage 
        ? "border-blue-300 text-blue-100" 
        : "border-gray-300 text-black"
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
  em: ({ children, ...props }: React.ComponentProps<'em'>) => (
    <em className="italic" {...props}>
      {React.Children.map(children, (child) => {
        if (typeof child === 'string') {
          return <TextWithCitations text={child} sources={sources} />;
        }
        return child;
      })}
    </em>
  ),
});

// Streaming-optimized message renderer (refactored)
export const StreamingMessageRenderer = ({ message }: { message: Message }) => {
  // 1️⃣  Handle <think> tags so that they are either hidden (when done) or shown in a special style (while streaming).
  const processedText = processThinkTags(message.text, message.isStreaming);

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
