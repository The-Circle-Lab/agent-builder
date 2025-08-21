import React, { useState } from 'react';
import { 
  PaperAirplaneIcon,
  ChatBubbleLeftIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { LivePresentationPrompt, GroupSummaryMessage } from '../types/livePresentation';

interface PromptDisplayProps {
  prompt: LivePresentationPrompt;
  onResponse: (promptId: string, response: string) => void;
  disabled?: boolean;
  groupSummary?: GroupSummaryMessage | null;
  waitingForSummary?: boolean;
  summaryGenerating?: boolean;
}

const isValidPrompt = (prompt: LivePresentationPrompt): prompt is LivePresentationPrompt => {
  return prompt && typeof prompt === 'object' && 'id' in prompt && 'statement' in prompt;
};

export const PromptDisplay: React.FC<PromptDisplayProps> = ({
  prompt,
  onResponse,
  disabled = false,
  groupSummary = null,
  waitingForSummary = false,
  summaryGenerating = false
}) => {
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Type guard to ensure prompt is treated as LivePresentationPrompt
  if (!isValidPrompt(prompt)) {
    return <div>Invalid prompt data</div>;
  }
  
  const typedPrompt = prompt;

  const handleSubmit = () => {
    if (response.trim() && !submitted) {
      onResponse(typedPrompt.id, response.trim());
      setSubmitted(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && typedPrompt.inputType === 'text') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Prompt header */}
      <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ChatBubbleLeftIcon className="h-6 w-6 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-indigo-900">Live Prompt</h3>
              <p className="text-sm text-indigo-700">Please respond to the following</p>
            </div>
          </div>
          {/* Late join notification */}
          {typedPrompt.is_late_join ? (
            <div className="flex items-center space-x-2">
              <div className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                Previous Message
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prompt content */}
      <div className="p-6">
        {/* Late join notification */}
        {typedPrompt.is_late_join ? (
          <div className="mb-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center">
                <ExclamationCircleIcon className="h-5 w-5 text-orange-600 mr-2" />
                <p className="text-sm text-orange-800">
                  <strong>Note:</strong> This message was sent before you joined the session. You can still respond if input is required.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        
        {/* System prompt badge - temporarily commented out due to type issues */}
        {/* {showSystemBadge ? (
          <div className="mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              System Prompt
            </span>
          </div>
        ) : null} */}
        
        <div className="mb-6">
          <p className="text-lg text-gray-900 leading-relaxed whitespace-pre-wrap">
            {typedPrompt.statement}
          </p>
        </div>

        {/* Display assigned list item if present */}
        {typedPrompt.assigned_list_item ? (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <ExclamationCircleIcon className="h-5 w-5 text-amber-600 mt-0.5" />
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-amber-800 mb-2">
                    Your Group&apos;s Assignment:
                  </h4>
                  <div className="text-2xl font-bold text-amber-900 mb-2">
                    {typeof typedPrompt.assigned_list_item === 'string' 
                      ? typedPrompt.assigned_list_item 
                      : (typedPrompt.assigned_list_item as { title?: string })?.title || 'Theme Assignment'
                    }
                  </div>
                  {/* Show description if it's a theme object */}
                  {typeof typedPrompt.assigned_list_item === 'object' && (typedPrompt.assigned_list_item as { description?: string })?.description ? (
                    <div className="text-sm text-amber-700 mt-2">
                      {(typedPrompt.assigned_list_item as { description?: string }).description}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Input section or Summary */}
        {typedPrompt.hasInput && typedPrompt.inputType !== 'none' ? (
          <div className="space-y-4">
            {/* Show summary if available and for current prompt */}
            {groupSummary && groupSummary.prompt_id === typedPrompt.id ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {groupSummary.group_name} Summary:
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {groupSummary.summary.text}
                  </div>
                  <div className="flex items-center justify-between text-xs text-blue-600 pt-3 border-t border-blue-200 mt-3">
                    <span>
                      Based on {groupSummary.summary.response_count} responses
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      AI-Generated Summary
                    </span>
                  </div>
                </div>
              </div>
            ) : summaryGenerating ? (
              /* Show AI generation state when summary is being generated */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Response:
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-blue-700 font-medium">AI is generating your group summary...</span>
                  </div>
                </div>
              </div>
            ) : waitingForSummary ? (
              /* Show waiting state when waiting for other group members */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Response:
                </label>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="animate-pulse rounded-full h-5 w-5 bg-amber-400"></div>
                    <span className="text-amber-700">Waiting for other group members to respond...</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Show normal input form */
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Response:
                  </label>
                  
                  {typedPrompt.inputType === 'textarea' ? (
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder={typedPrompt.inputPlaceholder || 'Enter your response here...'}
                      disabled={disabled || submitted}
                      rows={6}
                      className={`w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                        disabled || submitted ? 'bg-gray-50 text-black' : ''
                      }`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={typedPrompt.inputPlaceholder || 'Enter your response here...'}
                      disabled={disabled || submitted}
                      className={`text-black w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                        disabled || submitted ? 'bg-gray-50 text-black' : ''
                      }`}
                    />
                  )}
                </div>

                {/* Submit button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    {submitted ? (
                      <>
                        <ExclamationCircleIcon className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Response submitted</span>
                      </>
                    ) : (
                      <span>
                        {typedPrompt.inputType === 'text' ? 'Press Enter or click Submit' : 'Click Submit when ready'}
                      </span>
                    )}
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={disabled || submitted || !response.trim()}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                      disabled || submitted || !response.trim()
                        ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                        : 'text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                    }`}
                  >
                    <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                    {submitted ? 'Submitted' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* No input required */}
        {!typedPrompt.hasInput ? (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center">
              <ExclamationCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
              <p className="text-sm text-blue-800">
                No response required. Please read and understand the content above.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
