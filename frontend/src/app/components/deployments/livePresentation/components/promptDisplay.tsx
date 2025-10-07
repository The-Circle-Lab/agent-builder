import React, { useState, useEffect } from 'react';
import { 
  PaperAirplaneIcon,
  ChatBubbleLeftIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { LivePresentationPrompt, GroupSummaryMessage } from '../types/livePresentation';

interface PromptDisplayProps {
  prompt: LivePresentationPrompt;
  onResponse: (promptId: string, response: string) => void;
  disabled?: boolean;
  groupSummary?: GroupSummaryMessage | null;
  waitingForSummary?: boolean;
  summaryGenerating?: boolean;
}

const isValidPrompt = (prompt: LivePresentationPrompt): prompt is LivePresentationPrompt => {
  return prompt && typeof prompt === 'object' && 'id' in prompt && 'statement' in prompt;
};

export const PromptDisplay: React.FC<PromptDisplayProps> = ({
  prompt,
  onResponse,
  disabled = false,
  groupSummary = null,
  waitingForSummary = false,
  summaryGenerating = false
}) => {
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [currentNavIndex, setCurrentNavIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedPurpose, setEditedPurpose] = useState('');
  const [editedPlatform, setEditedPlatform] = useState('');
  
  // Reset navigation index when prompt changes
  useEffect(() => {
    setCurrentNavIndex(0);
    setIsEditing(false);
  }, [prompt.id]);

  // Type guard to ensure prompt is treated as LivePresentationPrompt
  if (!isValidPrompt(prompt)) {
    return <div>Invalid prompt data</div>;
  }
  
  const typedPrompt = prompt;
  
  // Debug logging
  console.log('PromptDisplay - typedPrompt:', typedPrompt);
  console.log('PromptDisplay - group_submission_responses:', typedPrompt.group_submission_responses);
  console.log('PromptDisplay - has group_submission_responses?', !!typedPrompt.group_submission_responses);
  if (typedPrompt.group_submission_responses) {
    console.log('PromptDisplay - group_submission_responses keys:', Object.keys(typedPrompt.group_submission_responses));
  }
  
  // Check if this is a navigation prompt
  const isNavigationPrompt = typedPrompt.enableGroupSubmissionNavigation && typedPrompt.groupSubmissions;
  
  // Use local navigation index or prompt's index
  const navIndex = isNavigationPrompt ? currentNavIndex : 0;
  const totalSubmissions = isNavigationPrompt ? (typedPrompt.totalSubmissions || typedPrompt.groupSubmissions?.length || 0) : 0;
  const currentSubmission = isNavigationPrompt && typedPrompt.groupSubmissions ? typedPrompt.groupSubmissions[navIndex] : typedPrompt.currentSubmission;

  const handleSubmit = () => {
    if (response.trim() && !submitted) {
      onResponse(typedPrompt.id, response.trim());
      setSubmitted(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && typedPrompt.inputType === 'text') {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  const handleNavigateNext = () => {
    if (navIndex < totalSubmissions - 1) {
      const newIndex = navIndex + 1;
      setCurrentNavIndex(newIndex);
      // Send navigation action to backend (will be handled by parent component)
      if (onResponse) {
        onResponse('navigate_next', JSON.stringify({ currentIndex: navIndex }));
      }
    }
  };
  
  const handleNavigatePrevious = () => {
    if (navIndex > 0) {
      const newIndex = navIndex - 1;
      setCurrentNavIndex(newIndex);
      // Send navigation action to backend
      if (onResponse) {
        onResponse('navigate_previous', JSON.stringify({ currentIndex: navIndex }));
      }
    }
  };
  
  // Render navigation prompt
  if (isNavigationPrompt) {
    // Extract the actual submission data from either structure
    const extractSubmissionData = (submission: unknown): Record<string, unknown> | undefined => {
      if (!submission || typeof submission !== 'object') return undefined;
      
      const sub = submission as Record<string, unknown>;
      
      // If it has a 'submission' property, use that
      if ('submission' in sub && sub.submission && typeof sub.submission === 'object') {
        return sub.submission as Record<string, unknown>;
      }
      
      // If it has 'data' property (websiteInfo structure), use data
      if ('data' in sub && sub.data && typeof sub.data === 'object') {
        return sub.data as Record<string, unknown>;
      }
      
      // Otherwise, use the submission itself
      return sub;
    };
    
    const submissionData = extractSubmissionData(currentSubmission);

    const getString = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim().length > 0 ? value : undefined;

    const websiteName = submissionData ? getString(submissionData['name']) : undefined;
    const websiteUrl = submissionData ? getString(submissionData['url']) : undefined;
    const websitePurpose = submissionData ? getString(submissionData['purpose']) : undefined;
    const websitePlatform = submissionData ? getString(submissionData['platform']) : undefined;
    
    // Get student name from either the submission object or the prompt
    const studentName = (() => {
      if (currentSubmission && typeof currentSubmission === 'object') {
        const sub = currentSubmission as Record<string, unknown>;
        if ('studentName' in sub && typeof sub.studentName === 'string') {
          return sub.studentName;
        }
      }
      return typedPrompt.currentStudentName;
    })();

    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {typedPrompt.statement}
        </h2>
        
        {/* Navigation Controls */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleNavigatePrevious}
            disabled={navIndex === 0}
            className="p-2 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-6 h-6 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="text-center">
            <p className="text-sm text-gray-600">Viewing submission {navIndex + 1} of {totalSubmissions}</p>
          </div>
          
          <button
            onClick={handleNavigateNext}
            disabled={navIndex === totalSubmissions - 1}
            className="p-2 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-6 h-6 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        
        {/* Current Submission Display */}
        <div className="mb-6 p-6 bg-indigo-50 border-2 border-indigo-200 rounded-lg">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-indigo-900">
              {studentName}&apos;s Submission
            </h3>
          </div>
          
          {/* Display websiteInfo or other submission types */}
          {websiteUrl || websiteName || websitePurpose || websitePlatform ? (
            <div className="space-y-3">
              {websiteName && (
                <div>
                  <span className="text-sm font-medium text-gray-600">Website Name:</span>
                  <p className="text-xl font-bold text-gray-900 mt-1">{websiteName}</p>
                </div>
              )}
              {websiteUrl && (
                <div>
                  <span className="text-sm font-medium text-gray-600">URL:</span>
                  <a 
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                  >
                    {websiteUrl}
                  </a>
                </div>
              )}
              {websitePurpose && (
                <div>
                  <span className="text-sm font-medium text-gray-600">Purpose:</span>
                  <p className="text-gray-800 mt-1">{websitePurpose}</p>
                </div>
              )}
              {websitePlatform && (
                <div>
                  <span className="text-sm font-medium text-gray-600">Platform:</span>
                  <p className="text-gray-700 mt-1">{websitePlatform}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-600">
              <p>No submission data available yet.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
      {/* Prompt header */}
      <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ChatBubbleLeftIcon className="h-6 w-6 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-indigo-900">Live Prompt</h3>
              <p className="text-sm text-indigo-700">Please respond to the following</p>
            </div>
          </div>
          {/* Late join notification */}
          {typedPrompt.is_late_join ? (
            <div className="flex items-center space-x-2">
              <div className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                Previous Message
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Prompt content */}
      <div className="p-6">
        {/* Late join notification */}
        {typedPrompt.is_late_join ? (
          <div className="mb-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center">
                <ExclamationCircleIcon className="h-5 w-5 text-orange-600 mr-2" />
                <p className="text-sm text-orange-800">
                  <strong>Note:</strong> This message was sent before you joined the session. You can still respond if input is required.
                </p>
              </div>
            </div>
          </div>
        ) : null}
        
        {/* System prompt badge - temporarily commented out due to type issues */}
        {/* {showSystemBadge ? (
          <div className="mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              System Prompt
            </span>
          </div>
        ) : null} */}
        
        <div className="mb-6">
          <p className="text-lg text-gray-900 leading-relaxed whitespace-pre-wrap">
            {typedPrompt.statement}
          </p>
        </div>

        {/* Display assigned list item if present */}
        {typedPrompt.assigned_list_item ? (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <ExclamationCircleIcon className="h-5 w-5 text-amber-600 mt-0.5" />
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-amber-800 mb-2">
                    Your Group&apos;s Assignment:
                  </h4>
                  <div className="text-2xl font-bold text-amber-900 mb-2">
                    {typeof typedPrompt.assigned_list_item === 'string' 
                      ? typedPrompt.assigned_list_item 
                      : (typedPrompt.assigned_list_item as { title?: string })?.title || 'Theme Assignment'
                    }
                  </div>
                  {/* Show description if it's a theme object */}
                  {typeof typedPrompt.assigned_list_item === 'object' && (typedPrompt.assigned_list_item as { description?: string })?.description ? (
                    <div className="text-sm text-amber-700 mt-2">
                      {(typedPrompt.assigned_list_item as { description?: string }).description}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Display submission responses if present */}
        {typedPrompt?.submission_responses ? (
          <div className="mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <ChatBubbleLeftIcon className="h-5 w-5 text-blue-600 mt-0.5" />
                </div>
                <div className="ml-3 flex-1">
                  <h4 className="text-sm font-medium text-blue-800 mb-3">
                    Your Previous Responses:
                  </h4>
                  <div className="space-y-3">
                    {typedPrompt.submission_responses && Object.entries(typedPrompt.submission_responses).map(([promptId, responseData]) => (
                      <div key={promptId} className="bg-white border border-blue-200 rounded p-3">
                        <p className="text-sm text-gray-800">
                          {typeof responseData === 'string' ? responseData : (responseData as { response?: string })?.response || 'No response'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Display GROUP submission responses if present - with navigation like roomcast */}
        {typedPrompt?.group_submission_responses && Object.keys(typedPrompt.group_submission_responses).length > 0 ? (
          <div className="mb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              {(() => {
                const submissionEntries = Object.entries(typedPrompt.group_submission_responses);
                const totalSubmissions = submissionEntries.length;
                const currentEntry = submissionEntries[currentNavIndex];
                
                if (!currentEntry) return null;
                
                const [memberName, responses] = currentEntry;
                
                return (
                  <>
                    {/* Navigation Controls */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        onClick={() => setCurrentNavIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentNavIndex === 0}
                        className="p-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      
                      <div className="text-center flex-1">
                        <h3 className="font-semibold text-amber-900 mb-1">Your Group&apos;s Responses</h3>
                        <p className="text-sm text-amber-700">{currentNavIndex + 1} of {totalSubmissions}</p>
                      </div>
                      
                      <button
                        onClick={() => setCurrentNavIndex(prev => Math.min(totalSubmissions - 1, prev + 1))}
                        disabled={currentNavIndex === totalSubmissions - 1}
                        className="p-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <svg className="w-6 h-6 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Current Submission Display */}
                    <div className="bg-white rounded-lg px-6 py-4 border border-amber-200 shadow-sm">
                      <h4 className="font-semibold text-amber-800 mb-4 text-center text-xl border-b border-amber-200 pb-3">
                        {memberName.split('@')[0]}
                      </h4>
                      <div className="space-y-4">
                        {Object.entries(responses).map(([promptId, responseData]) => {
                          // Extract the actual response content
                          let responseContent = '';
                          if (typeof responseData === 'object' && responseData?.response) {
                            responseContent = responseData.response;
                          } else {
                            responseContent = String(responseData);
                          }

                          // Try to parse as website info first
                          let websiteData = null;
                          let websiteArray: Array<{ url?: string; name?: string; purpose?: string; platform?: string }> = [];
                          
                          try {
                            const parsed = JSON.parse(responseContent);
                            
                            // Check if it's an array of website objects
                            if (Array.isArray(parsed)) {
                              const hasWebsiteFields = parsed.some(item => 
                                item && typeof item === 'object' && 
                                ('url' in item || 'name' in item || 'purpose' in item || 'platform' in item)
                              );
                              
                              if (hasWebsiteFields) {
                                websiteArray = parsed;
                              }
                            } 
                            // Check if it's a single website object
                            else if (parsed && typeof parsed === 'object' && ('url' in parsed || 'name' in parsed)) {
                              websiteData = parsed;
                            }
                          } catch {
                            // Not website JSON, continue with other parsing
                          }

                          // If it's an array of website data, display each website
                          if (websiteArray.length > 0) {
                            return (
                              <div key={promptId} className="space-y-4">
                                {websiteArray.map((website, idx) => {
                                  const handleEdit = () => {
                                    setIsEditing(true);
                                    setEditedPurpose(website.purpose || '');
                                    setEditedPlatform(website.platform || '');
                                  };
                                  
                                  const handleSave = () => {
                                    // Update the website with edited values
                                    website.purpose = editedPurpose;
                                    website.platform = editedPlatform;
                                    
                                    // Update the array and send to backend
                                    const updatedArray = [...websiteArray];
                                    updatedArray[idx] = website;
                                    
                                    onResponse('edit_submission', JSON.stringify({
                                      promptId: promptId,
                                      studentEmail: memberName,
                                      updatedData: updatedArray
                                    }));
                                    
                                    setIsEditing(false);
                                  };
                                  
                                  const handleCancel = () => {
                                    setIsEditing(false);
                                    setEditedPurpose('');
                                    setEditedPlatform('');
                                  };
                                  
                                  return (
                                    <div key={idx} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                      {websiteArray.length > 1 && (
                                        <div className="text-xs font-semibold text-gray-500 mb-2">
                                          Website {idx + 1} of {websiteArray.length}
                                        </div>
                                      )}
                                      <div className="space-y-3">
                                        {website.name && (
                                          <div>
                                            <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                            <p className="text-xl font-bold text-gray-900 mt-1">{website.name}</p>
                                          </div>
                                        )}
                                        {website.url && (
                                          <div>
                                            <span className="text-sm font-medium text-gray-600">URL:</span>
                                            <a
                                              href={website.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                                            >
                                              {website.url}
                                            </a>
                                          </div>
                                        )}
                                        {website.purpose && (
                                          <div>
                                            <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                            {isEditing ? (
                                              <textarea
                                                value={editedPurpose}
                                                onChange={(e) => setEditedPurpose(e.target.value)}
                                                className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                                                rows={3}
                                              />
                                            ) : (
                                              <p className="text-lg text-gray-800 mt-1">{website.purpose}</p>
                                            )}
                                          </div>
                                        )}
                                        {website.platform && (
                                          <div>
                                            <span className="text-sm font-medium text-gray-600">Platform:</span>
                                            {isEditing ? (
                                              <input
                                                type="text"
                                                value={editedPlatform}
                                                onChange={(e) => setEditedPlatform(e.target.value)}
                                                className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                                              />
                                            ) : (
                                              <p className="text-gray-700 mt-1">{website.platform}</p>
                                            )}
                                          </div>
                                        )}
                                        
                                        {/* Edit/Save/Cancel buttons */}
                                        <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
                                          {!isEditing ? (
                                            <button
                                              onClick={handleEdit}
                                              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                              </svg>
                                              Edit
                                            </button>
                                          ) : (
                                            <>
                                              <button
                                                onClick={handleSave}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                              >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Save
                                              </button>
                                              <button
                                                onClick={handleCancel}
                                                className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors flex items-center gap-2"
                                              >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                                Cancel
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }

                          // If it's a single website data object, display it
                          if (websiteData) {
                            const handleEdit = () => {
                              setIsEditing(true);
                              setEditedPurpose(websiteData.purpose || '');
                              setEditedPlatform(websiteData.platform || '');
                            };
                            
                            const handleSave = () => {
                              // Update the websiteData with edited values
                              websiteData.purpose = editedPurpose;
                              websiteData.platform = editedPlatform;
                              
                              // Send update to backend
                              onResponse('edit_submission', JSON.stringify({
                                promptId: promptId,
                                studentEmail: memberName,
                                updatedData: websiteData
                              }));
                              
                              setIsEditing(false);
                            };
                            
                            const handleCancel = () => {
                              setIsEditing(false);
                              setEditedPurpose('');
                              setEditedPlatform('');
                            };
                            
                            return (
                              <div key={promptId} className="space-y-3">
                                {websiteData.name && (
                                  <div>
                                    <span className="text-sm font-medium text-gray-600">Website Name:</span>
                                    <p className="text-xl font-bold text-gray-900 mt-1">{websiteData.name}</p>
                                  </div>
                                )}
                                {websiteData.url && (
                                  <div>
                                    <span className="text-sm font-medium text-gray-600">URL:</span>
                                    <a
                                      href={websiteData.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-lg text-blue-600 hover:underline block mt-1 break-all"
                                    >
                                      {websiteData.url}
                                    </a>
                                  </div>
                                )}
                                {websiteData.purpose && (
                                  <div>
                                    <span className="text-sm font-medium text-gray-600">Purpose:</span>
                                    {isEditing ? (
                                      <textarea
                                        value={editedPurpose}
                                        onChange={(e) => setEditedPurpose(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                                        rows={3}
                                      />
                                    ) : (
                                      <p className="text-lg text-gray-800 mt-1">{websiteData.purpose}</p>
                                    )}
                                  </div>
                                )}
                                {websiteData.platform && (
                                  <div>
                                    <span className="text-sm font-medium text-gray-600">Platform:</span>
                                    {isEditing ? (
                                      <input
                                        type="text"
                                        value={editedPlatform}
                                        onChange={(e) => setEditedPlatform(e.target.value)}
                                        className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800"
                                      />
                                    ) : (
                                      <p className="text-gray-700 mt-1">{websiteData.platform}</p>
                                    )}
                                  </div>
                                )}
                                
                                {/* Edit/Save/Cancel buttons */}
                                <div className="flex gap-2 mt-4 pt-3 border-t border-amber-200">
                                  {!isEditing ? (
                                    <button
                                      onClick={handleEdit}
                                      className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-2"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                      Edit
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={handleSave}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Save
                                      </button>
                                      <button
                                        onClick={handleCancel}
                                        className="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors flex items-center gap-2"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          // Check if it's a JSON array of plain strings
                          let responseItems: string[] = [];
                          try {
                            const parsed = JSON.parse(responseContent);
                            if (Array.isArray(parsed)) {
                              // Make sure they're simple strings/numbers, not objects
                              if (parsed.every(item => typeof item === 'string' || typeof item === 'number')) {
                                responseItems = parsed.map(item => String(item));
                              } else {
                                // Array of objects we couldn't parse, just show the raw content
                                responseItems = [responseContent];
                              }
                            } else {
                              responseItems = [responseContent];
                            }
                          } catch {
                            // Not JSON, treat as single text response
                            responseItems = [responseContent];
                          }
                          
                          return (
                            <div key={promptId} className="text-sm">
                              {responseItems.length > 1 ? (
                                <div className="space-y-2">
                                  {responseItems.map((item, index) => (
                                    <div key={index} className="flex items-start group">
                                      <div className="w-2 h-2 bg-gradient-to-r from-amber-500 to-amber-600 rounded-full mt-2 mr-3 flex-shrink-0 group-hover:scale-110 transition-transform"></div>
                                      <span className="flex-1 text-gray-700 font-medium leading-relaxed text-lg">{item}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-gray-700 font-medium leading-relaxed text-lg">{responseItems[0]}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}

        {/* Input section or Summary */}
        {typedPrompt.hasInput && typedPrompt.inputType !== 'none' ? (
          <div className="space-y-4">
            {/* Show summary if available and for current prompt */}
            {groupSummary && groupSummary.prompt_id === typedPrompt.id ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {groupSummary.group_name} Summary:
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {groupSummary.summary.text}
                  </div>
                  <div className="flex items-center justify-between text-xs text-blue-600 pt-3 border-t border-blue-200 mt-3">
                    <span>
                      Based on {groupSummary.summary.response_count} responses
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      AI-Generated Summary
                    </span>
                  </div>
                </div>
              </div>
            ) : summaryGenerating ? (
              /* Show AI generation state when summary is being generated */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Response:
                </label>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-blue-700 font-medium">AI is generating your group summary...</span>
                  </div>
                </div>
              </div>
            ) : waitingForSummary ? (
              /* Show waiting state when waiting for other group members */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Response:
                </label>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-center space-x-3">
                    <div className="animate-pulse rounded-full h-5 w-5 bg-amber-400"></div>
                    <span className="text-amber-700">Waiting for other group members to respond...</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Show normal input form */
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Response:
                  </label>
                  
                  {typedPrompt.inputType === 'textarea' ? (
                    <textarea
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder={typedPrompt.inputPlaceholder || 'Enter your response here...'}
                      disabled={disabled || submitted}
                      rows={6}
                      className={`w-full px-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                        disabled || submitted ? 'bg-gray-50 text-black' : ''
                      }`}
                    />
                  ) : (
                    <input
                      type="text"
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder={typedPrompt.inputPlaceholder || 'Enter your response here...'}
                      disabled={disabled || submitted}
                      className={`text-black w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 ${
                        disabled || submitted ? 'bg-gray-50 text-black' : ''
                      }`}
                    />
                  )}
                </div>

                {/* Submit button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    {submitted ? (
                      <>
                        <ExclamationCircleIcon className="h-4 w-4 text-green-600" />
                        <span className="text-green-600">Response submitted</span>
                      </>
                    ) : (
                      <span>
                        {typedPrompt.inputType === 'text' ? 'Press Enter or click Submit' : 'Click Submit when ready'}
                      </span>
                    )}
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={disabled || submitted || !response.trim()}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md ${
                      disabled || submitted || !response.trim()
                        ? 'text-gray-400 bg-gray-200 cursor-not-allowed'
                        : 'text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                    }`}
                  >
                    <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                    {submitted ? 'Submitted' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* No input required */}
        {!typedPrompt.hasInput ? (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center">
              <ExclamationCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
              <p className="text-sm text-blue-800">
                No response required. Please read and understand the content above.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
