"use client";

import React, { useState, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { 
  XMarkIcon, 
  CodeBracketIcon, 
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline';
import { DeploymentAPI, StudentSubmission, SubmissionSummary, SubmissionTestResults } from '../agentBuilder/scripts/deploymentAPI';

interface StudentSubmissionsModalProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function StudentSubmissionsModal({ 
  deploymentId, 
  deploymentName, 
  onClose 
}: StudentSubmissionsModalProps) {
  const [submissionSummary, setSubmissionSummary] = useState<SubmissionSummary | null>(null);
  const [selectedUser, setSelectedUser] = useState<{email: string; submissions: StudentSubmission[]} | null>(null);
  const [selectedSubmission, setSelectedSubmission] = useState<StudentSubmission | null>(null);
  const [testResults, setTestResults] = useState<SubmissionTestResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [testResultsLoading, setTestResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMode, setStatusMode] = useState<'best' | 'latest'>('latest');

  useEffect(() => {
    loadSubmissions();
  }, [deploymentId]);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading submissions for deployment:', deploymentId);
      const summary = await DeploymentAPI.getStudentSubmissions(deploymentId);
      console.log('Received submission summary:', summary);
      setSubmissionSummary(summary);
    } catch (err) {
      console.error('Error loading submissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const loadTestResults = async (submission: StudentSubmission) => {
    try {
      setTestResultsLoading(true);
      setSelectedSubmission(submission);
      const results = await DeploymentAPI.getSubmissionTestResults(deploymentId, submission.id);
      setTestResults(results);
    } catch (err) {
      console.error('Failed to load test results:', err);
      setTestResults(null);
    } finally {
      setTestResultsLoading(false);
    }
  };

  const getStatusIcon = (passed: boolean) => {
    return passed ? (
      <CheckCircleIcon className="h-4 w-4 text-green-500" />
    ) : (
      <XCircleIcon className="h-4 w-4 text-red-500" />
    );
  };

  const getStatusColor = (passed: boolean) => {
    return passed ? 'text-green-600' : 'text-red-600';
  };

  // Group submissions by user
  const userGroups = React.useMemo(() => {
    if (!submissionSummary?.all_submissions) return [];
    
    const grouped = submissionSummary.all_submissions.reduce((acc, submission) => {
      if (!acc[submission.user_email]) {
        acc[submission.user_email] = [];
      }
      acc[submission.user_email].push(submission);
      return acc;
    }, {} as Record<string, StudentSubmission[]>);

    // Convert to array and sort submissions within each group
    return Object.entries(grouped).map(([email, submissions]) => {
      const sortedSubmissions = submissions.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
      const latestSubmission = sortedSubmissions[0];
      const bestSubmission = submissions.find(s => s.passed) || latestSubmission; // Best = first passed, or latest if none passed
      
      return {
        email,
        submissions: sortedSubmissions,
        latestSubmission,
        bestSubmission,
        displaySubmission: statusMode === 'best' ? bestSubmission : latestSubmission
      };
    }).sort((a, b) => a.email.localeCompare(b.email));
  }, [submissionSummary?.all_submissions, statusMode]);

  // Calculate stats based on the selected mode
  const stats = React.useMemo(() => {
    const passedStudents = userGroups.filter(group => group.displaySubmission.passed).length;
    const failedStudents = userGroups.length - passedStudents;
    
    return {
      totalStudents: userGroups.length,
      passedStudents,
      failedStudents,
      totalSubmissions: submissionSummary?.total_submissions || 0
    };
  }, [userGroups, submissionSummary?.total_submissions]);

  console.log('User groups:', userGroups);

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-7xl w-full h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">
              Student Submissions - {deploymentName}
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Stats Summary */}
          {submissionSummary && (
            <div className="p-4 bg-gray-50 border-b">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium text-gray-900">Submission Overview</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Show status based on:</span>
                  <select 
                    value={statusMode} 
                    onChange={(e) => setStatusMode(e.target.value as 'best' | 'latest')}
                    className="text-xs border text-black border-gray-300 rounded px-2 py-1"
                  >
                    <option value="latest">Latest solution</option>
                    <option value="best">Best solution</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalStudents}</div>
                  <div className="text-sm text-gray-500">Students</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{stats.passedStudents}</div>
                  <div className="text-sm text-gray-500">Passed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">{stats.failedStudents}</div>
                  <div className="text-sm text-gray-500">Failed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{stats.totalSubmissions}</div>
                  <div className="text-sm text-gray-500">Total Submissions</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
            {/* Users List */}
            <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Students ({userGroups.length})
                </h3>
                
                {loading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                ) : userGroups.length === 0 ? (
                  <div className="text-center py-8">
                    <CodeBracketIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No submissions yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {userGroups.map(userGroup => (
                      <button
                        key={userGroup.email}
                        onClick={() => {
                          setSelectedUser(userGroup);
                          setSelectedSubmission(null);
                          setTestResults(null);
                        }}
                        className={`w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                          selectedUser?.email === userGroup.email ? 'bg-white shadow-sm' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(userGroup.displaySubmission.passed)}
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {userGroup.email}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              <p className={`text-xs font-medium ${getStatusColor(userGroup.displaySubmission.passed)}`}>
                                {userGroup.displaySubmission.passed ? 'PASSED' : 'FAILED'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {userGroup.submissions.length} submission{userGroup.submissions.length !== 1 ? 's' : ''}
                              </p>
                              {statusMode === 'best' && userGroup.displaySubmission !== userGroup.latestSubmission && (
                                <p className="text-xs text-blue-600 font-medium">
                                  BEST
                                </p>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {statusMode === 'best' && userGroup.displaySubmission !== userGroup.latestSubmission 
                                ? `Best: ${new Date(userGroup.displaySubmission.submitted_at).toLocaleString()}`
                                : `Latest: ${new Date(userGroup.latestSubmission.submitted_at).toLocaleString()}`
                              }
                            </p>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* User's Submissions */}
            <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
              {!selectedUser ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <CodeBracketIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      Select a student to view their submissions
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    {selectedUser.email} ({selectedUser.submissions.length} submission{selectedUser.submissions.length !== 1 ? 's' : ''})
                  </h3>
                  
                  <div className="space-y-2">
                    {selectedUser.submissions.map((submission, index) => (
                      <button
                        key={submission.id}
                        onClick={() => loadTestResults(submission)}
                        className={`w-full text-left p-3 rounded-lg hover:bg-white hover:shadow-sm transition-all ${
                          selectedSubmission?.id === submission.id ? 'bg-white shadow-sm' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              {getStatusIcon(submission.passed)}
                              <p className="text-sm font-medium text-gray-900">
                                Attempt #{selectedUser.submissions.length - index}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 mt-1">
                              <p className={`text-xs font-medium ${getStatusColor(submission.passed)}`}>
                                {submission.passed ? 'PASSED' : 'FAILED'}
                              </p>
                              {submission.execution_time && (
                                <div className="flex items-center text-xs text-gray-500">
                                  <ClockIcon className="h-3 w-3 mr-1" />
                                  {submission.execution_time.toFixed(2)}s
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              {new Date(submission.submitted_at).toLocaleString()}
                            </p>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Test Results */}
            <div className="flex-1 flex flex-col">
              {!selectedSubmission ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <CodeBracketIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      {!selectedUser 
                        ? "Select a student to view their submissions"
                        : "Select a submission to view test results"
                      }
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-900">
                      Test Results - {selectedSubmission.user_email}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Submitted {new Date(selectedSubmission.submitted_at).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4">
                    {testResultsLoading ? (
                      <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    ) : testResults ? (
                      <div className="space-y-4">
                        {/* Test Summary */}
                        <div className={`p-3 rounded-lg ${
                          testResults.test_results.all_passed 
                            ? 'bg-green-50 border border-green-200' 
                            : 'bg-red-50 border border-red-200'
                        }`}>
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(testResults.test_results.all_passed)}
                            <span className={`font-medium ${getStatusColor(testResults.test_results.all_passed)}`}>
                              {testResults.test_results.message}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {testResults.test_results.passed_tests}/{testResults.test_results.total_tests} tests passed
                          </div>
                        </div>

                        {/* Failed Tests Details */}
                        {!testResults.test_results.all_passed && (
                          <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-red-800">Failed Tests:</h4>
                            {testResults.test_results.test_results
                              .filter(test => !test.passed)
                              .map(test => (
                                <div key={test.test_id} className="bg-white border border-red-200 rounded p-3 text-sm">
                                  <div className="font-medium text-red-700 mb-2">
                                    Test Case {test.test_id}
                                  </div>
                                  
                                  <div className="space-y-2">
                                    <div>
                                      <span className="font-medium text-gray-700">Input: </span>
                                      <code className="bg-gray-100 text-black px-1 py-0.5 rounded text-xs">
                                        {JSON.stringify(test.parameters)}
                                      </code>
                                    </div>
                                    
                                    <div>
                                      <span className="font-medium text-gray-700">Expected: </span>
                                      <code className="bg-gray-100 text-black px-1 py-0.5 rounded text-xs">
                                        {JSON.stringify(test.expected_output)}
                                      </code>
                                    </div>
                                    
                                    {test.actual_output !== null && (
                                      <div>
                                        <span className="font-medium text-gray-700">Got: </span>
                                        <code className="bg-red-100 text-black px-1 py-0.5 rounded text-xs">
                                          {JSON.stringify(test.actual_output)}
                                        </code>
                                      </div>
                                    )}
                                    
                                    {test.error && (
                                      <div>
                                        <span className="font-medium text-red-700">Error: </span>
                                        <div className="bg-red-50 p-2 rounded text-xs font-mono whitespace-pre-wrap text-red-800">
                                          {test.error}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        )}

                        {/* Analysis Section */}
                        {testResults.analysis && (
                          <div className="space-y-3">
                            <div className="flex items-center space-x-2">
                              <DocumentTextIcon className="h-4 w-4 text-blue-600" />
                              <h4 className="text-sm font-semibold text-blue-800">Submission Analysis:</h4>
                            </div>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <div className="text-sm text-blue-900 whitespace-pre-wrap">
                                {testResults.analysis}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Student's Code */}
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Submitted Code:</h4>
                          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto">
                            <pre>{testResults.code}</pre>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500">Failed to load test results</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
