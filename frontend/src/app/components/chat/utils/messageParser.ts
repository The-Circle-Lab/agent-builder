import { ParsedTextPart } from '../types/chat';

/**
 * Process think tags in text
 * During streaming: marks thinking content for special rendering
 * After streaming: removes thinking content completely
 */
export const processThinkTags = (text: string, isStreaming: boolean = false): string => {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  
  if (isStreaming) {
    // Check if message starts with <think> but has no closing tag
    if (text.startsWith('<think>') && !text.includes('</think>')) {
      // Treat everything after <think> as thinking content
      const thinkContent = text.substring(7); // Remove '<think>' (7 characters)
      return `__THINK_START__${thinkContent}__THINK_END__`;
    }
    
    // During streaming, keep think tags but mark them for special rendering
    return text.replace(thinkRegex, (match, thinkContent) => {
      return `__THINK_START__${thinkContent.trim()}__THINK_END__`;
    });
  } else {
    // When streaming is done, remove think tags completely
    // Also handle unclosed think tags at the start
    if (text.startsWith('<think>')) {
      const closingIndex = text.indexOf('</think>');
      if (closingIndex === -1) {
        // No closing tag, remove the entire message since it's all thinking
        return '';
      }
    }
    return text.replace(thinkRegex, '');
  }
};

/**
 * Parse text and extract source citations and thinking content
 */
export const parseSourceCitations = (text: string, messageSources: string[] = []): ParsedTextPart[] => {
  // Create a set of source filenames for quick lookup
  const sourceFilenames = new Set(
    messageSources.map(source => {
      // Extract filename from full path and remove extension
      const filename = source.split('/').pop() || source;
      return filename.replace(/\.(pdf|txt|doc|docx)$/i, '');
    })
  );

  // First handle thinking content markers
  const thinkingRegex = /__THINK_START__([\s\S]*?)__THINK_END__/g;
  // Then handle citations
  const citationRegex = /\(([^)]+(?:;\s*[^)]+)*)\)/g;
  
  const parts: ParsedTextPart[] = [];
  let lastIndex = 0;
  let match;

  // Process both thinking content and citations
  const allMatches: Array<{match: RegExpExecArray, type: 'thinking' | 'citation'}> = [];
  
  // Find all thinking matches
  while ((match = thinkingRegex.exec(text)) !== null) {
    allMatches.push({match, type: 'thinking'});
  }
  
  // Find all citation matches
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
    
    // Only add citation if we have valid sources
    if (validSources.length > 0) {
      allMatches.push({match, type: 'citation'});
    }
  }

  // Sort matches by index
  allMatches.sort((a, b) => a.match.index - b.match.index);

  // Process matches in order
  for (const {match, type} of allMatches) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    if (type === 'thinking') {
      // Add thinking content
      parts.push({
        type: 'thinking',
        content: match[1].trim()
      });
    } else if (type === 'citation') {
      // Add citation
      const citationContent = match[1];
      const citedSources = citationContent.split(';').map(source => {
        const trimmed = source.trim();
        const filename = trimmed.split(',')[0].trim();
        return filename;
      });
      const validSources = citedSources.filter(source => sourceFilenames.has(source));
      
      parts.push({
        type: 'citation',
        content: validSources
      });
    }

    lastIndex = match.index + match[0].length;
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

/**
 * Format chat history for API requests
 */
export const formatChatHistory = (messages: Array<{text: string; isUser: boolean}>): string[][] => {
  return messages
    .filter(msg => !msg.isUser || messages.indexOf(msg) < messages.length - 1)
    .map(msg => [msg.text, ""]) // Format for API
    .slice(-10); // Keep last 10 exchanges
}; 
