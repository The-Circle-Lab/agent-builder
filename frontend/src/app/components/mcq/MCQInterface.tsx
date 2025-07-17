"use client";

import React, { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ClipboardDocumentCheckIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { API_CONFIG } from '@/lib/constants';

interface MCQQuestion {
  index: number;
  question: string;
  answers: string[];
}

interface MCQSession {
  session_id: number;
  deployment_id: string;
  questions: MCQQuestion[];
  total_questions: number;
  started_at: string;
  completed_at?: string;
  score?: number;
  is_completed: boolean;
  submitted_answers?: Array<{
    question_index: number;
    selected_answer: string;
    is_correct: boolean;
    correct_answer: string;
    answered_at: string;
  }>;
}

interface MCQAnswer {
  question_index: number;
  selected_answer: string;
  is_correct: boolean;
  correct_answer: string;
  answered_at: string;
}

interface MCQInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function MCQInterface({ deploymentId, deploymentName, onClose }: MCQInterfaceProps) {
  const [session, setSession] = useState<MCQSession | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [submittedAnswers, setSubmittedAnswers] = useState<Record<number, MCQAnswer>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Load or create MCQ session
  useEffect(() => {
    const initializeSession = async () => {
      setLoading(true);
      setError(null);
      setSessionError(null);

      try {
        // First try to get existing session
        const getResponse = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/session`, {
          credentials: 'include',
        });

        if (getResponse.ok) {
          const sessionData = await getResponse.json();
          setSession(sessionData);
          
          // Process previously submitted answers if they exist
          if (sessionData.submitted_answers) {
            const submittedAnswersMap: Record<number, MCQAnswer> = {};
            sessionData.submitted_answers.forEach((answer: { 
              question_index: number; 
              selected_answer: string; 
              is_correct: boolean; 
              correct_answer: string; 
              answered_at: string; 
            }) => {
              submittedAnswersMap[answer.question_index] = {
                question_index: answer.question_index,
                selected_answer: answer.selected_answer,
                is_correct: answer.is_correct,
                correct_answer: answer.correct_answer,
                answered_at: answer.answered_at,
              };
            });
            setSubmittedAnswers(submittedAnswersMap);
          }
          
          setLoading(false);
          return;
        }

        if (getResponse.status === 404) {
          // No existing session, create a new one
          const createResponse = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/session`, {
            method: 'POST',
            credentials: 'include',
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(errorText);
          }

          const sessionData = await createResponse.json();
          setSession(sessionData);
        } else {
          const errorText = await getResponse.text();
          throw new Error(errorText);
        }
      } catch (err) {
        console.error('Failed to initialize MCQ session:', err);
        setSessionError(err instanceof Error ? err.message : 'Failed to load quiz');
      } finally {
        setLoading(false);
      }
    };

    initializeSession();
  }, [deploymentId]);

  const submitAnswer = async (questionIndex: number, selectedAnswer: string) => {
    if (!session) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          question_index: questionIndex,
          selected_answer: selectedAnswer,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const answerData: MCQAnswer = await response.json();
      
      // Update submitted answers
      setSubmittedAnswers(prev => ({
        ...prev,
        [questionIndex]: answerData,
      }));

      // If this was the last question, mark session as completed
      if (Object.keys(submittedAnswers).length + 1 === session.total_questions) {
        setSession(prev => prev ? { ...prev, is_completed: true } : null);
      }

      // Move to next question if not the last one
      if (currentQuestionIndex < session.questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }

    } catch (err) {
      console.error('Failed to submit answer:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAnswerSubmit = () => {
    if (!session) return;
    
    const currentQuestion = session.questions[currentQuestionIndex];
    const selectedAnswer = selectedAnswers[currentQuestion.index];
    
    if (!selectedAnswer) {
      setError('Please select an answer before submitting.');
      return;
    }

    submitAnswer(currentQuestion.index, selectedAnswer);
  };

  const goToQuestion = (questionIndex: number) => {
    setCurrentQuestionIndex(questionIndex);
    setError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400 animate-pulse" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Loading Quiz</h3>
          <p className="mt-1 text-sm text-gray-500">Please wait while we prepare your quiz...</p>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Unable to Load Quiz</h3>
          <p className="mt-1 text-sm text-gray-500">{sessionError}</p>
          <button
            onClick={onClose}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Return to Class
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const currentQuestion = session.questions[currentQuestionIndex];
  const isQuestionSubmitted = submittedAnswers[currentQuestion.index];
  const allQuestionsSubmitted = Object.keys(submittedAnswers).length === session.total_questions;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ClipboardDocumentCheckIcon className="h-6 w-6 text-green-600" />
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{deploymentName}</h1>
                <p className="text-sm text-gray-500">Multiple Choice Quiz</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                Question {currentQuestionIndex + 1} of {session.total_questions}
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Questions</h3>
              <div className="grid grid-cols-5 lg:grid-cols-1 gap-2">
                {session.questions.map((question, index) => {
                  const isSubmitted = submittedAnswers[question.index];
                  const isCurrent = index === currentQuestionIndex;
                  
                  return (
                    <button
                      key={question.index}
                      onClick={() => goToQuestion(index)}
                      className={`p-2 text-sm rounded-md border transition-colors ${
                        isCurrent
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : isSubmitted
                          ? isSubmitted.is_correct
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-1">
                        <span>{index + 1}</span>
                        {isSubmitted && (
                          isSubmitted.is_correct ? (
                            <CheckCircleIcon className="h-3 w-3" />
                          ) : (
                            <XCircleIcon className="h-3 w-3" />
                          )
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {allQuestionsSubmitted && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center space-x-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Quiz Completed!</p>
                      <p className="text-xs text-green-600">
                        Score: {Object.values(submittedAnswers).filter(a => a.is_correct).length}/{session.total_questions}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Question Area */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              {/* Question */}
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 mb-2">
                  Question {currentQuestionIndex + 1}
                </h2>
                <p className="text-gray-700">{currentQuestion.question}</p>
              </div>

              {/* Answer Options */}
              <div className="space-y-3 mb-6">
                {currentQuestion.answers.map((answer, answerIndex) => {
                  const optionLetter = String.fromCharCode(65 + answerIndex); // A, B, C, D...
                  const isSelected = selectedAnswers[currentQuestion.index] === answer;
                  const isSubmitted = submittedAnswers[currentQuestion.index];
                  const isCorrect = isSubmitted?.correct_answer === answer;
                  const isStudentAnswer = isSubmitted?.selected_answer === answer;

                  let optionClass = 'bg-gray-50 border-gray-200 text-gray-700';
                  
                  if (isSubmitted) {
                    if (isCorrect) {
                      optionClass = 'bg-green-50 border-green-300 text-green-800';
                    } else if (isStudentAnswer && !isCorrect) {
                      optionClass = 'bg-red-50 border-red-300 text-red-800';
                    } else {
                      optionClass = 'bg-gray-50 border-gray-200 text-gray-500';
                    }
                  } else if (isSelected) {
                    optionClass = 'bg-blue-50 border-blue-300 text-blue-800';
                  } else {
                    optionClass = 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100';
                  }

                  return (
                    <button
                      key={answerIndex}
                      onClick={() => {
                        if (!isSubmitted) {
                          setSelectedAnswers(prev => ({
                            ...prev,
                            [currentQuestion.index]: answer
                          }));
                          setError(null);
                        }
                      }}
                      disabled={!!isSubmitted}
                      className={`w-full text-left p-4 border rounded-md transition-colors ${optionClass} ${
                        isSubmitted ? 'cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        <span className="font-medium">{optionLetter}.</span>
                        <span className="flex-1">{answer}</span>
                        {isSubmitted && isCorrect && (
                          <CheckCircleIcon className="h-5 w-5 text-green-600" />
                        )}
                        {isSubmitted && isStudentAnswer && !isCorrect && (
                          <XCircleIcon className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              {!isQuestionSubmitted && (
                <div className="flex justify-between items-center">
                  <div />
                  <button
                    onClick={handleAnswerSubmit}
                    disabled={submitting || !selectedAnswers[currentQuestion.index]}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Submitting...
                      </>
                    ) : (
                      <>
                        Submit Answer
                        <ArrowRightIcon className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Navigation */}
              {isQuestionSubmitted && (
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => goToQuestion(Math.max(0, currentQuestionIndex - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  {allQuestionsSubmitted ? (
                    <button
                      onClick={onClose}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                    >
                      Return to Class
                    </button>
                  ) : (
                    <button
                      onClick={() => goToQuestion(Math.min(session.questions.length - 1, currentQuestionIndex + 1))}
                      disabled={currentQuestionIndex === session.questions.length - 1}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
