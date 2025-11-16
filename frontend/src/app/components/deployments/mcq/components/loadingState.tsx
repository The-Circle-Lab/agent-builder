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

export default function LoadingState({ loading, error, onClose: _onClose }: LoadingStateProps) {
  // mark unused prop as used to satisfy our ESLint rule when parent may pass this
  void _onClose;
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
        </div>
      </div>
    );
  }

  return null;
} 
