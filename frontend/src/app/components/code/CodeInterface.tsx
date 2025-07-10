"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { DeploymentAPI, ProblemInfo, DetailedCodeTestResult } from "../agentBuilder/scripts/deploymentAPI";
import ChatInterface from "../chat/ChatInterface";

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface CodeInterfaceProps {
  deploymentId: string;
  workflowName: string;
  onBack: () => void;
}

export default function CodeInterface({ deploymentId, workflowName, onBack }: CodeInterfaceProps) {
  const [problemInfo, setProblemInfo] = useState<ProblemInfo | null>(null);
  const [code, setCode] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<DetailedCodeTestResult | null>(null);
  const [lastSaved, setLastSaved] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [containsChat, setContainsChat] = useState<boolean>(false);
  const editorRef = useRef<unknown>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProblemInfo();
    checkChatAvailability();
  }, [deploymentId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const checkChatAvailability = async () => {
    try {
      console.log(`[CodeInterface] Checking chat availability for deployment: ${deploymentId}`);
      
      const response = await DeploymentAPI.containsChat(deploymentId);
      
      console.log(`[CodeInterface] Chat availability response:`, response);
      
      // Explicitly check for the contains_chat property and ensure it's a boolean
      const hasChatSupport = Boolean(response?.contains_chat);
      setContainsChat(hasChatSupport);
      
      console.log(`[CodeInterface] Deployment ${deploymentId} contains chat: ${hasChatSupport}`);
      
    } catch (error) {
      console.warn(`[CodeInterface] Could not check chat availability for deployment ${deploymentId}:`, error);
      setContainsChat(false);
    }
  };

  const loadProblemInfo = async () => {
    try {
      setLoading(true);
      const response = await DeploymentAPI.getProblemInfo(deploymentId);
      setProblemInfo(response.problem_info);
      
      // Try to load previously saved code
      try {
        const savedCodeResponse = await DeploymentAPI.loadCode(deploymentId);
        if (savedCodeResponse.code) {
          setCode(savedCodeResponse.code);
          setLastSaved(savedCodeResponse.last_saved);
          setSaveStatus("saved");
        } else {
          // Generate starter code if no saved code exists
          const starterCode = generateStarterCode(response.problem_info);
          setCode(starterCode);
          setSaveStatus("unsaved");
        }
      } catch (loadError) {
        console.warn("Could not load saved code:", loadError);
        // Fallback to starter code
        const starterCode = generateStarterCode(response.problem_info);
        setCode(starterCode);
        setSaveStatus("unsaved");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to load problem info");
    } finally {
      setLoading(false);
    }
  };

  const generateStarterCode = (info: ProblemInfo): string => {
    const params = info.parameter_names.join(", ");
    return `def ${info.function_name}(${params}):
    # Write your solution here
    pass
`;
  };

  // Auto-save functionality
  const saveCode = useCallback(async (codeToSave: string) => {
    if (!codeToSave.trim()) return;
    
    try {
      setSaveStatus("saving");
      const response = await DeploymentAPI.saveCode(deploymentId, codeToSave);
      setLastSaved(response.saved_at);
      setSaveStatus("saved");
    } catch (error) {
      console.error("Failed to save code:", error);
      setSaveStatus("unsaved");
    }
  }, [deploymentId]);

  // Handle code changes with auto-save
  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || "";
    setCode(newCode);
    setSaveStatus("unsaved");
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save (save after 2 seconds of inactivity)
    saveTimeoutRef.current = setTimeout(() => {
      saveCode(newCode);
    }, 2000);
  }, [saveCode]);

  const handleRunTests = async () => {
    try {
      setTestLoading(true);
      setTestResult(null);
      const result = await DeploymentAPI.runTests(deploymentId, code);
      setTestResult(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to run tests");
    } finally {
      setTestLoading(false);
    }
  };

  const handleEditorDidMount = (editor: unknown) => {
    editorRef.current = editor;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="text-gray-600">Loading problem...</span>
        </div>
      </div>
    );
  }

  if (!problemInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load problem information</p>
          <button
            onClick={onBack}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="text-gray-600 hover:text-gray-900 flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back to Deployments</span>
              </button>
              
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{workflowName}</h1>
                <div className="flex items-center space-x-2">
                  <p className="text-sm text-gray-600">Code Challenge</p>
                  {/* Save Status Indicator */}
                  {saveStatus === "saving" && (
                    <span className="flex items-center text-xs text-yellow-600">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-yellow-600 mr-1"></div>
                      Saving...
                    </span>
                  )}
                  {saveStatus === "saved" && lastSaved && (
                    <span className="text-xs text-green-600">
                      ✓ Saved {new Date(lastSaved).toLocaleTimeString()}
                    </span>
                  )}
                  {saveStatus === "unsaved" && (
                    <span className="text-xs text-gray-500">
                      Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <button
              onClick={handleRunTests}
              disabled={testLoading || !code.trim()}
              className={`px-6 py-2 rounded-lg font-medium transition duration-200 flex items-center space-x-2 ${
                testLoading || !code.trim()
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {testLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Running Tests...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Run Tests</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Problem Description Panel */}
        <div className={`${containsChat ? 'w-1/4' : 'w-1/3'} bg-white border-r flex flex-col`}>
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Problem Description</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Function Name</h3>
                <p className="mt-1 text-lg font-mono text-gray-900">{problemInfo.function_name}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Description</h3>
                <p className="mt-1 text-gray-900 whitespace-pre-wrap">{problemInfo.description}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Parameters</h3>
                <ul className="mt-1 space-y-1">
                  {problemInfo.parameter_names.map((param, index) => (
                    <li key={index} className="flex items-center space-x-2">
                      <span className="text-black">•</span>
                      <code className="text-sm text-black bg-gray-100 px-2 py-1 rounded">{param}</code>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Test Result */}
              {testResult && (
                <div className={`mt-6 p-4 rounded-lg ${
                  testResult.all_passed 
                    ? "bg-green-50 border border-green-200" 
                    : "bg-red-50 border border-red-200"
                }`}>
                  <div className="flex items-center space-x-2 mb-3">
                    {testResult.all_passed ? (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <span className={`font-medium ${
                      testResult.all_passed ? "text-green-800" : "text-red-800"
                    }`}>
                      {testResult.message}
                    </span>
                  </div>
                  
                  {/* Test Summary */}
                  <div className="text-sm text-gray-600 mb-3">
                    {testResult.passed_tests}/{testResult.total_tests} tests passed
                  </div>

                  {/* Failed Test Details */}
                  {!testResult.all_passed && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-red-800">Failed Tests:</h4>
                      {testResult.test_results
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
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-red-800">{error}</p>
                      <button
                        onClick={() => setError("")}
                        className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Code Editor Panel */}
        <div className={`${containsChat ? 'w-1/2' : 'flex-1'} bg-gray-900`}>
          <MonacoEditor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={handleCodeChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              rulers: [80],
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              suggest: {
                showKeywords: true,
                showSnippets: true,
              },
            }}
          />
        </div>

        {/* 
          Chat Panel - Only rendered when backend confirms deployment contains chat support.
          The containsChat state is set by calling the /contains-chat endpoint during component initialization.
          If the deployment doesn't support chat, this panel won't be shown and the layout adjusts accordingly.
        */}
        {containsChat && (
          <div className="w-1/4 border-l">
            <ChatInterface
              deploymentId={deploymentId}
              workflowName={`${workflowName} - Chat`}
              onBack={() => {}} // No back functionality needed in embedded mode
              embedded={true}
            />
          </div>
        )}
      </div>
    </div>
  );
} 
