import React from 'react';
import { CheckCircleIcon, PencilIcon, LinkIcon, PaperClipIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import { PromptSubmissionRequirement } from '@/lib/deploymentAPIs/promptDeploymentAPI';

interface SubmissionNavigationSidebarProps {
  submissionRequirements: PromptSubmissionRequirement[];
  currentSubmissionIndex: number;
  getSubmissionStatus: (index: number) => 'completed' | 'current' | 'pending';
  onNavigateToSubmission: (index: number) => void;
}

export default function SubmissionNavigationSidebar({
  submissionRequirements,
  currentSubmissionIndex,
  getSubmissionStatus,
  onNavigateToSubmission
}: SubmissionNavigationSidebarProps) {
  const getStatusIcon = (index: number) => {
    const status = getSubmissionStatus(index);
    const type = submissionRequirements[index].mediaType;
    const IconComponent = type === 'hyperlink'
      ? LinkIcon
      : type === 'pdf'
        ? PaperClipIcon
        : type === 'multiple_choice'
          ? ListBulletIcon
          : PencilIcon;
    
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'current':
        return <IconComponent className="h-5 w-5 text-blue-600" />;
      case 'pending':
        return <IconComponent className="h-5 w-5 text-gray-400" />;
      default:
        return <IconComponent className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (index: number) => {
    const status = getSubmissionStatus(index);
    
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-900';
      case 'current':
        return 'bg-blue-50 border-blue-200 text-blue-900';
      case 'pending':
        return 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
      default:
        return 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900">Submission Requirements</h3>
        <p className="text-xs text-gray-500 mt-1">
          {submissionRequirements.length} requirement{submissionRequirements.length !== 1 ? 's' : ''} to complete
        </p>
      </div>

      <div className="p-4 space-y-2">
        {submissionRequirements.map((requirement, index) => {
          const status = getSubmissionStatus(index);
          const isActive = index === currentSubmissionIndex;
          
          return (
            <button
              key={index}
              onClick={() => onNavigateToSubmission(index)}
              className={`w-full p-3 rounded-lg border transition-all duration-200 text-left ${getStatusColor(index)} ${
                isActive ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getStatusIcon(index)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">
                      Requirement {index + 1}
                    </span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                      {requirement.mediaType === 'hyperlink'
                        ? 'Link'
                        : requirement.mediaType === 'pdf'
                          ? 'PDF'
                          : requirement.mediaType === 'list'
                            ? 'List'
                            : requirement.mediaType === 'dynamic_list'
                              ? 'Dynamic List'
                              : requirement.mediaType === 'multiple_choice'
                                ? 'Multiple Choice'
                                : requirement.mediaType === 'websiteInfo'
                                  ? 'Website Info'
                                  : 'Text'}
                    </span>
                  </div>
                  
                  <p className="text-sm mt-1 line-clamp-2">
                    {requirement.prompt}
                  </p>
                  
                  {status === 'completed' && (
                    <div className="mt-2 flex items-center">
                      <CheckCircleIcon className="h-3 w-3 text-green-600 mr-1" />
                      <span className="text-xs text-green-600 font-medium">Submitted</span>
                    </div>
                  )}
                  
                  {status === 'current' && (
                    <div className="mt-2 flex items-center">
                      <div className="h-2 w-2 bg-blue-600 rounded-full mr-2 animate-pulse" />
                      <span className="text-xs text-blue-600 font-medium">Current</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
} 
