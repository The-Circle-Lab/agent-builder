"use client";

import React, { useState, useEffect } from 'react';
import { MCQDeploymentAPI, MCQSession, MCQAnswer } from '@/lib/mcqDeploymentAPI';
import { 
  MCQHeader, 
  QuestionNavigationSidebar, 
  QuestionDisplay, 
  LoadingState 
} from './components';

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
        const sessionData = await MCQDeploymentAPI.initializeSession(deploymentId);
        setSession(sessionData);
        
        // Process previously submitted answers if they exist
        if (sessionData.submitted_answers) {
          const submittedAnswersMap: Record<number, MCQAnswer> = {};
          sessionData.submitted_answers.forEach((answer) => {
            submittedAnswersMap[answer.question_index] = answer;
          });
          setSubmittedAnswers(submittedAnswersMap);
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
      const answerData = await MCQDeploymentAPI.submitAnswer(deploymentId, {
        question_index: questionIndex,
        selected_answer: selectedAnswer,
      });
      
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

  const handleAnswerSelect = (answer: string) => {
    if (!session) return;
    
    const currentQuestion = session.questions[currentQuestionIndex];
    setSelectedAnswers(prev => ({
      ...prev,
      [currentQuestion.index]: answer
    }));
    setError(null);
  };

  const handleQuestionNavigation = (index: number) => {
    setCurrentQuestionIndex(index);
    setError(null);
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!session) return;
    
    if (direction === 'prev' && currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    } else if (direction === 'next' && currentQuestionIndex < session.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  // Show loading or error states
  if (loading || sessionError) {
    return <LoadingState loading={loading} error={sessionError} onClose={onClose} />;
  }

  if (!session) return null;

  const currentQuestion = session.questions[currentQuestionIndex];
  const allQuestionsSubmitted = Object.keys(submittedAnswers).length === session.total_questions;

  return (
    <div className="min-h-screen bg-gray-50">
      <MCQHeader
        deploymentName={deploymentName}
        currentQuestionIndex={currentQuestionIndex}
        totalQuestions={session.total_questions}
        onClose={onClose}
      />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <QuestionNavigationSidebar
              questions={session.questions}
              currentQuestionIndex={currentQuestionIndex}
              submittedAnswers={submittedAnswers}
              totalQuestions={session.total_questions}
              onQuestionSelect={handleQuestionNavigation}
            />
          </div>

          {/* Main Question Area */}
          <div className="lg:col-span-3">
            <QuestionDisplay
              question={currentQuestion}
              questionIndex={currentQuestionIndex}
              totalQuestions={session.total_questions}
              selectedAnswer={selectedAnswers[currentQuestion.index]}
              submittedAnswer={submittedAnswers[currentQuestion.index]}
              submitting={submitting}
              error={error}
              allQuestionsSubmitted={allQuestionsSubmitted}
              onAnswerSelect={handleAnswerSelect}
              onSubmitAnswer={handleAnswerSubmit}
              onNavigate={handleNavigate}
              onClose={onClose}
            />
          </div>
        </div>
      </div>
    </div>
  );
} 
