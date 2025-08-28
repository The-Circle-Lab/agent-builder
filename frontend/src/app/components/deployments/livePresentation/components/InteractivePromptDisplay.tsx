import React, { useState } from 'react';
import { 
  PaperAirplaneIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  TvIcon
} from '@heroicons/react/24/outline';
import { LivePresentationPrompt, GroupSummaryMessage } from '../types/livePresentation';

interface InteractivePromptDisplayProps {
  prompt: LivePresentationPrompt;
  onResponse: (promptId: string, response: string) => void;
  disabled?: boolean;
  groupSummary?: GroupSummaryMessage | null;
  waitingForSummary?: boolean;
  summaryGenerating?: boolean;
  /** When true, suppress showing the assigned topic block (used in roomcast mode where it's displayed elsewhere) */
  hideAssignedTopic?: boolean;
  /** When true, hide summary lifecycle UI (handled on roomcast display) and adjust submitted message */
  roomcastMode?: boolean;
}

const isValidPrompt = (prompt: LivePresentationPrompt): prompt is LivePresentationPrompt => {
  return prompt && typeof prompt === 'object' && 'id' in prompt && 'statement' in prompt;
};

export const InteractivePromptDisplay: React.FC<InteractivePromptDisplayProps> = ({
  prompt,
  onResponse,
  disabled = false,
  groupSummary = null,
  waitingForSummary = false,
  summaryGenerating = false,
  hideAssignedTopic = false,
  roomcastMode = false
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
      {/* Roomcast notice */}
      <div className="bg-indigo-50 px-6 py-3 border-b border-indigo-100">
        <div className="flex items-center space-x-3">
          <TvIcon className="h-5 w-5 text-indigo-600" />
          <div className="text-sm">
            <span className="text-indigo-900 font-medium">Roomcast Mode:</span>
            <span className="text-indigo-700 ml-1">Check your group&apos;s display for full instructions</span>
          </div>
        </div>
      </div>

  {/* Interactive content only */}
  <div className="p-6">
        {typedPrompt.assigned_list_item && !hideAssignedTopic ? (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <ExclamationCircleIcon className="h-5 w-5 text-amber-600 mt-0.5" />
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-amber-800 mb-2">
                    Your Group&apos;s Topic:
                  </h4>
                  <div className="text-xl font-bold text-amber-900">
                    {typeof typedPrompt.assigned_list_item === 'string' 
                      ? typedPrompt.assigned_list_item 
                      : (typedPrompt.assigned_list_item as { title?: string })?.title || 'Topic Assignment'
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Input section or Summary */}
        {typedPrompt.hasInput && typedPrompt.inputType !== 'none' ? (
          <div className="space-y-4">
            {/* Show summary if available and for current prompt */}
            {!roomcastMode && groupSummary && groupSummary.prompt_id === typedPrompt.id ? (
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
                      <CheckCircleIcon className="w-3 h-3" />
                      AI-Generated Summary
                    </span>
                  </div>
                </div>
              </div>
            ) : (!roomcastMode && summaryGenerating) ? (
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
            ) : (!roomcastMode && waitingForSummary) ? (
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
              /* Show normal input form - INTERACTIVE ONLY */
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6">
                <div className="text-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Provide Your Response</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Enter your response below. Check the display for full prompt details.
                  </p>
                </div>
                
                <div className="space-y-4">
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
                        className={`w-full px-4 py-3 border text-black border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg ${
                          disabled || submitted ? 'bg-gray-50 text-black' : 'bg-white'
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
                        className={`text-black w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg ${
                          disabled || submitted ? 'bg-gray-50 text-black' : 'bg-white'
                        }`}
                      />
                    )}
                  </div>

                  {/* Submit button - prominent */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      {submitted ? (
                        roomcastMode ? (
                          <>
                            <CheckCircleIcon className="h-5 w-5 text-green-600" />
                            <span className="text-green-600 font-medium">Response submitted – look at screen</span>
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="h-5 w-5 text-green-600" />
                            <span className="text-green-600 font-medium">Response submitted successfully</span>
                          </>
                        )
                      ) : (
                        <span>
                          {typedPrompt.inputType === 'text' ? 'Press Enter or click Submit' : 'Click Submit when ready'}
                        </span>
                      )}
                    </div>
                    
                    <button
                      onClick={handleSubmit}
                      disabled={disabled || submitted || !response.trim()}
                      className={`inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-lg ${
                        disabled || submitted || !response.trim()
                          ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                          : 'text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md'
                      }`}
                    >
                      <PaperAirplaneIcon className="h-5 w-5 mr-2" />
                      {submitted ? 'Submitted' : 'Submit Response'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* No input required - show acknowledgment only */
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <CheckCircleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Information Displayed</h3>
            <p className="text-gray-600">
              Check your group&apos;s display for the full message content.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              No response required for this prompt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
