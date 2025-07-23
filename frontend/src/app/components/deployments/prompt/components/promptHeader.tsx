import React from 'react';
import { XMarkIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { PromptSession } from '@/lib/deploymentAPIs/promptDeploymentAPI';

interface PromptHeaderProps {
  deploymentName: string;
  session: PromptSession;
  submittedCount: number;
  onClose: () => void;
}

export default function PromptHeader({ 
  deploymentName, 
  session, 
  submittedCount, 
  onClose 
}: PromptHeaderProps) {
  const progressPercentage = (submittedCount / session.total_submissions) * 100;

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <PencilSquareIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <h1 className="text-xl font-semibold text-gray-900">{deploymentName}</h1>
              <p className="text-sm text-gray-600">Prompt Response Session</p>
            </div>
          </div>
          
          {/* Main Question */}
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h2 className="text-sm font-medium text-blue-900 mb-2">Main Question:</h2>
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

      {/* Progress Bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            Progress: {submittedCount} of {session.total_submissions} submissions completed
          </span>
          <span className="text-gray-600">
            {Math.round(progressPercentage)}%
          </span>
        </div>
        
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Session Info */}
      <div className="mt-4 flex items-center text-xs text-gray-500 space-x-4">
        <span>Started: {new Date(session.started_at).toLocaleString()}</span>
        {session.completed_at && (
          <span>Completed: {new Date(session.completed_at).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
} 
