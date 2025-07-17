"use client";

import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { 
  XMarkIcon, 
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  LockClosedIcon,
  LockOpenIcon,
  AcademicCapIcon,
  UsersIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';

interface MCQSession {
  session_id: number;
  user_email: string;
  started_at: string;
  completed_at?: string;
  score?: number;
  total_questions: number;
  is_completed: boolean;
  progress_percentage: number;
}

interface MCQSessionDetails {
  session_id: number;
  user_email: string;
  deployment_id: string;
  started_at: string;
  completed_at?: string;
  score?: number;
  total_questions: number;
  is_completed: boolean;
  questions: Array<{
    index: number;
    question: string;
    possible_answers: string[];
    correct_answer: string;
    student_answer?: string;
    is_correct?: boolean;
    answered_at?: string;
  }>;
}

interface StudentMCQModalProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function StudentMCQModal({ 
  deploymentId, 
  deploymentName, 
  onClose 
}: StudentMCQModalProps) {
  const [sessions, setSessions] = useState<MCQSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<MCQSession | null>(null);
  const [sessionDetails, setSessionDetails] = useState<MCQSessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deploymentOpen, setDeploymentOpen] = useState(true);
  const [stateChanging, setStateChanging] = useState(false);

  const loadSessions = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/sessions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const sessionsData = await response.json();
      setSessions(sessionsData);
    } catch (err) {
      console.error('Error loading MCQ sessions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load MCQ sessions');
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadSessionDetails = async (session: MCQSession) => {
    try {
      setDetailsLoading(true);
      setSelectedSession(session);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/sessions/${session.session_id}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const details = await response.json();
      setSessionDetails(details);
    } catch (err) {
      console.error('Failed to load session details:', err);
      setSessionDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleToggleDeploymentState = async () => {
    try {
      setStateChanging(true);
      
      const endpoint = deploymentOpen ? 'close' : 'open';
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setDeploymentOpen(result.is_open);

    } catch (err) {
      console.error('Failed to toggle deployment state:', err);
      alert(err instanceof Error ? err.message : 'Failed to toggle deployment state');
    } finally {
      setStateChanging(false);
    }
  };

  const getStatusIcon = (isCorrect: boolean | undefined) => {
    if (isCorrect === undefined) return <ClockIcon className="h-4 w-4 text-gray-400" />;
    return isCorrect ? (
      <CheckCircleIcon className="h-4 w-4 text-green-500" />
    ) : (
      <XCircleIcon className="h-4 w-4 text-red-500" />
    );
  };

  const getStatusColor = (isCorrect: boolean | undefined) => {
    if (isCorrect === undefined) return 'text-gray-600';
    return isCorrect ? 'text-green-600' : 'text-red-600';
  };

  // Calculate stats
  const stats = React.useMemo(() => {
    const completedSessions = sessions.filter(s => s.is_completed);
    const inProgressSessions = sessions.filter(s => !s.is_completed);
    
    const totalScore = completedSessions.reduce((sum, s) => sum + (s.score || 0), 0);
    const totalPossibleScore = completedSessions.reduce((sum, s) => sum + s.total_questions, 0);
    const classAverage = totalPossibleScore > 0 ? (totalScore / totalPossibleScore) * 100 : 0;
    
    return {
      totalStudents: sessions.length,
      completedSessions: completedSessions.length,
      inProgressSessions: inProgressSessions.length,
      classAverage: Math.round(classAverage * 10) / 10
    };
  }, [sessions]);

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-6xl w-full h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">
              Student MCQ Sessions - {deploymentName}
            </Dialog.Title>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleToggleDeploymentState}
                disabled={stateChanging}
                className={`p-2 rounded disabled:opacity-50 ${
                  deploymentOpen
                    ? 'text-green-600 hover:text-green-700 hover:bg-green-50' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
                title={deploymentOpen ? 'Close deployment' : 'Open deployment'}
              >
                {deploymentOpen ? (
                  <LockOpenIcon className="h-5 w-5" />
                ) : (
                  <LockClosedIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Stats Summary */}
          <div className="p-4 bg-gray-50 border-b">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-900">MCQ Overview</h3>
            </div>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.totalStudents}</div>
                <div className="text-sm text-gray-500">Total Students</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.completedSessions}</div>
                <div className="text-sm text-gray-500">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{stats.inProgressSessions}</div>
                <div className="text-sm text-gray-500">In Progress</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.classAverage > 0 ? `${stats.classAverage}%` : '—'}
                </div>
                <div className="text-sm text-gray-500">Class Average</div>
              </div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Sessions List */}
            <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Student Sessions ({sessions.length})
                </h3>
                
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <AcademicCapIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No MCQ sessions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map(session => (
                      <button
                        key={session.session_id}
                        onClick={() => loadSessionDetails(session)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                          selectedSession?.session_id === session.session_id ? 'bg-white shadow-sm' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              {session.is_completed ? (
                                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                              ) : (
                                <ClockIcon className="h-4 w-4 text-yellow-500" />
                              )}
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {session.user_email}
                              </p>
                            </div>
                            <div className="mt-1 space-y-1">
                              <div className="flex items-center space-x-2 text-xs text-gray-500">
                                {session.is_completed ? (
                                  <span className="text-green-600 font-medium">
                                    Score: {session.score}/{session.total_questions} ({Math.round((session.score || 0) / session.total_questions * 100)}%)
                                  </span>
                                ) : (
                                  <span className="text-yellow-600 font-medium">
                                    Progress: {Math.round(session.progress_percentage)}%
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                Started: {new Date(session.started_at).toLocaleDateString()}
                              </p>
                              {session.completed_at && (
                                <p className="text-xs text-gray-400">
                                  Completed: {new Date(session.completed_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Session Details */}
            <div className="flex-1 overflow-y-auto">
              {selectedSession ? (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      MCQ Details - {selectedSession.user_email}
                    </h3>
                    {selectedSession.is_completed ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Score: {selectedSession.score}/{selectedSession.total_questions} ({Math.round((selectedSession.score || 0) / selectedSession.total_questions * 100)}%)
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-yellow-600">
                        <ClockIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">In Progress ({Math.round(selectedSession.progress_percentage)}%)</span>
                      </div>
                    )}
                  </div>

                  {detailsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : sessionDetails ? (
                    <div className="space-y-4">
                                             {/* Session Summary */}
                       <div className="bg-gray-50 rounded-lg p-4">
                         <div className="grid grid-cols-2 gap-4 text-sm">
                           <div>
                             <span className="text-black">Started:</span>
                             <span className="ml-2 font-medium text-black">{new Date(sessionDetails.started_at).toLocaleString()}</span>
                           </div>
                           {sessionDetails.completed_at && (
                             <div>
                               <span className="text-black">Completed:</span>
                               <span className="ml-2 font-medium text-black">{new Date(sessionDetails.completed_at).toLocaleString()}</span>
                             </div>
                           )}
                           <div>
                             <span className="text-black">Questions:</span>
                             <span className="ml-2 font-medium text-black">{sessionDetails.total_questions}</span>
                           </div>
                           {sessionDetails.score !== undefined && (
                             <div>
                               <span className="text-black">Final Score:</span>
                               <span className="ml-2 font-medium text-green-600">
                                 {sessionDetails.score}/{sessionDetails.total_questions} ({Math.round((sessionDetails.score || 0) / sessionDetails.total_questions * 100)}%)
                               </span>
                             </div>
                           )}
                         </div>
                       </div>

                      {/* Questions and Answers */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-3">Questions and Answers</h4>
                        <div className="space-y-4">
                          {sessionDetails.questions.map((question, index) => (
                            <div
                              key={question.index}
                              className={`p-4 rounded-lg border ${
                                question.is_correct === true ? 'bg-green-50 border-green-200' :
                                question.is_correct === false ? 'bg-red-50 border-red-200' :
                                'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <h5 className="text-sm font-medium text-gray-900">
                                  Question {index + 1}
                                </h5>
                                <div className="flex items-center space-x-2">
                                  {getStatusIcon(question.is_correct)}
                                  {question.answered_at && (
                                    <span className="text-xs text-gray-500">
                                      {new Date(question.answered_at).toLocaleTimeString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              <p className="text-sm text-gray-700 mb-3">{question.question}</p>
                              
                              <div className="space-y-2">
                                <div className="text-sm">
                                  <span className="text-gray-600 font-medium">Possible Answers:</span>
                                  <ul className="mt-1 ml-4 space-y-1">
                                    {question.possible_answers.map((answer, answerIndex) => (
                                      <li
                                        key={answerIndex}
                                        className={`${
                                          answer === question.correct_answer ? 'text-green-700 font-medium' :
                                          answer === question.student_answer && question.student_answer !== question.correct_answer ? 'text-red-700 font-medium' :
                                          'text-gray-600'
                                        }`}
                                      >
                                        • {answer}
                                        {answer === question.correct_answer && (
                                          <span className="ml-2 text-xs text-green-600">(Correct)</span>
                                        )}
                                        {answer === question.student_answer && answer !== question.correct_answer && (
                                          <span className="ml-2 text-xs text-red-600">(Student&apos;s Answer)</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                
                                {question.student_answer ? (
                                  <div className="pt-2 border-t border-gray-200">
                                    <span className="text-gray-600 font-medium">Student&apos;s Answer:</span>
                                    <span className={`ml-2 ${getStatusColor(question.is_correct)}`}>
                                      {question.student_answer}
                                    </span>
                                    {question.is_correct !== undefined && (
                                      <span className={`ml-2 text-xs font-medium ${getStatusColor(question.is_correct)}`}>
                                        ({question.is_correct ? 'Correct' : 'Incorrect'})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="pt-2 border-t border-gray-200">
                                    <span className="text-gray-500 italic">Not answered yet</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">Failed to load session details</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <UsersIcon className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm">Select a student session to view details</p>
                </div>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
