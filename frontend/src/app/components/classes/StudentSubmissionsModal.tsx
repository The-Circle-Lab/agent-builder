"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { 
  XMarkIcon, 
  CodeBracketIcon, 
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  LockClosedIcon,
  LockOpenIcon
} from '@heroicons/react/24/outline';
import { DeploymentAPI, StudentSubmission, SubmissionSummary, SubmissionTestResults, AllProblemsInfo, ProblemInfo } from '../agentBuilder/scripts/deploymentAPI';
import { API_CONFIG } from '@/lib/constants';

interface StudentGrade {
  user_id: number;
  email: string;
  points_earned: number;
  total_points: number;
  percentage: number;
  calculated_at: string;
}

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
  const [deploymentOpen, setDeploymentOpen] = useState(true);
  const [stateChanging, setStateChanging] = useState(false);
  
  // Problem selector state
  const [allProblemsInfo, setAllProblemsInfo] = useState<AllProblemsInfo | null>(null);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);
  const [problemsLoading, setProblemsLoading] = useState(false);
  
  // Grade calculation state
  const [gradingMethod, setGradingMethod] = useState<'problem_correct' | 'test_cases_correct'>('problem_correct');
  const [gradeLoading, setGradeLoading] = useState(false);
  const [currentGrade, setCurrentGrade] = useState<[number, number] | null>(null);

  // Function definitions
  const loadProblemsInfo = useCallback(async () => {
    try {
      setProblemsLoading(true);
      const problemsInfo = await DeploymentAPI.getAllProblemsInfo(deploymentId);
      setAllProblemsInfo(problemsInfo);
      setSelectedProblemIndex(0); // Start with first problem
    } catch (err) {
      console.error('Error loading problems info:', err);
      // If it fails, might be a single-problem deployment, proceed with default
      setAllProblemsInfo({ deployment_id: deploymentId, problem_count: 1, problems: [] });
    } finally {
      setProblemsLoading(false);
    }
  }, [deploymentId]);

  const loadSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading submissions for deployment:', deploymentId, 'problem:', selectedProblemIndex);
      const summary = await DeploymentAPI.getStudentSubmissions(deploymentId, selectedProblemIndex);
      console.log('Received submission summary:', summary);
      setSubmissionSummary(summary);
    } catch (err) {
      console.error('Error loading submissions:', err);
      setError(err instanceof Error ? err.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [deploymentId, selectedProblemIndex]);

  const loadCurrentGrade = useCallback(async () => {
    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/grade`, {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.grade) {
          setCurrentGrade(result.grade);
        }
      }
    } catch (err) {
      console.error('Error loading current grade:', err);
      // Don't show error for this, just fail silently
    }
  }, [deploymentId]);

  const loadStudentGrades = useCallback(async () => {
    try {
      setGradesLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/student-grades?grading_method=${gradingMethod}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        setStudentGrades(result.student_grades || []);
      }
    } catch (err) {
      console.error('Error loading student grades:', err);
    } finally {
      setGradesLoading(false);
    }
  }, [deploymentId, gradingMethod]);

  // Effects
  useEffect(() => {
    loadProblemsInfo();
    loadCurrentGrade();
    loadStudentGrades();
  }, [loadProblemsInfo, loadCurrentGrade, loadStudentGrades]);

  useEffect(() => {
    if (allProblemsInfo) {
      loadSubmissions();
    }
  }, [selectedProblemIndex, allProblemsInfo, loadSubmissions]);

  useEffect(() => {
    loadStudentGrades();
  }, [loadStudentGrades]);

  const handleProblemSelect = (index: number) => {
    setSelectedProblemIndex(index);
    // Clear current selection when switching problems
    setSelectedUser(null);
    setSelectedSubmission(null);
    setTestResults(null);
  };

  const loadTestResults = async (submission: StudentSubmission) => {
    try {
      setTestResultsLoading(true);
      setSelectedSubmission(submission);
      const results = await DeploymentAPI.getSubmissionTestResults(deploymentId, submission.id, selectedProblemIndex);
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
    
    // Calculate attempts to success ratio
    const studentsWithSuccess = userGroups.filter(group => 
      group.submissions.some(submission => submission.passed)
    );
    
    const ratios = studentsWithSuccess.map(group => {
      const totalAttempts = group.submissions.length;
      const successfulAttempts = group.submissions.filter(s => s.passed).length;
      return totalAttempts / successfulAttempts;
    });
    
    const averageAttemptsPerSuccess = ratios.length > 0 
      ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length 
      : 0;
    
    return {
      totalStudents: userGroups.length,
      passedStudents,
      failedStudents,
      totalSubmissions: submissionSummary?.total_submissions || 0,
      averageAttemptsPerSuccess: Math.round(averageAttemptsPerSuccess * 10) / 10 // Round to 1 decimal place
    };
  }, [userGroups, submissionSummary?.total_submissions]);

  // Cohort summary state
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [cohortSummary, setCohortSummary] = React.useState<string | null>(null);

  const fetchCohortSummary = async () => {
    if (!submissionSummary?.problem_id) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const res = await fetch(`${API_CONFIG.BASE_URL}/api/summary/problem/${submissionSummary.problem_id}/summary`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // Assume { short_summary, detailed_breakdown }
      setCohortSummary(data.detailed_breakdown || data.short_summary || "No summary available");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSummaryError(err.message);
      } else {
        setSummaryError("Failed to fetch summary");
      }
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleToggleDeploymentState = async () => {
    try {
      setStateChanging(true);
      
      const endpoint = deploymentOpen ? 'close' : 'open';
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setDeploymentOpen(result.is_open);

    } catch (err) {
      console.error('Failed to toggle deployment state:', err);
      alert(err instanceof Error ? err.message : 'Failed to toggle deployment state');
    } finally {
      setStateChanging(false);
    }
  };

  const handleCalculateGrade = async () => {
    try {
      setGradeLoading(true);
      const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/calculate-grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          grading_method: gradingMethod
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();
      setCurrentGrade(result.grade);
      
      // Load individual student grades after calculation
      loadStudentGrades();
      
      const classAverage = result.details?.class_summary?.class_average || 0;
      alert(`Grades calculated! Class average: ${classAverage.toFixed(1)}%`);

    } catch (err) {
      console.error('Failed to calculate grade:', err);
      alert(err instanceof Error ? err.message : 'Failed to calculate grade');
    } finally {
      setGradeLoading(false);
    }
  };

  // Student grades state
  const [studentGrades, setStudentGrades] = useState<StudentGrade[]>([]);
  const [gradesLoading, setGradesLoading] = useState(false);

  console.log('User groups:', userGroups);

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-7xl w-full h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">
              Student Submissions - {deploymentName}
              {allProblemsInfo && allProblemsInfo.problem_count > 1 && allProblemsInfo.problems[selectedProblemIndex] && (
                <span className="text-sm text-gray-600 font-normal ml-2">
                  (Problem {selectedProblemIndex + 1}: {allProblemsInfo.problems[selectedProblemIndex].function_name})
                </span>
              )}
            </Dialog.Title>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleToggleDeploymentState}
                disabled={stateChanging}
                className={`p-2 rounded disabled:opacity-50 ${
                  deploymentOpen
                    ? 'text-green-600 hover:text-green-700 hover:bg-green-50' 
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
                }`}
                title={deploymentOpen ? 'Close deployment' : 'Open deployment'}
              >
                {deploymentOpen ? (
                  <LockOpenIcon className="h-5 w-5" />
                ) : (
                  <LockClosedIcon className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Stats Summary */}
          {submissionSummary && (
            <div className="p-4 bg-gray-50 border-b">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium text-gray-900">Submission Overview</h3>
                <div className="flex items-center space-x-4">
                  {/* Problem Selector */}
                  {allProblemsInfo && allProblemsInfo.problem_count > 1 && (
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-500">Problem:</span>
                      <select 
                        value={selectedProblemIndex} 
                        onChange={(e) => handleProblemSelect(parseInt(e.target.value))}
                        className="text-xs border text-black border-gray-300 rounded px-2 py-1"
                        disabled={problemsLoading}
                      >
                        {allProblemsInfo.problems.map((problem: ProblemInfo, index: number) => (
                          <option key={index} value={index}>
                            {index + 1}. {problem.function_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <button
                    onClick={fetchCohortSummary}
                    disabled={summaryLoading}
                    className={`text-xs px-3 py-1 rounded ${summaryLoading ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                  >
                    {summaryLoading ? 'Generating...' : 'Generate Summary'}
                  </button>
                  
                  {/* Grade Calculator */}
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Grade by:</span>
                    <select 
                      value={gradingMethod} 
                      onChange={(e) => setGradingMethod(e.target.value as 'problem_correct' | 'test_cases_correct')}
                      className="text-xs border text-black border-gray-300 rounded px-2 py-1"
                    >
                      <option value="problem_correct">Problem completion</option>
                      <option value="test_cases_correct">Test case completion</option>
                    </select>
                    <button
                      onClick={handleCalculateGrade}
                      disabled={gradeLoading}
                      className={`text-xs px-3 py-1 rounded ${gradeLoading ? 'bg-gray-200 text-gray-400' : 'bg-green-600 text-white hover:bg-green-700'}`}
                    >
                      {gradeLoading ? 'Calculating...' : 'Calculate Grade'}
                    </button>
                    {currentGrade && (
                      <span className="text-xs font-medium text-green-700">
                        Grade: {currentGrade[0]}/{currentGrade[1]} ({((currentGrade[0] / currentGrade[1]) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  
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
              </div>
              <div className="grid grid-cols-5 gap-4 text-center">
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
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.averageAttemptsPerSuccess > 0 ? stats.averageAttemptsPerSuccess : '—'}
                  </div>
                  <div className="text-sm text-gray-500">Avg Attempts/Success</div>
                </div>
              </div>
            </div>
          )}

          {/* Cohort Summary Output */}
          {cohortSummary && (
            <div className="mt-4 p-4 text-black bg-white border border-blue-200 rounded max-h-60 overflow-y-auto whitespace-pre-wrap text-sm">
              {cohortSummary}
            </div>
          )}
          {summaryError && (
            <p className="mt-2 text-xs text-red-600">{summaryError}</p>
          )}

          {/* Individual Student Grades */}
          {studentGrades.length > 0 && (
            <div className="mt-4 p-4 bg-white border border-gray-200 rounded">
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Individual Student Grades ({gradingMethod === 'problem_correct' ? 'Problem Completion' : 'Test Case Completion'})
              </h4>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Student</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Points Earned</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Total Points</th>
                      <th className="text-center py-2 px-3 font-medium text-gray-700">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gradesLoading ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4">
                          <div className="flex justify-center">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      studentGrades.map((grade) => (
                        <tr key={grade.user_id} className="border-b border-gray-100">
                          <td className="py-2 px-3 text-gray-900">{grade.email}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{grade.points_earned}</td>
                          <td className="py-2 px-3 text-center text-gray-700">{grade.total_points}</td>
                          <td className="py-2 px-3 text-center">
                            <span className={`font-medium ${
                              grade.percentage >= 80 ? 'text-green-600' :
                              grade.percentage >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {grade.percentage.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
                
                {(loading || problemsLoading) ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="ml-2 text-sm text-gray-600">
                      {problemsLoading ? 'Loading problems...' : 'Loading submissions...'}
                    </p>
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
                              <p className={`text-xs ${getStatusColor(userGroup.displaySubmission.passed)}`}>
                                {userGroup.displaySubmission.passed ? 'Passed' : 'Failed'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {userGroup.submissions.length} submission{userGroup.submissions.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submissions List */}
            <div className="w-1/3 border-r overflow-y-auto">
              {selectedUser ? (
                <div className="p-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">
                    Submissions for {selectedUser.email}
                  </h3>
                  <div className="space-y-2">
                    {selectedUser.submissions.map((submission, index) => (
                      <button
                        key={submission.id}
                        onClick={() => loadTestResults(submission)}
                        className={`w-full text-left p-3 rounded-lg border hover:bg-gray-50 transition-all ${
                          selectedSubmission?.id === submission.id ? 'bg-blue-50 border-blue-200' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(submission.passed)}
                            <span className="text-sm font-medium text-gray-900">
                              Attempt #{selectedUser.submissions.length - index}
                            </span>
                          </div>
                          <ClockIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <p className={`text-xs ${getStatusColor(submission.passed)}`}>
                          {submission.passed ? 'Passed' : submission.error || 'Failed'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(submission.submitted_at).toLocaleString()}
                        </p>
                        {submission.execution_time && (
                          <p className="text-xs text-gray-500">
                            {submission.execution_time.toFixed(2)}s
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <CodeBracketIcon className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm">Select a student to view their submissions</p>
                </div>
              )}
            </div>

            {/* Test Results Panel */}
            <div className="flex-1 overflow-y-auto">
              {selectedSubmission ? (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-900">
                      Test Results
                    </h3>
                    {selectedSubmission.passed ? (
                      <div className="flex items-center space-x-1 text-green-600">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">All Tests Passed</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1 text-red-600">
                        <XCircleIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Tests Failed</span>
                      </div>
                    )}
                  </div>

                  {testResultsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    </div>
                  ) : testResults ? (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-700">
                          {testResults.test_results.passed_tests} of {testResults.test_results.total_tests} tests passed
                        </p>
                        {testResults.test_results.analysis && (
                          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <div className="flex items-start space-x-2">
                              <DocumentTextIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm font-medium text-blue-900 mb-1">Analysis</p>
                                <p className="text-sm text-blue-800">{testResults.test_results.analysis}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Individual Test Results */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Individual Test Results</h4>
                        <div className="space-y-2">
                          {testResults.test_results.test_results.map((result) => (
                            <div
                              key={result.test_id}
                              className={`p-3 rounded-lg border ${
                                result.passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-900">
                                  Test #{result.test_id}
                                </span>
                                {getStatusIcon(result.passed)}
                              </div>
                              <div className="text-sm text-gray-600 space-y-1">
                                <p><strong>Input:</strong> {JSON.stringify(result.parameters)}</p>
                                <p><strong>Expected:</strong> {JSON.stringify(result.expected_output)}</p>
                                <p><strong>Actual:</strong> {JSON.stringify(result.actual_output)}</p>
                                {result.error && (
                                  <p className="text-red-600"><strong>Error:</strong> {result.error}</p>
                                )}
                                {result.execution_time && (
                                  <p><strong>Time:</strong> {result.execution_time.toFixed(3)}s</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Code */}
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 mb-2">Submitted Code</h4>
                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm overflow-x-auto">
                          <code>{selectedSubmission.code}</code>
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">Failed to load test results</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <DocumentTextIcon className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm">Select a submission to view test results</p>
                </div>
              )}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
