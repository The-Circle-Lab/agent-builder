import React from 'react';
import { ClipboardDocumentCheckIcon } from '@heroicons/react/24/outline';

interface MCQHeaderProps {
  deploymentName: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  onClose: () => void;
}

export default function MCQHeader({ 
  deploymentName, 
  currentQuestionIndex, 
  totalQuestions, 
  onClose 
}: MCQHeaderProps) {
  return (
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
              Question {currentQuestionIndex + 1} of {totalQuestions}
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
  );
} 
