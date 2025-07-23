import React from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

interface LoadingStateProps {
  deploymentName: string;
}

export default function LoadingState({ deploymentName }: LoadingStateProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
            <PencilSquareIcon className="h-8 w-8 text-blue-600 animate-pulse" />
          </div>
          
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Loading Prompt Session
          </h3>
          
          <p className="text-gray-600 mb-4">
            Initializing {deploymentName}...
          </p>
          
          <div className="flex justify-center">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
