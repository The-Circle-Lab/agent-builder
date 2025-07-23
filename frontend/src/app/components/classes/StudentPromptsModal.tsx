"use client";

import React, { useState, useEffect } from 'react';
import { XMarkIcon, PencilSquareIcon, LinkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { PromptDeploymentAPI, PromptInstructorSessionView, PromptInstructorSubmissionView } from '@/lib/deploymentAPIs/promptDeploymentAPI';

interface StudentPromptsModalProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function StudentPromptsModal({ 
  deploymentId, 
  deploymentName, 
  onClose 
}: StudentPromptsModalProps) {
  const [sessions, setSessions] = useState<PromptInstructorSessionView[]>([]);
  const [selectedSession, setSelectedSession] = useState<PromptInstructorSubmissionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSessions();
  }, [deploymentId]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionsData = await PromptDeploymentAPI.getInstructorSessions(deploymentId);
      setSessions(sessionsData);
    } catch (err) {
      console.error('Failed to load prompt sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async (sessionId: number) => {
    try {
      setLoadingSubmissions(true);
      const submissionsData = await PromptDeploymentAPI.getInstructorSubmissions(deploymentId, sessionId);
      setSelectedSession(submissionsData);
    } catch (err) {
      console.error('Failed to load submissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return 'text-green-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <PencilSquareIcon className="h-6 w-6 text-orange-600 mr-3" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Student Prompt Responses</h2>
              <p className="text-sm text-gray-600">{deploymentName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex h-[calc(90vh-80px)]">
          {/* Sessions List */}
          <div className="w-1/2 border-r border-gray-200 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-medium text-gray-900">Student Sessions</h3>
              <p className="text-sm text-gray-600">{sessions.length} students</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <p className="text-red-600">{error}</p>
                  <button
                    onClick={loadSessions}
                    className="mt-2 text-orange-600 hover:text-orange-700"
                  >
                    Try Again
                  </button>
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p>No student sessions found</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.session_id}
                      onClick={() => loadSubmissions(session.session_id)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedSession?.session_id === session.session_id
                          ? 'border-orange-200 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">
                          {session.user_email}
                        </span>
                        {session.is_completed && (
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Progress:</span>
                          <span className={`font-medium ${getProgressColor(session.progress_percentage)}`}>
                            {session.submitted_count}/{session.total_submissions} ({Math.round(session.progress_percentage)}%)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Started:</span>
                          <span>{formatDate(session.started_at)}</span>
                        </div>
                        {session.completed_at && (
                          <div className="flex justify-between">
                            <span>Completed:</span>
                            <span>{formatDate(session.completed_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submissions Detail */}
          <div className="w-1/2 overflow-hidden flex flex-col">
            {selectedSession ? (
              <>
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="font-medium text-gray-900">Submissions</h3>
                  <p className="text-sm text-gray-600">{selectedSession.user_email}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {loadingSubmissions ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                    </div>
                  ) : selectedSession.submissions.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                      <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                      <p>No submissions yet</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {selectedSession.submissions.map((submission, index) => {
                        const isLinkType = submission.media_type === 'hyperlink';
                        
                        return (
                          <div key={index} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                              <div className="flex-shrink-0 mt-1">
                                {isLinkType ? (
                                  <LinkIcon className="h-5 w-5 text-purple-600" />
                                ) : (
                                  <PencilSquareIcon className="h-5 w-5 text-blue-600" />
                                )}
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    Requirement {submission.submission_index + 1}
                                  </h4>
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    isLinkType 
                                      ? 'bg-purple-100 text-purple-800' 
                                      : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {isLinkType ? 'Link' : 'Text'}
                                  </span>
                                </div>
                                
                                <p className="text-sm text-gray-600 mb-3">
                                  {submission.prompt_text}
                                </p>
                                
                                <div className="p-3 bg-gray-50 rounded border">
                                  <p className="text-xs text-gray-500 mb-1">Student Response:</p>
                                  {isLinkType ? (
                                    <a
                                      href={submission.user_response}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:text-blue-800 underline break-all"
                                    >
                                      {submission.user_response}
                                    </a>
                                  ) : (
                                    <p className="text-gray-800 whitespace-pre-wrap">
                                      {submission.user_response}
                                    </p>
                                  )}
                                </div>
                                
                                <p className="text-xs text-gray-500 mt-2">
                                  Submitted: {formatDate(submission.submitted_at)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <PencilSquareIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <p>Select a student session to view submissions</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
