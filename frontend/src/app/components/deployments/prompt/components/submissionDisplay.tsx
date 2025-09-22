import React from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowRightIcon, ArrowLeftIcon, LinkIcon, PencilIcon, PaperClipIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
  // Edit functionality props
  isEditing?: boolean;
  onStartEdit?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
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
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: SubmissionDisplayProps) {
  const currentRequirement = session.submission_requirements[submissionIndex];
  const isSubmitted = !!submittedResponse;
  const isLinkType = currentRequirement.mediaType === 'hyperlink';
  const isPdfType = currentRequirement.mediaType === 'pdf';
  const isListType = currentRequirement.mediaType === 'list';
  const isDynamicListType = currentRequirement.mediaType === 'dynamic_list';

  // For submitted responses, also check the actual media type of the response
  const submittedIsListType = isSubmitted && (submittedResponse.media_type === 'list' || submittedResponse.media_type === 'dynamic_list');
  const submittedIsPdfType = isSubmitted && submittedResponse.media_type === 'pdf';
  const submittedIsLinkType = isSubmitted && submittedResponse.media_type === 'hyperlink';

  const handleInputChange = (value: string) => {
    onResponseChange(submissionIndex, value);
  };

  // Helper functions for list handling
  const getListItems = (): string[] => {
    if (!isListType && !isDynamicListType) return [];
    try {
      return submissionResponse ? JSON.parse(submissionResponse) : [];
    } catch {
      // If not valid JSON, try splitting by newlines
      return submissionResponse ? submissionResponse.split('\n').filter(item => item.trim()) : [];
    }
  };

  const handleListItemChange = (itemIndex: number, value: string) => {
    if (!isListType && !isDynamicListType) return;
    
    const items = getListItems();
    
    if (isListType) {
      // For fixed lists, ensure array has enough slots
      const requiredItems = currentRequirement.items || 1;
      while (items.length < requiredItems) {
        items.push('');
      }
    } else if (isDynamicListType) {
      // For dynamic lists, ensure array has at least this many items
      while (items.length <= itemIndex) {
        items.push('');
      }
    }
    
    items[itemIndex] = value;
    onResponseChange(submissionIndex, JSON.stringify(items));
  };

  const getListItem = (itemIndex: number): string => {
    const items = getListItems();
    return items[itemIndex] || '';
  };

  const addDynamicListItem = () => {
    if (!isDynamicListType) return;
    const items = getListItems();
    items.push('');
    onResponseChange(submissionIndex, JSON.stringify(items));
  };

  const removeDynamicListItem = (itemIndex: number) => {
    if (!isDynamicListType) return;
    const items = getListItems();
    if (items.length > 1) { // Keep at least one item
      items.splice(itemIndex, 1);
      onResponseChange(submissionIndex, JSON.stringify(items));
    }
  };

  // Helper function to check if submission is valid
  const isSubmissionValid = (): boolean => {
    if (isPdfType) {
      return !!selectedPdfFile;
    } else if (isDynamicListType) {
      const items = getListItems();
      return items.length > 0 && items.some(item => item.trim() !== '');
    } else {
      return submissionResponse.trim() !== '';
    }
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

  // Auto-resize helper for textareas (grow with content)
  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

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
                    : isDynamicListType
                      ? 'bg-green-100 text-green-800'
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
              ) : isDynamicListType ? (
                <>
                  <PencilIcon className="w-3 h-3 mr-1" />
                  Dynamic List
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
      {isSubmitted && !isEditing ? (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-green-900 mb-2">Your Submitted Response:</h3>
                {submittedIsPdfType ? (
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
                ) : submittedIsLinkType ? (
                  <a
                    href={submittedResponse.user_response}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 underline break-all"
                  >
                    {submittedResponse.user_response}
                  </a>
                ) : (submittedIsListType || isListType || isDynamicListType) ? (
                  (() => {
                    const raw = submittedResponse.user_response ?? '';
                    let items: string[] | null = null;
                    try {
                      const first = JSON.parse(raw);
                      if (Array.isArray(first)) {
                        items = first as string[];
                      } else if (typeof first === 'string') {
                        try {
                          const second = JSON.parse(first);
                          if (Array.isArray(second)) {
                            items = second as string[];
                          }
                        } catch {
                          // ignore
                        }
                      }
                    } catch {
                      // ignore
                    }

                    // Fallback: newline-separated values
                    if (!items) {
                      const split = raw.split('\n').map(s => s.trim()).filter(Boolean);
                      if (split.length > 0) items = split;
                    }

                    if (items && items.length > 0) {
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
                    }

                    return (
                      <p className="text-gray-800 whitespace-pre-wrap">
                        {raw}
                      </p>
                    );
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
            {/* Edit button - only show for non-PDF submissions */}
            {!submittedIsPdfType && onStartEdit && (
              <button
                onClick={onStartEdit}
                className="ml-3 inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <PencilIcon className="h-3 w-3 mr-1" />
                Edit
              </button>
            )}
          </div>
        </div>
      ) : isEditing ? (
        /* Edit Mode */
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-blue-900">Edit Your Response:</h3>
            <div className="flex space-x-2">
              <button
                onClick={onCancelEdit}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                <XMarkIcon className="h-3 w-3 mr-1" />
                Cancel
              </button>
              <button
                onClick={onSaveEdit}
                disabled={submitting || !isSubmissionValid()}
                className="inline-flex items-center px-3 py-1.5 border border-transparent shadow-sm text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
          
          {/* Edit form content - reuse the input form logic */}
          <div>
            {isListType || isDynamicListType ? (
              <div className="space-y-3">
                {isListType && (
                  <p className="text-sm text-gray-600">
                    Please provide exactly {currentRequirement.items} items:
                  </p>
                )}
                {isDynamicListType && (
                  <p className="text-sm text-gray-600">
                    Add as many items as you need (minimum 1):
                  </p>
                )}
                
                {Array.from({
                  length: isListType ? currentRequirement.items || 1 : Math.max(1, getListItems().length)
                }).map((_, itemIndex) => (
                  <div key={itemIndex} className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700 min-w-[20px]">{itemIndex + 1}.</span>
                    <input
                      type="text"
                      value={getListItem(itemIndex)}
                      onChange={(e) => handleListItemChange(itemIndex, e.target.value)}
                      placeholder={`Item ${itemIndex + 1}`}
                      className="text-black flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      disabled={submitting}
                    />
                    {isDynamicListType && getListItems().length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDynamicListItem(itemIndex)}
                        className="p-1 text-red-600 hover:text-red-800"
                        disabled={submitting}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                
                {isDynamicListType && (
                  <button
                    type="button"
                    onClick={addDynamicListItem}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    disabled={submitting}
                  >
                    + Add another item
                  </button>
                )}
              </div>
            ) : (
              <textarea
                id={`edit-response-${submissionIndex}`}
                value={submissionResponse}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder={isLinkType ? "Enter a valid URL (http:// or https://)" : "Enter your response..."}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={4}
                disabled={submitting}
                ref={(el) => autoResize(el)}
              />
            )}
          </div>
        </div>
      ) : (
        /* Input Form */
        <div className="mb-6">
          <label htmlFor={`response-${submissionIndex}`} className="block text-sm font-medium text-gray-700 mb-2">
            Your Response {(isLinkType || isListType || isDynamicListType) && <span className="text-red-500">*</span>}
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
                  <textarea
                    value={getListItem(index)}
                    onChange={(e) => { autoResize(e.target); handleListItemChange(index, e.target.value); }}
                    placeholder={`Item ${index + 1}`}
                    rows={1}
                    className="flex-1 px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none overflow-hidden"
                    disabled={submitting}
                    ref={(el) => autoResize(el)}
                  />
                </div>
              ))}
            </div>
          ) : isDynamicListType ? (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-2">
                Create your list by adding items (minimum 1 item required):
              </div>
              {(() => {
                const items = getListItems();
                const displayItems = items.length === 0 ? [''] : items; // Always show at least one input
                return displayItems.map((_, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500 w-6">{index + 1}.</span>
                    <textarea
                      value={getListItem(index)}
                      onChange={(e) => { autoResize(e.target); handleListItemChange(index, e.target.value); }}
                      placeholder={`Item ${index + 1}`}
                      rows={1}
                      className="flex-1 px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none overflow-hidden"
                      disabled={submitting}
                      ref={(el) => autoResize(el)}
                    />
                    {displayItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDynamicListItem(index)}
                        disabled={submitting}
                        className="text-red-500 hover:text-red-700 disabled:opacity-50 px-2 py-1"
                        title="Remove item"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ));
              })()}
              <button
                type="button"
                onClick={addDynamicListItem}
                disabled={submitting}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
              >
                + Add another item
              </button>
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

          {isDynamicListType && (
            <p className="mt-1 text-xs text-gray-500">
              Add at least 1 item to submit your response. You can add or remove items as needed.
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
              disabled={submitting || !isSubmissionValid()}
              className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                submitting || !isSubmissionValid()
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
