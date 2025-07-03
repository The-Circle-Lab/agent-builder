"use client";

import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, ChatBubbleLeftRightIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Conversation, ChatMessage } from '@/lib/types';
import { ClassAPI } from './classAPI';

interface StudentConversationsModalProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function StudentConversationsModal({ 
  deploymentId, 
  deploymentName, 
  onClose 
}: StudentConversationsModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConversations();
  }, [deploymentId]);

  const loadConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const allConversations = await ClassAPI.getAllConversations(deploymentId);
      setConversations(allConversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversation: Conversation) => {
    try {
      setMessagesLoading(true);
      setSelectedConversation(conversation);
      const conversationMessages = await ClassAPI.getConversationMessages(
        deploymentId, 
        conversation.id
      );
      setMessages(conversationMessages);
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-4xl w-full h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">
              Student Conversations - {deploymentName}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Conversations List */}
            <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  All Conversations ({conversations.length})
                </h3>
                
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="text-center py-8">
                    <ChatBubbleLeftRightIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No conversations yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => loadMessages(conv)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                          selectedConversation?.id === conv.id ? 'bg-white shadow-sm' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {conv.title}
                            </p>
                            <p className="text-xs text-gray-500">
                              {conv.message_count} messages
                            </p>
                            <p className="text-xs text-gray-400">
                              {new Date(conv.updated_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 flex flex-col">
              {!selectedConversation ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      Select a conversation to view messages
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-900">
                      {selectedConversation.title}
                    </h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4">
                    {messagesLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map(msg => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.is_user_message ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-md ${
                              msg.is_user_message 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-900'
                            } rounded-lg px-4 py-2`}>
                              <p className="text-sm">{msg.message_text}</p>
                              <p className={`text-xs mt-1 ${
                                msg.is_user_message ? 'text-blue-100' : 'text-gray-500'
                              }`}>
                                {new Date(msg.created_at).toLocaleTimeString()}
                              </p>
                              
                              {!msg.is_user_message && msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <p className="text-xs text-gray-600 mb-1">Sources:</p>
                                  <div className="space-y-1">
                                    {msg.sources.map((source, idx) => (
                                      <div key={idx} className="text-xs text-gray-500">
                                        {source.split('/').pop()}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
