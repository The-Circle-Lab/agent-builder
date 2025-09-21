import React from 'react';
import { CheckCircleIcon, XMarkIcon, LinkIcon, PencilIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { PromptSession, PromptSubmissionResponse } from '@/lib/deploymentAPIs/promptDeploymentAPI';
import { API_CONFIG } from '@/lib/constants';

interface CompletionViewProps {
  session: PromptSession;
  submittedResponses: Record<number, PromptSubmissionResponse>;
  onClose: () => void;
}

export default function CompletionView({ 
  session, 
  submittedResponses, 
  onClose 
}: CompletionViewProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircleIcon className="h-8 w-8 text-green-600" />
                </div>
                <div className="ml-3">
                  <h1 className="text-xl font-semibold text-gray-900">All Submissions Complete!</h1>
                  <p className="text-sm text-gray-600">Thank you for completing all prompt requirements</p>
                </div>
              </div>
              
              {/* Main Question */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h2 className="text-sm font-medium text-blue-900 mb-2">Original Question:</h2>
                <p className="text-gray-800">{session.main_question}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
              title="Close prompt interface"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Completion Info */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-600 mr-2" />
                <span className="text-sm font-medium text-green-900">
                  {Object.keys(submittedResponses).length} / {session.total_submissions} Submitted
                </span>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center">
                <PencilIcon className="h-5 w-5 text-blue-600 mr-2" />
                <span className="text-sm font-medium text-blue-900">
                  Session Started: {new Date(session.started_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            
            {session.completed_at && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 text-purple-600 mr-2" />
                  <span className="text-sm font-medium text-purple-900">
                    Completed: {new Date(session.completed_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Summary of Responses */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">Your Submitted Responses</h2>
          
          <div className="space-y-6">
            {session.submission_requirements.map((requirement, index) => {
              const submittedResponse = submittedResponses[index];
              const isLinkType = requirement.mediaType === 'hyperlink';
              const isPdfType = requirement.mediaType === 'pdf';
              const isListType = requirement.mediaType === 'list';
              const isDynamicListType = requirement.mediaType === 'dynamic_list';
              
              if (!submittedResponse) return null;
              
              return (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      {isPdfType ? (
                        <PaperClipIcon className="h-5 w-5 text-red-600" />
                      ) : isLinkType ? (
                        <LinkIcon className="h-5 w-5 text-purple-600" />
                      ) : isListType || isDynamicListType ? (
                        <PencilIcon className="h-5 w-5 text-orange-600" />
                      ) : (
                        <PencilIcon className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-900">
                          Requirement {index + 1}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          isPdfType
                            ? 'bg-red-100 text-red-800'
                            : isLinkType 
                              ? 'bg-purple-100 text-purple-800' 
                              : (isListType || isDynamicListType)
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-blue-100 text-blue-800'
                        }`}>
                          {isPdfType ? 'PDF' : isLinkType ? 'Link' : (isListType ? 'List' : isDynamicListType ? 'Dynamic List' : 'Text')}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-3">
                        {requirement.prompt}
                      </p>
                      
                      <div className="p-3 bg-gray-50 rounded border">
                        <p className="text-xs text-gray-500 mb-1">Your Response:</p>
                        {isPdfType ? (
                          (() => {
                            const viewUrl = `${API_CONFIG.BASE_URL}/api/files/view/${submittedResponse.user_response}`;
                            return (
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline break-all"
                              >
                                View PDF (Document #{submittedResponse.user_response})
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
                        ) : (isListType || isDynamicListType) ? (
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
                                } catch { /* ignore */ }
                              }
                            } catch { /* ignore */ }

                            if (!items) {
                              const split = raw.split('\n').map(s => s.trim()).filter(Boolean);
                              if (split.length > 0) items = split;
                            }

                            if (items && items.length > 0) {
                              return (
                                <div className="bg-white p-3 rounded border">
                                  <div className="space-y-2">
                                    {items.map((item: string, itemIndex: number) => (
                                      <div key={itemIndex} className="flex items-start space-x-3">
                                        <span className="text-orange-600 text-sm font-medium min-w-[20px]">{itemIndex + 1}.</span>
                                        <span className="text-gray-800 flex-1">{item}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <p className="text-black whitespace-pre-wrap">
                                {raw}
                              </p>
                            );
                          })()
                        ) : (
                          <p className="text-black whitespace-pre-wrap">
                            {submittedResponse.user_response}
                          </p>
                        )}
                      </div>
                      
                      <p className="text-xs text-gray-500 mt-2">
                        Submitted on {new Date(submittedResponse.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Thank You Message */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border p-6 text-center">
          <CheckCircleIcon className="h-12 w-12 text-green-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Thank you for your responses!
          </h3>
          <p className="text-gray-600 mb-4">
            Your submissions have been recorded successfully. You can now close this window or navigate back to your assignments.
          </p>
          <button
            onClick={onClose}
            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Return to Assignments
          </button>
        </div>
      </div>
    </div>
  );
} 
