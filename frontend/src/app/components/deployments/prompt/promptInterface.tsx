"use client";

import React, { useState, useEffect } from 'react';
import { PromptDeploymentAPI, PromptSession, PromptSubmissionResponse, GroupInfo } from '@/lib/deploymentAPIs/promptDeploymentAPI';
import { 
  PromptHeader, 
  SubmissionNavigationSidebar, 
  SubmissionDisplay, 
  LoadingState,
  CompletionView
} from './components';
import { UsersIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

interface PromptInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

// Group Info Display Component
interface GroupInfoDisplayProps {
  groupInfo: GroupInfo;
}

function GroupInfoDisplay({ groupInfo }: GroupInfoDisplayProps) {
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start space-x-3">
        <UsersIcon className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            Your Group: {groupInfo.group_name}
          </h3>
          
          {groupInfo.explanation && (
            <div className="bg-blue-100 border border-blue-300 rounded-md p-3 mb-3">
              <div className="flex items-start space-x-2">
                <InformationCircleIcon className="h-5 w-5 text-blue-700 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800 mb-1">Why you were grouped together:</p>
                  <p className="text-sm text-blue-700">{groupInfo.explanation}</p>
                </div>
              </div>
            </div>
          )}
          
          <div>
            <p className="text-sm font-medium text-blue-800 mb-2">
              Group Members ({groupInfo.member_count}):
            </p>
            <div className="flex flex-wrap gap-2">
              {groupInfo.group_members.map((member, index) => (
                <span 
                  key={index}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-200 text-blue-800"
                >
                  {member}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PromptInterface({ deploymentId, deploymentName, onClose }: PromptInterfaceProps) {
  const [session, setSession] = useState<PromptSession | null>(null);
  const [currentSubmissionIndex, setCurrentSubmissionIndex] = useState(0);
  const [submissionResponses, setSubmissionResponses] = useState<Record<number, string>>({});
  const [submittedResponses, setSubmittedResponses] = useState<Record<number, PromptSubmissionResponse>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [pdfFiles, setPdfFiles] = useState<Record<number, File | null>>({});

  // Load or create prompt session
  useEffect(() => {
    const initializeSession = async () => {
      setLoading(true);
      setError(null);
      setSessionError(null);

      try {
        const sessionData = await PromptDeploymentAPI.initializeSession(deploymentId);
        setSession(sessionData);
        
        // Process previously submitted responses if they exist
        if (sessionData.submitted_responses) {
          const submittedResponsesMap: Record<number, PromptSubmissionResponse> = {};
          sessionData.submitted_responses.forEach((response) => {
            submittedResponsesMap[response.submission_index] = response;
          });
          setSubmittedResponses(submittedResponsesMap);
        }
      } catch (err) {
        console.error('Failed to initialize prompt session:', err);
        setSessionError(err instanceof Error ? err.message : 'Failed to load prompt');
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [deploymentId]);

  const submitResponse = async (submissionIndex: number, response: string) => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const responseData = await PromptDeploymentAPI.submitResponse(deploymentId, {
        submission_index: submissionIndex,
        response: response,
      });
      
      // Update submitted responses
      setSubmittedResponses(prev => ({
        ...prev,
        [submissionIndex]: {
          submission_index: responseData.submission_index,
          prompt_text: responseData.prompt_text,
          media_type: responseData.media_type as 'textarea' | 'hyperlink' | 'pdf',
          user_response: responseData.user_response,
          submitted_at: responseData.submitted_at,
        },
      }));

      // Clear the current response input
      setSubmissionResponses(prev => ({
        ...prev,
        [submissionIndex]: '',
      }));

      // If this was the last submission, mark session as completed
      if (Object.keys(submittedResponses).length + 1 === session.total_submissions) {
        setSession(prev => prev ? { ...prev, is_completed: true } : null);
      } else {
        // Move to next submission if not the last one
        const nextIndex = findNextUnsubmittedIndex(submissionIndex);
        if (nextIndex !== -1) {
          setCurrentSubmissionIndex(nextIndex);
        }
      }

    } catch (err) {
      console.error('Failed to submit response:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPdfResponse = async (submissionIndex: number, file: File) => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const responseData = await PromptDeploymentAPI.submitPdf(deploymentId, submissionIndex, file);

      setSubmittedResponses(prev => ({
        ...prev,
        [submissionIndex]: {
          submission_index: responseData.submission_index,
          prompt_text: responseData.prompt_text,
          media_type: responseData.media_type as 'textarea' | 'hyperlink' | 'pdf',
          user_response: responseData.user_response,
          submitted_at: responseData.submitted_at,
        },
      }));

      // Clear selected file for this index
      setPdfFiles(prev => ({ ...prev, [submissionIndex]: null }));

      if (Object.keys(submittedResponses).length + 1 === session.total_submissions) {
        setSession(prev => prev ? { ...prev, is_completed: true } : null);
      } else {
        const nextIndex = findNextUnsubmittedIndex(submissionIndex);
        if (nextIndex !== -1) {
          setCurrentSubmissionIndex(nextIndex);
        }
      }
    } catch (err) {
      console.error('Failed to submit PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit PDF');
    } finally {
      setSubmitting(false);
    }
  };

  const findNextUnsubmittedIndex = (currentIndex: number): number => {
    if (!session) return -1;
    
    // Find the next unsubmitted requirement
    for (let i = currentIndex + 1; i < session.total_submissions; i++) {
      if (!submittedResponses[i]) {
        return i;
      }
    }
    
    // If no next unsubmitted found, find the first unsubmitted from the beginning
    for (let i = 0; i < currentIndex; i++) {
      if (!submittedResponses[i]) {
        return i;
      }
    }
    
    return -1; // All submitted
  };

  const handleResponseSubmit = () => {
    if (!session) return;
    
    const currentRequirement = session.submission_requirements[currentSubmissionIndex];
    const response = submissionResponses[currentSubmissionIndex];
    
    if (currentRequirement.mediaType !== 'pdf') {
      if (!response || !response.trim()) {
        setError('Please provide a response before submitting');
        return;
      }
    }

    // Basic client-side validation for hyperlinks
    if (currentRequirement.mediaType === 'hyperlink') {
      const urlPattern = /^https?:\/\/.+/i;
      if (!urlPattern.test(response.trim())) {
        setError('Please provide a valid URL starting with http:// or https://');
        return;
      }
    }

    if (currentRequirement.mediaType === 'pdf') {
      const file = pdfFiles[currentSubmissionIndex];
      if (!file) {
        setError('Please select a PDF file to upload');
        return;
      }
      submitPdfResponse(currentSubmissionIndex, file);
    } else {
      submitResponse(currentSubmissionIndex, response);
    }
  };

  const handleResponseChange = (submissionIndex: number, value: string) => {
    setSubmissionResponses(prev => ({
      ...prev,
      [submissionIndex]: value,
    }));
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const handlePdfChange = (submissionIndex: number, file: File | null) => {
    setPdfFiles(prev => ({
      ...prev,
      [submissionIndex]: file,
    }));
    if (error) setError(null);
  };

  const navigateToSubmission = (index: number) => {
    if (session && index >= 0 && index < session.total_submissions) {
      setCurrentSubmissionIndex(index);
      setError(null);
    }
  };

  const getSubmissionStatus = (index: number): 'completed' | 'current' | 'pending' => {
    if (submittedResponses[index]) return 'completed';
    if (index === currentSubmissionIndex) return 'current';
    return 'pending';
  };

  // Show loading state
  if (loading) {
    return <LoadingState deploymentName={deploymentName} />;
  }

  // Show session error
  if (sessionError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <div className="text-red-600 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed to Load Prompt</h3>
            <p className="text-gray-600 mb-4">{sessionError}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show session not found
  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Session Not Found</h3>
            <p className="text-gray-600 mb-4">Unable to load the prompt session.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show question-only view if there are no submission requirements
  if (session.total_submissions === 0) {
    
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm border mb-6">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{deploymentName}</h1>
                <p className="text-sm text-gray-600 mt-1">Question</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Group Info for question-only prompts */}
          {session.group_info && (
            <div className="mb-6">
              <GroupInfoDisplay groupInfo={session.group_info} />
            </div>
          )}

          {/* Question Content */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="px-6 py-8">
              <div className="prose max-w-none">
                <div 
                  className="text-gray-900 leading-relaxed"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {session.main_question}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  This is a question-only prompt. No submission is required.
                </p>
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show completion view if all submissions are done
  if (session.is_completed || Object.keys(submittedResponses).length === session.total_submissions) {
    return (
      <CompletionView 
        session={session}
        submittedResponses={submittedResponses}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <PromptHeader
          deploymentName={deploymentName}
          session={session}
          submittedCount={Object.keys(submittedResponses).length}
          onClose={onClose}
        />

        <div className="mt-6 lg:grid lg:grid-cols-4 lg:gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <SubmissionNavigationSidebar
              submissionRequirements={session.submission_requirements}
              currentSubmissionIndex={currentSubmissionIndex}
              getSubmissionStatus={getSubmissionStatus}
              onNavigateToSubmission={navigateToSubmission}
            />
          </div>

          {/* Main Content */}
          <div className="mt-6 lg:mt-0 lg:col-span-3">
            {session.group_info && (
              <div className="mb-6">
                <GroupInfoDisplay groupInfo={session.group_info} />
              </div>
            )}
            <SubmissionDisplay
              session={session}
              submissionIndex={currentSubmissionIndex}
              submissionResponse={submissionResponses[currentSubmissionIndex] || ''}
              submittedResponse={submittedResponses[currentSubmissionIndex]}
              submitting={submitting}
              error={error}

              onResponseChange={handleResponseChange}
              onSubmitResponse={handleResponseSubmit}
              onNavigateToSubmission={navigateToSubmission}
              selectedPdfFile={pdfFiles[currentSubmissionIndex] || null}
              onPdfSelect={(file) => handlePdfChange(currentSubmissionIndex, file)}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 
