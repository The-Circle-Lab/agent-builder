import React, { useState, useEffect, useCallback } from 'react';
import {
  ChatBubbleLeftRightIcon,
  UserIcon,
  ClockIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PresentationChartBarIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { StudentResponse, StudentConnection } from '../types/livePresentation';

interface StudentScore {
  student_name: string;
  score: number;
}

interface StudentResponsesPanelProps {
  responses: StudentResponse[];
  students: StudentConnection[];
  currentPromptId?: string;
  onRotateSummaries: () => void;
}

export const StudentResponsesPanel: React.FC<StudentResponsesPanelProps> = ({
  responses,
  students,
  currentPromptId,
  onRotateSummaries
}) => {
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [filterByCurrentPrompt, setFilterByCurrentPrompt] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showIframe, setShowIframe] = useState(false);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  const filteredResponses = responses.filter(response => 
    !filterByCurrentPrompt || !currentPromptId || response.prompt_id === currentPromptId
  );

  // Flatten all responses for presentation mode
  const allPresentationResponses = filteredResponses;

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => 
      prev < allPresentationResponses.length - 1 ? prev + 1 : prev
    );
    setShowIframe(false);
    setIframeUrl(null);
  }, [allPresentationResponses.length]);

  const previousSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : prev));
    setShowIframe(false);
    setIframeUrl(null);
  }, []);

  // Handle keyboard navigation in presentation mode
  useEffect(() => {
    if (!presentationMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        previousSlide();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitPresentationMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [presentationMode, nextSlide, previousSlide]);

  const enterPresentationMode = () => {
    setPresentationMode(true);
    setCurrentSlide(0);
    setShowIframe(false);
    setIframeUrl(null);
  };

  const exitPresentationMode = () => {
    setPresentationMode(false);
    setShowIframe(false);
    setIframeUrl(null);
  };

  const toggleIframe = (url: string) => {
    if (showIframe && iframeUrl === url) {
      setShowIframe(false);
      setIframeUrl(null);
    } else {
      setShowIframe(true);
      setIframeUrl(url);
    }
  };

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

  // Count how many summary submissions we have
  const summarySubmissionCount = filteredResponses.filter(response => {
    try {
      const parsed = JSON.parse(response.response);
      return parsed.type === 'summary_submission';
    } catch {
      return false;
    }
  }).length;

  const canRotateSummaries = summarySubmissionCount >= 2;

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <ChatBubbleLeftRightIcon className="h-6 w-6 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Student Responses ({filteredResponses.length})
            </h3>
          </div>

          <div className="flex items-center space-x-4">
            {/* Rotate Summaries Button */}
            {canRotateSummaries && (
              <button
                onClick={onRotateSummaries}
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                title={`Start rotation quiz game (${summarySubmissionCount} groups submitted)`}
              >
                <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rotate Quiz ({summarySubmissionCount} groups)
              </button>
            )}

            {/* Presentation Mode Button */}
            {filteredResponses.length > 0 && (
              <button
                onClick={enterPresentationMode}
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                <PresentationChartBarIcon className="h-5 w-5 mr-2" />
                Present Responses
              </button>
            )}

            {/* Filter */}
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
                    
                    // Check if this is a summary submission
                    let summaryData = null;
                    try {
                      const parsed = JSON.parse(response.response);
                      if (parsed.type === 'summary_submission') {
                        summaryData = parsed;
                      }
                    } catch {
                      // Not a summary submission
                    }

                    if (summaryData) {
                      // Render summary submission with special styling
                      return (
                        <div key={responseKey} className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50">
                          <div className="flex items-start space-x-3">
                            {/* Group icon */}
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                                <ChatBubbleLeftRightIcon className="h-5 w-5 text-white" />
                              </div>
                            </div>

                            {/* Summary content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-3">
                                <span className="font-semibold text-gray-900">
                                  {summaryData.group_name} - Summary Submission
                                </span>
                                <div className="flex items-center text-xs text-gray-500">
                                  <ClockIcon className="h-3 w-3 mr-1" />
                                  {formatTime(response.timestamp)}
                                </div>
                              </div>

                              {/* Summary Fields */}
                              <div className="space-y-3 mb-4">
                                <div className="bg-white rounded-lg p-3 border border-purple-200">
                                  <h5 className="text-xs font-semibold text-gray-600 uppercase mb-1">Category</h5>
                                  <p className="text-gray-900">{summaryData.summary.category}</p>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-purple-200">
                                  <h5 className="text-xs font-semibold text-gray-600 uppercase mb-1">Purpose</h5>
                                  <p className="text-gray-900">{summaryData.summary.purpose}</p>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-purple-200">
                                  <h5 className="text-xs font-semibold text-gray-600 uppercase mb-1">Platform</h5>
                                  <p className="text-gray-900">{summaryData.summary.platform}</p>
                                </div>
                                
                                <div className="bg-white rounded-lg p-3 border border-purple-200">
                                  <h5 className="text-xs font-semibold text-gray-600 uppercase mb-1">Strategy</h5>
                                  <p className="text-gray-900">{summaryData.summary.strategy}</p>
                                </div>
                              </div>

                              {/* AI Match Result */}
                              {summaryData.match_result && (
                                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-4 text-white">
                                  <div className="flex items-center justify-between mb-3">
                                    <h5 className="text-sm font-bold uppercase tracking-wide">🎯 AI Match Result</h5>
                                    <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-semibold">
                                      {Math.round(summaryData.match_result.similarity_score * 100)}% Match
                                    </span>
                                  </div>

                                  <div className="bg-white/10 rounded-lg p-3 mb-3">
                                    <div className="text-xs font-semibold opacity-90 mb-1">Best Matching Submission</div>
                                    <div className="font-medium">{summaryData.match_result.best_match.student_name}</div>
                                    <div className="text-sm opacity-90 mt-1">{summaryData.match_result.best_match.name}</div>
                                    {summaryData.match_result.best_match.url && (
                                      <a 
                                        href={summaryData.match_result.best_match.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs underline opacity-90 hover:opacity-100 break-all"
                                      >
                                        {summaryData.match_result.best_match.url}
                                      </a>
                                    )}
                                  </div>

                                  <div className="text-sm opacity-90">
                                    <div className="font-semibold mb-1">AI Reasoning:</div>
                                    <p className="text-xs leading-relaxed">{summaryData.match_result.reasoning}</p>
                                  </div>

                                  {/* All Scores */}
                                  {summaryData.match_result.all_scores && summaryData.match_result.all_scores.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-white/20">
                                      <button
                                        onClick={() => toggleResponseExpansion(responseKey)}
                                        className="text-xs font-semibold hover:underline"
                                      >
                                        {isExpanded ? '▼ Hide All Scores' : '▶ Show All Scores'} ({summaryData.match_result.all_scores.length})
                                      </button>
                                      
                                      {isExpanded && (
                                        <div className="mt-2 space-y-1">
                                          {summaryData.match_result.all_scores
                                            .sort((a: StudentScore, b: StudentScore) => b.score - a.score)
                                            .map((score: StudentScore, idx: number) => (
                                              <div key={idx} className="flex items-center justify-between bg-white/10 rounded px-2 py-1">
                                                <span className="text-xs">{score.student_name}</span>
                                                <span className="text-xs font-semibold">{Math.round(score.score * 100)}%</span>
                                              </div>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Regular response rendering
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

      {/* Fullscreen Presentation Mode */}
      {presentationMode && allPresentationResponses.length > 0 && (
        <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-indigo-900 to-purple-900 z-50 flex flex-col">
          {/* Header Controls */}
          <div className="flex items-center justify-between p-6 bg-black/20 backdrop-blur-sm">
            <div className="flex items-center space-x-4">
              <div className="text-white/80 text-sm font-medium">
                Response {currentSlide + 1} of {allPresentationResponses.length}
              </div>
              <div className="h-2 w-48 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-400 transition-all duration-300"
                  style={{ width: `${((currentSlide + 1) / allPresentationResponses.length) * 100}%` }}
                />
              </div>
            </div>

            <button
              onClick={exitPresentationMode}
              className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
            <div className="flex items-center justify-center w-full h-full gap-4">
              {/* Response Content */}
              <div className={`flex items-center justify-center transition-all duration-300 ${showIframe ? 'w-1/2' : 'w-full'} h-full overflow-auto`}>
                {(() => {
                  const response = allPresentationResponses[currentSlide];
                  const studentInfo = getStudentInfo(response.user_id);

                  // Check if this is a summary submission
                  let summaryData = null;
                  try {
                    const parsed = JSON.parse(response.response);
                    if (parsed.type === 'summary_submission') {
                      summaryData = parsed;
                    }
                  } catch {
                    // Not a summary submission
                  }

                  if (summaryData) {
                    // Render summary submission in presentation mode
                    return (
                      <div className="max-w-6xl w-full bg-white rounded-2xl shadow-2xl p-12">
                        <div className="mb-8">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center">
                              <ChatBubbleLeftRightIcon className="h-7 w-7 text-white" />
                            </div>
                            <div>
                              <h2 className="text-3xl font-bold text-gray-900">
                                {summaryData.group_name}
                              </h2>
                              <p className="text-gray-600">Summary Submission</p>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">
                            {formatTime(response.timestamp)}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-8">
                          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6">
                            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Category</h3>
                            <p className="text-xl text-gray-900">{summaryData.summary.category}</p>
                          </div>
                          
                          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6">
                            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Platform</h3>
                            <p className="text-xl text-gray-900">{summaryData.summary.platform}</p>
                          </div>
                          
                          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 col-span-2">
                            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Purpose</h3>
                            <p className="text-lg text-gray-900">{summaryData.summary.purpose}</p>
                          </div>
                          
                          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 col-span-2">
                            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Strategy</h3>
                            <p className="text-lg text-gray-900">{summaryData.summary.strategy}</p>
                          </div>
                        </div>

                        {summaryData.match_result && (
                          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-8 text-white">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="text-2xl font-bold">🎯 AI Match Result</h3>
                              <div className="text-4xl font-bold">
                                {Math.round(summaryData.match_result.similarity_score * 100)}%
                              </div>
                            </div>

                            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-6 mb-6">
                              <div className="text-sm font-semibold opacity-90 mb-2">Best Matching Submission</div>
                              <div className="text-4xl font-bold mb-3">{summaryData.match_result.best_match.student_name}</div>
                              <div className="text-3xl font-semibold opacity-95 mb-4">{summaryData.match_result.best_match.name}</div>
                              {summaryData.match_result.best_match.url && (
                                <button
                                  onClick={() => toggleIframe(summaryData.match_result.best_match.url)}
                                  className="text-2xl underline opacity-90 hover:opacity-100 break-all inline-block text-left hover:bg-white/10 px-3 py-2 rounded-lg transition-colors"
                                >
                                  {summaryData.match_result.best_match.url}
                                </button>
                              )}
                            </div>

                            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
                              <div className="font-semibold mb-2">AI Reasoning:</div>
                              <p className="text-sm leading-relaxed opacity-95">{summaryData.match_result.reasoning}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Check if regular response contains website data
                  let websiteData = null;
                  try {
                    const parsed = JSON.parse(response.response);
                    if (parsed.url || parsed.name) {
                      websiteData = parsed;
                    }
                  } catch {
                    // Not website data
                  }

                  // Regular response rendering in presentation mode
                  return (
                    <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl p-12">
                      <div className="flex items-start space-x-6 mb-8">
                        <div className="flex-shrink-0">
                          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                            <UserIcon className="h-10 w-10 text-white" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h2 className="text-4xl font-bold text-gray-900 mb-2">
                            {response.user_name}
                          </h2>
                          {studentInfo?.group_info && (
                            <div className="inline-flex items-center px-4 py-2 rounded-full text-lg font-medium bg-purple-100 text-purple-800 mb-2">
                              {studentInfo.group_info.group_name}
                            </div>
                          )}
                          <div className="flex items-center text-gray-500 mt-2">
                            <ClockIcon className="h-5 w-5 mr-2" />
                            {formatTime(response.timestamp)}
                          </div>
                        </div>
                      </div>

                      {websiteData ? (
                        <div className="space-y-6">
                          {/* Website Name - Same size as student name */}
                          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6">
                            <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Website Name</h3>
                            <p className="text-4xl font-bold text-gray-900">{websiteData.name}</p>
                          </div>

                          {/* Website URL - Same size as student name, clickable */}
                          {websiteData.url && (
                            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6">
                              <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Website URL</h3>
                              <button
                                onClick={() => toggleIframe(websiteData.url)}
                                className="text-4xl font-bold text-indigo-600 hover:text-indigo-800 break-all text-left underline decoration-2 underline-offset-4 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors w-full"
                              >
                                {websiteData.url}
                              </button>
                            </div>
                          )}

                          {/* Other fields */}
                          {websiteData.purpose && (
                            <div className="bg-gradient-to-br from-gray-50 to-indigo-50 rounded-xl p-6">
                              <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Purpose</h3>
                              <p className="text-xl text-gray-800">{websiteData.purpose}</p>
                            </div>
                          )}

                          {websiteData.platform && (
                            <div className="bg-gradient-to-br from-gray-50 to-indigo-50 rounded-xl p-6">
                              <h3 className="text-sm font-bold text-gray-600 uppercase mb-2">Platform</h3>
                              <p className="text-xl text-gray-800">{websiteData.platform}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-gradient-to-br from-gray-50 to-indigo-50 rounded-xl p-8">
                          <p className="text-2xl text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {response.response}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Website Preview Iframe */}
              {showIframe && iframeUrl && (
                <div className="w-1/2 h-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                  <div className="bg-gray-100 px-6 py-4 flex items-center justify-between border-b">
                    <h3 className="font-semibold text-gray-900">Website Preview</h3>
                    <div className="flex items-center space-x-2">
                      <a
                        href={iframeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                      >
                        <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Open in New Tab
                      </a>
                      <button
                        onClick={() => {
                          setShowIframe(false);
                          setIframeUrl(null);
                        }}
                        className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <iframe
                    src={iframeUrl}
                    className="flex-1 w-full border-0"
                    title="Website Preview"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between p-6 bg-black/20 backdrop-blur-sm">
            <button
              onClick={previousSlide}
              disabled={currentSlide === 0}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                currentSlide === 0
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <ChevronLeftIcon className="h-5 w-5" />
              <span>Previous</span>
            </button>

            <div className="text-white/60 text-sm">
              Use arrow keys or click to navigate • Press ESC to exit
            </div>

            <button
              onClick={nextSlide}
              disabled={currentSlide === allPresentationResponses.length - 1}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                currentSlide === allPresentationResponses.length - 1
                  ? 'bg-white/10 text-white/30 cursor-not-allowed'
                  : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <span>Next</span>
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};




