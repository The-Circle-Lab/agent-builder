import React from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowRightIcon, ArrowLeftIcon, LinkIcon, PencilIcon } from '@heroicons/react/24/outline';
import { PromptSession, PromptSubmissionResponse } from '@/lib/deploymentAPIs/promptDeploymentAPI';

interface SubmissionDisplayProps {
  session: PromptSession;
  submissionIndex: number;
  submissionResponse: string;
  submittedResponse: PromptSubmissionResponse | undefined;
  submitting: boolean;
  error: string | null;
  onResponseChange: (submissionIndex: number, value: string) => void;
  onSubmitResponse: () => void;
  onNavigateToSubmission: (index: number) => void;
}

export default function SubmissionDisplay({
  session,
  submissionIndex,
  submissionResponse,
  submittedResponse,
  submitting,
  error,
  onResponseChange,
  onSubmitResponse,
  onNavigateToSubmission
}: SubmissionDisplayProps) {
  const currentRequirement = session.submission_requirements[submissionIndex];
  const isSubmitted = !!submittedResponse;
  const isLinkType = currentRequirement.mediaType === 'hyperlink';

  const handleInputChange = (value: string) => {
    onResponseChange(submissionIndex, value);
  };

  const navigateToNext = () => {
    if (submissionIndex < session.total_submissions - 1) {
      onNavigateToSubmission(submissionIndex + 1);
    }
  };

  const navigateToPrevious = () => {
    if (submissionIndex > 0) {
      onNavigateToSubmission(submissionIndex - 1);
    }
  };

  const canNavigateNext = submissionIndex < session.total_submissions - 1;
  const canNavigatePrevious = submissionIndex > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      {/* Requirement Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-medium text-gray-900">
              Requirement {submissionIndex + 1} of {session.total_submissions}
            </h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              isLinkType 
                ? 'bg-purple-100 text-purple-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {isLinkType ? (
                <>
                  <LinkIcon className="w-3 h-3 mr-1" />
                  Link Required
                </>
              ) : (
                <>
                  <PencilIcon className="w-3 h-3 mr-1" />
                  Text Response
                </>
              )}
            </span>
          </div>

          {isSubmitted && (
            <div className="flex items-center text-green-600">
              <CheckCircleIcon className="h-5 w-5 mr-1" />
              <span className="text-sm font-medium">Submitted</span>
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-50 rounded-lg border">
          <p className="text-gray-800">{currentRequirement.prompt}</p>
        </div>
      </div>

      {/* Show submitted response if already submitted */}
      {isSubmitted ? (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-start space-x-3">
            <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-green-900 mb-2">Your Submitted Response:</h3>
              {isLinkType ? (
                <a
                  href={submittedResponse.user_response}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                  {submittedResponse.user_response}
                </a>
              ) : (
                <p className="text-gray-800 whitespace-pre-wrap">
                  {submittedResponse.user_response}
                </p>
              )}
              <p className="text-xs text-green-600 mt-2">
                Submitted on {new Date(submittedResponse.submitted_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* Input Form */
        <div className="mb-6">
          <label htmlFor={`response-${submissionIndex}`} className="block text-sm font-medium text-gray-700 mb-2">
            Your Response {isLinkType && <span className="text-red-500">*</span>}
          </label>
          
          {isLinkType ? (
            <input
              id={`response-${submissionIndex}`}
              type="url"
              value={submissionResponse}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={submitting}
            />
          ) : (
            <textarea
              id={`response-${submissionIndex}`}
              value={submissionResponse}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Enter your response here..."
              rows={6}
              className="w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-vertical"
              disabled={submitting}
            />
          )}

          {isLinkType && (
            <p className="mt-1 text-xs text-gray-500">
              Please provide a valid URL starting with http:// or https://
            </p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-start space-x-3">
            <XCircleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={navigateToPrevious}
          disabled={!canNavigatePrevious}
          className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
            canNavigatePrevious
              ? 'text-gray-700 bg-white hover:bg-gray-50'
              : 'text-gray-400 bg-gray-100 cursor-not-allowed'
          }`}
        >
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Previous
        </button>

        <div className="flex items-center space-x-3">
          {!isSubmitted && (
            <button
              onClick={onSubmitResponse}
              disabled={submitting || !submissionResponse.trim()}
              className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                submitting || !submissionResponse.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {submitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                'Submit Response'
              )}
            </button>
          )}

          <button
            onClick={navigateToNext}
            disabled={!canNavigateNext}
            className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md ${
              canNavigateNext
                ? 'text-gray-700 bg-white hover:bg-gray-50'
                : 'text-gray-400 bg-gray-100 cursor-not-allowed'
            }`}
          >
            Next
            <ArrowRightIcon className="h-4 w-4 ml-2" />
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-center space-x-2">
          {Array.from({ length: session.total_submissions }, (_, i) => (
            <button
              key={i}
              onClick={() => onNavigateToSubmission(i)}
              className={`w-3 h-3 rounded-full transition-all duration-200 ${
                i === submissionIndex
                  ? 'bg-blue-600 ring-2 ring-blue-200'
                  : session.submitted_responses?.some(r => r.submission_index === i)
                    ? 'bg-green-600'
                    : 'bg-gray-300 hover:bg-gray-400'
              }`}
              title={`Go to requirement ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
} 
