import React from 'react';

interface ChatHeaderProps {
  workflowName: string;
  currentConversationId: number | null;
  wsConnected: boolean;
  onBack?: () => void;
  onToggleSidebar: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  workflowName,
  currentConversationId,
  wsConnected,
  onBack,
  onToggleSidebar
}) => {
  return (
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
            onClick={onToggleSidebar}
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
  );
}; 
