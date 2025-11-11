import React from 'react';
import { CheckCircleIcon, XCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { MCQQuestion, MCQAnswer } from '@/lib/deploymentAPIs/mcqDeploymentAPI';

interface QuestionDisplayProps {
  question: MCQQuestion;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer: string | undefined;
  submittedAnswer: MCQAnswer | undefined;
  submitting: boolean;
  error: string | null;
  allQuestionsSubmitted: boolean;
  onAnswerSelect: (answer: string) => void;
  onSubmitAnswer: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onClose: () => void;
  revealCorrectAnswer: boolean;
  feedbackMessage?: string | null;
  showChatPrompt?: boolean;
  onRequestChat?: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
}

export default function QuestionDisplay({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  submittedAnswer,
  submitting,
  error,
  allQuestionsSubmitted,
  onAnswerSelect,
  onSubmitAnswer,
  onNavigate,
  onClose,
  revealCorrectAnswer,
  feedbackMessage,
  showChatPrompt,
  onRequestChat,
  disablePrev,
  disableNext,
}: QuestionDisplayProps) {
  const isSubmitted = !!submittedAnswer;
  const isCorrect = submittedAnswer?.is_correct ?? false;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      {/* Question */}
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900 mb-2">
          Question {questionIndex + 1}
        </h2>
        <p className="text-gray-700">{question.question}</p>
      </div>

      {/* Answer Options */}
      <div className="space-y-3 mb-6">
        {question.answers.map((answer, answerIndex) => {
          const optionLetter = String.fromCharCode(65 + answerIndex); // A, B, C, D...
          const isSelected = selectedAnswer === answer;
          const isCorrectAnswer = revealCorrectAnswer && submittedAnswer?.correct_answer === answer;
          const isStudentAnswer = submittedAnswer?.selected_answer === answer;

          let optionClass = 'bg-gray-50 border-gray-200 text-gray-700';
          
          if (isSubmitted) {
            if (isCorrectAnswer) {
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
                  onAnswerSelect(answer);
                }
              }}
              disabled={isSubmitted}
              className={`w-full text-left p-4 border rounded-md transition-colors ${optionClass} ${
                isSubmitted ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div className="flex items-start space-x-3">
                <span className="font-medium">{optionLetter}.</span>
                <span className="flex-1">{answer}</span>
                {isSubmitted && isCorrectAnswer && (
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

      {isSubmitted && !error && (
        <div className="mb-4 space-y-2">
          {submittedAnswer?.is_correct ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
              Great job! You selected the correct answer.
            </div>
          ) : (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              That answer was not correct. {revealCorrectAnswer ? 'Review the highlighted option to see the correct response.' : 'Try reviewing the material before moving on.'}
            </div>
          )}

          {feedbackMessage && !submittedAnswer?.is_correct && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
              {feedbackMessage}
            </div>
          )}

          {showChatPrompt && !submittedAnswer?.is_correct && onRequestChat && (
            <button
              onClick={onRequestChat}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Ask the AI tutor for help
            </button>
          )}
        </div>
      )}

      {/* Submit Button */}
      {!isSubmitted && (
        <div className="flex justify-between items-center">
          <div />
          <button
            onClick={onSubmitAnswer}
            disabled={submitting || !selectedAnswer}
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
      {isSubmitted && (
        <div className="flex justify-between items-center">
          <button
            onClick={() => onNavigate('prev')}
            disabled={disablePrev || questionIndex === 0}
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
              onClick={() => onNavigate('next')}
              disabled={disableNext || questionIndex === totalQuestions - 1}
              className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
} 
