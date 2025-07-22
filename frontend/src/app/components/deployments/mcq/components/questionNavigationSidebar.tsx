import React from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { MCQQuestion, MCQAnswer } from '@/lib/deploymentAPIs/mcqDeploymentAPI';

interface QuestionNavigationSidebarProps {
  questions: MCQQuestion[];
  currentQuestionIndex: number;
  submittedAnswers: Record<number, MCQAnswer>;
  totalQuestions: number;
  onQuestionSelect: (index: number) => void;
}

export default function QuestionNavigationSidebar({
  questions,
  currentQuestionIndex,
  submittedAnswers,
  totalQuestions,
  onQuestionSelect
}: QuestionNavigationSidebarProps) {
  const allQuestionsSubmitted = Object.keys(submittedAnswers).length === totalQuestions;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Questions</h3>
      <div className="grid grid-cols-5 lg:grid-cols-1 gap-2">
        {questions.map((question, index) => {
          const isSubmitted = submittedAnswers[question.index];
          const isCurrent = index === currentQuestionIndex;
          
          return (
            <button
              key={question.index}
              onClick={() => onQuestionSelect(index)}
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
                Score: {Object.values(submittedAnswers).filter(a => a.is_correct).length}/{totalQuestions}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
