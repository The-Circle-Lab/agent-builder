import React from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowRightIcon, ArrowLeftIcon, LinkIcon, PencilIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { PromptSession, PromptSubmissionResponse } from '@/lib/deploymentAPIs/promptDeploymentAPI';
import { API_CONFIG } from '@/lib/constants';

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
  selectedPdfFile?: File | null;
  onPdfSelect?: (file: File | null) => void;
  pdfProgress?: { progress: number; stage?: string; state?: string };
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
  onNavigateToSubmission,
  selectedPdfFile,
  onPdfSelect,
  pdfProgress,
}: SubmissionDisplayProps) {
  const currentRequirement = session.submission_requirements[submissionIndex];
  const isSubmitted = !!submittedResponse;
  const isLinkType = currentRequirement.mediaType === 'hyperlink';
  const isPdfType = currentRequirement.mediaType === 'pdf';
  const isListType = currentRequirement.mediaType === 'list';

  const handleInputChange = (value: string) => {
    onResponseChange(submissionIndex, value);
  };

  // Helper functions for list handling
  const getListItems = (): string[] => {
    if (!isListType) return [];
    try {
      return submissionResponse ? JSON.parse(submissionResponse) : [];
    } catch {
      // If not valid JSON, try splitting by newlines
      return submissionResponse ? submissionResponse.split('\n').filter(item => item.trim()) : [];
    }
  };

  const handleListItemChange = (itemIndex: number, value: string) => {
    if (!isListType) return;
    
    const items = getListItems();
    const requiredItems = currentRequirement.items || 1;
    
    // Ensure array has enough slots
    while (items.length < requiredItems) {
      items.push('');
    }
    
    items[itemIndex] = value;
    onResponseChange(submissionIndex, JSON.stringify(items));
  };

  const getListItem = (itemIndex: number): string => {
    const items = getListItems();
    return items[itemIndex] || '';
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
              isPdfType
                ? 'bg-red-100 text-red-800'
                : isLinkType 
                  ? 'bg-purple-100 text-purple-800' 
                  : isListType
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-blue-100 text-blue-800'
            }`}>
              {isPdfType ? (
                <>
                  <PaperClipIcon className="w-3 h-3 mr-1" />
                  PDF Upload
                </>
              ) : isLinkType ? (
                <>
                  <LinkIcon className="w-3 h-3 mr-1" />
                  Link Required
                </>
              ) : isListType ? (
                <>
                  <PencilIcon className="w-3 h-3 mr-1" />
                  List ({currentRequirement.items} items)
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
              {isPdfType ? (
                (() => {
                  const docId = submittedResponse.user_response;
                  const viewUrl = `${API_CONFIG.BASE_URL}/api/files/view/${docId}`;
                  return (
                    <a
                      href={viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline break-all"
                    >
                      View PDF (Document #{docId})
                    </a>
                  );
                })()
              ) : isLinkType ? (
                <a
                  href={submittedResponse.user_response}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline break-all"
                >
                  {submittedResponse.user_response}
                </a>
              ) : isListType ? (
                (() => {
                  try {
                    const items = JSON.parse(submittedResponse.user_response);
                    return (
                      <div className="bg-white p-3 rounded border">
                        <div className="space-y-2">
                          {items.map((item: string, index: number) => (
                            <div key={index} className="flex items-start space-x-3">
                              <span className="text-green-600 text-sm font-medium min-w-[20px]">{index + 1}.</span>
                              <span className="text-gray-800 flex-1">{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch {
                    return (
                      <p className="text-gray-800 whitespace-pre-wrap">
                        {submittedResponse.user_response}
                      </p>
                    );
                  }
                })()
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
            Your Response {(isLinkType || isListType) && <span className="text-red-500">*</span>}
          </label>
          
          {isPdfType ? (
            <div className="space-y-3">
              <input
                id={`response-${submissionIndex}`}
                type="file"
                accept="application/pdf"
                onChange={(e) => onPdfSelect?.(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
                className="w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                disabled={submitting}
              />
              {submitting && (
                <div className="w-full">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{pdfProgress?.stage || pdfProgress?.state || 'Processing...'}</span>
                    <span className="text-xs text-gray-600">{Math.round(pdfProgress?.progress ?? 0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, pdfProgress?.progress ?? 0))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : isLinkType ? (
            <input
              id={`response-${submissionIndex}`}
              type="url"
              value={submissionResponse}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              disabled={submitting}
            />
          ) : isListType ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-2">
                Please provide {currentRequirement.items || 1} item(s):
              </div>
              {Array.from({ length: currentRequirement.items || 1 }).map((_, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                  <input
                    type="text"
                    value={getListItem(index)}
                    onChange={(e) => handleListItemChange(index, e.target.value)}
                    placeholder={`Item ${index + 1}`}
                    className="flex-1 px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    disabled={submitting}
                  />
                </div>
              ))}
            </div>
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

          {isListType && (
            <p className="mt-1 text-xs text-gray-500">
              Fill in all {currentRequirement.items || 1} items to submit your response
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
              disabled={submitting || (isPdfType ? !selectedPdfFile : !submissionResponse.trim())}
              className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                submitting || (isPdfType ? !selectedPdfFile : !submissionResponse.trim())
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
