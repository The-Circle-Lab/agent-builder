import React from 'react';
import { 
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface LoadingStateProps {
  loading?: boolean;
  error?: string | null;
  onClose?: () => void;
}

export default function LoadingState({ loading, error, onClose }: LoadingStateProps) {
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-red-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">Unable to Load Quiz</h3>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Return to Class
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
} 
