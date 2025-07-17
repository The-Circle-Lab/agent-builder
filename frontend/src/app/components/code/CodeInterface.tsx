"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { DeploymentAPI, ProblemInfo, DetailedCodeTestResult, AllProblemsInfo } from "../agentBuilder/scripts/deploymentAPI";
import ChatInterface from "../chat/ChatInterface";
import { CodeHeader, CodeEditor, TestResultDisplay } from "./components";

interface CodeInterfaceProps {
  deploymentId: string;
  workflowName: string;
  onBack: () => void;
}

export default function CodeInterface({ deploymentId, workflowName, onBack }: CodeInterfaceProps) {
  const [allProblemsInfo, setAllProblemsInfo] = useState<AllProblemsInfo | null>(null);
  const [selectedProblemIndex, setSelectedProblemIndex] = useState<number>(0);
  const [currentProblemInfo, setCurrentProblemInfo] = useState<ProblemInfo | null>(null);
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<DetailedCodeTestResult | null>(null);
  const [analysisPending, setAnalysisPending] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [containsChat, setContainsChat] = useState<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAllProblemsInfo();
    checkChatAvailability();
  }, [deploymentId]);

  // When selected problem changes, load the specific problem info and code
  useEffect(() => {
    if (allProblemsInfo && allProblemsInfo.problems.length > selectedProblemIndex) {
      loadSpecificProblemInfo(selectedProblemIndex);
    }
  }, [selectedProblemIndex, allProblemsInfo, deploymentId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const checkChatAvailability = useCallback(async () => {
    try {
      const response = await fetch(`/api/deployments/${deploymentId}/chat-available`);
      if (response.ok) {
        const data = await response.json();
        setContainsChat(data.available);
      }
    } catch (err) {
      console.error("Error checking chat availability:", err);
    }
  }, [deploymentId]);

  const loadAllProblemsInfo = useCallback(async () => {
    setLoading(true);
    try {
      const response = await DeploymentAPI.getAllProblemsInfo(deploymentId);
      setAllProblemsInfo(response);
      setError("");
    } catch (err) {
      console.error("Failed to load problems info:", err);
      setError("Failed to load problems information. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  const generateStarterCode = (problemInfo: ProblemInfo): string => {
    const params = problemInfo.parameter_names.join(", ");
    return `def ${problemInfo.function_name}(${params}):
    # Write your solution here
    pass
`;
  };

  const loadSpecificProblemInfo = useCallback(async (problemIndex: number) => {
    try {
      const response = await DeploymentAPI.getProblemInfo(deploymentId, problemIndex);
      setCurrentProblemInfo(response.problem_info);
      
      // Load saved code for this problem
      const savedCode = await DeploymentAPI.loadCode(deploymentId, problemIndex);
      
      // Use saved code if available, otherwise generate starter code
      const codeToUse = savedCode.code || generateStarterCode(response.problem_info);
      
      setCode(codeToUse);
      setLastSaved(savedCode.last_saved || "");
      setSaveStatus(savedCode.code ? "saved" : "unsaved");
    } catch (err) {
      console.error("Failed to load problem info:", err);
      setError("Failed to load problem information. Please try again.");
    }
  }, [deploymentId]);

  const handleProblemSelect = async (index: number) => {
    if (index === selectedProblemIndex) return;
    
    // Save current code before switching if there are unsaved changes
    if (saveStatus === "unsaved" && code.trim()) {
      await saveCodeSilently(selectedProblemIndex); // Pass current problem index
    }
    
    // Clear UI state before loading new problem
    setTestResult(null); // Clear previous test results
    setError(""); // Clear any previous errors
    
    // Update selected index - this will trigger the useEffect to load the new problem
    setSelectedProblemIndex(index);
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    setSaveStatus("unsaved");
    
    // Clear any previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set a new timeout to save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(async () => {
      await saveCodeSilently();
    }, 2000);
  };

  const saveCodeSilently = async (problemIndex?: number) => {
    if (!currentProblemInfo) return;
    
    const indexToUse = problemIndex !== undefined ? problemIndex : selectedProblemIndex;
    
    setSaveStatus("saving");
    try {
      await DeploymentAPI.saveCode(deploymentId, code, indexToUse);
      setLastSaved(new Date().toISOString());
      setSaveStatus("saved");
    } catch (err) {
      console.error("Auto-save failed:", err);
      setSaveStatus("unsaved");
    }
  };

  const handleRunTests = async () => {
    if (!currentProblemInfo) return;
    
    setTestLoading(true);
    setTestResult(null);
    setError("");
    setAnalysisPending(true);
    
    try {
      const result = await DeploymentAPI.runTests(deploymentId, code, selectedProblemIndex);
      setTestResult(result);
    } catch (err) {
      console.error("Test run failed:", err);
      setError("Failed to run tests. Please try again.");
    } finally {
      setTestLoading(false);
      setAnalysisPending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading problem information...</p>
        </div>
      </div>
    );
  }

  if (!allProblemsInfo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">Failed to load problem information.</p>
          <button
            onClick={loadAllProblemsInfo}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const problems = allProblemsInfo?.problems || [];

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <CodeHeader
        workflowName={workflowName}
        saveStatus={saveStatus}
        lastSaved={lastSaved}
        testLoading={testLoading}
        hasCode={code.trim().length > 0}
        onBack={onBack}
        onRunTests={handleRunTests}
        problems={problems}
        selectedProblemIndex={selectedProblemIndex}
        onProblemSelect={handleProblemSelect}
        problemsLoading={loading}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Problem Info */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Problem Details */}
            {currentProblemInfo && (
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {currentProblemInfo.function_name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {currentProblemInfo.description}
                  </p>
                </div>
                
                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Parameters:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {currentProblemInfo.parameter_names.map((param, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-mono"
                      >
                        {param}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    <button
                      onClick={() => setError("")}
                      className="mt-2 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Test Results */}
            {testResult && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Test Results
                </h4>
                <TestResultDisplay 
                  testResult={testResult}
                  analysisPending={analysisPending}
                />
              </div>
            )}

            {/* Chat Interface */}
            {containsChat && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Chat Assistant
                </h4>
                <div className="max-h-96 overflow-hidden">
                  <ChatInterface 
                    deploymentId={deploymentId}
                    workflowName={`${workflowName} - Chat`}
                    onBack={() => {}}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Code Editor */}
        <div className="flex-1 flex flex-col bg-gray-900">
          <CodeEditor
            code={code}
            onChange={(value: string | undefined) => handleCodeChange(value || "")}
            containsChat={containsChat}
          />
        </div>
      </div>
    </div>
  );
} 
