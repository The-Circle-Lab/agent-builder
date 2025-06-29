import React, { useState } from 'react';

interface ChatInputProps {
  isLoading: boolean;
  error: string;
  onSendMessage: (message: string) => void;
  onClearError: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  isLoading,
  error,
  onSendMessage,
  onClearError
}) => {
  const [inputMessage, setInputMessage] = useState("");

  const handleSendMessage = () => {
    if (!inputMessage.trim() || isLoading) return;
    onSendMessage(inputMessage);
    setInputMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <>
      {/* Error Display */}
      {error && (
        <div className="px-6 py-2">
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              onClick={onClearError}
              className="ml-2 text-red-800 hover:text-red-900"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
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
    </>
  );
}; 
