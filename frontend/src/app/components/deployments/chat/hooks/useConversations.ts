import { useState, useCallback } from 'react';
import { ChatDeploymentAPI, ConversationResponse, MessageResponse } from '../../../../../lib/deploymentAPIs/chatDeploymentAPI';
import { Message } from '../types/chat';

export const useConversations = (deploymentId: string) => {
  const [conversations, setConversations] = useState<ConversationResponse[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [conversationsError, setConversationsError] = useState<string>("");

  const loadConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true);
      setConversationsError("");
      const fetchedConversations = await ChatDeploymentAPI.getConversations(deploymentId);
      setConversations(fetchedConversations);
    } catch (err) {
      setConversationsError(`Failed to load conversations: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [deploymentId]);

  const createNewConversation = useCallback(async (title?: string) => {
    try {
      const newConversation = await ChatDeploymentAPI.createConversation(deploymentId, title);
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(newConversation.id);
      return newConversation;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to create conversation";
      setConversationsError(error);
      throw new Error(error);
    }
  }, [deploymentId]);

  const loadConversationMessages = useCallback(async (conversationId: number): Promise<Message[]> => {
    try {
      const messages: MessageResponse[] = await ChatDeploymentAPI.getConversationMessages(deploymentId, conversationId);
      
      // Convert MessageResponse to Message format
      const convertedMessages: Message[] = messages.map(msg => ({
        id: msg.id.toString(),
        text: msg.message_text,
        isUser: msg.is_user_message,
        sources: msg.sources || undefined,
        timestamp: new Date(msg.created_at)
      }));
      
      setCurrentConversationId(conversationId);
      return convertedMessages;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to load conversation";
      setConversationsError(error);
      throw new Error(error);
    }
  }, [deploymentId]);

  const deleteConversation = useCallback(async (conversationId: number) => {
    try {
      await ChatDeploymentAPI.deleteConversation(deploymentId, conversationId);
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      
      // If deleting current conversation, clear it
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Failed to delete conversation";
      setConversationsError(error);
      throw new Error(error);
    }
  }, [deploymentId, currentConversationId]);

  const ensureConversation = useCallback(async (messages: Message[]): Promise<number | null> => {
    if (!currentConversationId && messages.length === 0) {
      try {
        const newConversation = await createNewConversation(`Chat ${new Date().toLocaleDateString()}`);
        return newConversation.id;
      } catch {
        return null;
      }
    }
    return currentConversationId;
  }, [currentConversationId, createNewConversation]);

  return {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    isLoadingConversations,
    conversationsError,
    loadConversations,
    createNewConversation,
    loadConversationMessages,
    deleteConversation,
    ensureConversation
  };
}; 
