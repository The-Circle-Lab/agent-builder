import React from 'react';
import { ConversationResponse } from '../../agentBuilder/scripts/deploymentAPI';

interface ConversationSidebarProps {
  conversations: ConversationResponse[];
  currentConversationId: number | null;
  isLoading: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (conversationId: number) => void;
  onDeleteConversation: (conversationId: number) => void;
}

export const ConversationSidebar: React.FC<ConversationSidebarProps> = ({
  conversations,
  currentConversationId,
  isLoading,
  onClose,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation
}) => {
  return (
    <div className="w-80 bg-white border-r shadow-sm flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={onNewConversation}
          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
        >
          New Conversation
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
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
                  onClick={() => onSelectConversation(conversation.id)}
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
                      onDeleteConversation(conversation.id);
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
  );
}; 
