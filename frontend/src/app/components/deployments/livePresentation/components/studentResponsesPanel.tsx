import React, { useState } from 'react';
import {
  ChatBubbleLeftRightIcon,
  UserIcon,
  ClockIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import { StudentResponse, StudentConnection } from '../types/livePresentation';

interface StudentResponsesPanelProps {
  responses: StudentResponse[];
  students: StudentConnection[];
  currentPromptId?: string;
}

export const StudentResponsesPanel: React.FC<StudentResponsesPanelProps> = ({
  responses,
  students,
  currentPromptId
}) => {
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [filterByCurrentPrompt, setFilterByCurrentPrompt] = useState(true);

  const filteredResponses = responses.filter(response => 
    !filterByCurrentPrompt || !currentPromptId || response.prompt_id === currentPromptId
  );

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const getStudentInfo = (userId: string) => {
    return students.find(student => student.user_id === userId);
  };

  const toggleResponseExpansion = (responseId: string) => {
    setExpandedResponse(expandedResponse === responseId ? null : responseId);
  };

  const groupedResponses = filteredResponses.reduce((acc, response) => {
    const key = response.prompt_id;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(response);
    return acc;
  }, {} as Record<string, StudentResponse[]>);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <ChatBubbleLeftRightIcon className="h-6 w-6 text-indigo-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Student Responses ({filteredResponses.length})
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          <FunnelIcon className="h-4 w-4 text-gray-500" />
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={filterByCurrentPrompt}
              onChange={(e) => setFilterByCurrentPrompt(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-gray-700">Current prompt only</span>
          </label>
        </div>
      </div>

      {filteredResponses.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
          <p className="text-lg font-medium">No responses yet</p>
          <p className="text-sm">
            {filterByCurrentPrompt && currentPromptId
              ? "No responses to the current prompt"
              : "Send a prompt to start receiving student responses"
            }
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedResponses)
            .sort(([, a], [, b]) => 
              new Date(b[0]?.timestamp || 0).getTime() - new Date(a[0]?.timestamp || 0).getTime()
            )
            .map(([promptId, promptResponses]) => (
            <div key={promptId} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Prompt header */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">
                    Prompt: {promptId.substring(0, 8)}...
                  </h4>
                  <span className="text-sm text-gray-600">
                    {promptResponses.length} response{promptResponses.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Responses */}
              <div className="divide-y divide-gray-200">
                {promptResponses
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((response, index) => {
                    const studentInfo = getStudentInfo(response.user_id);
                    const responseKey = `${response.prompt_id}-${response.user_id}-${index}`;
                    const isExpanded = expandedResponse === responseKey;
                    const shouldTruncate = response.response.length > 150;

                    return (
                      <div key={responseKey} className="p-4">
                        <div className="flex items-start space-x-3">
                          {/* Student avatar */}
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                              <UserIcon className="h-5 w-5 text-indigo-600" />
                            </div>
                          </div>

                          {/* Response content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-medium text-gray-900">
                                {response.user_name}
                              </span>
                              {studentInfo?.group_info && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {studentInfo.group_info.group_name}
                                </span>
                              )}
                              <div className="flex items-center text-xs text-gray-500">
                                <ClockIcon className="h-3 w-3 mr-1" />
                                {formatTime(response.timestamp)}
                              </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3">
                              <p className="text-gray-800 whitespace-pre-wrap">
                                {shouldTruncate && !isExpanded
                                  ? `${response.response.substring(0, 150)}...`
                                  : response.response
                                }
                              </p>

                              {shouldTruncate && (
                                <button
                                  onClick={() => toggleResponseExpansion(responseKey)}
                                  className="mt-2 inline-flex items-center text-sm text-indigo-600 hover:text-indigo-800"
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUpIcon className="h-4 w-4 mr-1" />
                                      Show less
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDownIcon className="h-4 w-4 mr-1" />
                                      Show more
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};




