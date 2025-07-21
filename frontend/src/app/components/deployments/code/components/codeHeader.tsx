import React from "react";
import { ProblemInfo } from "../../../../../lib/codeDeploymentAPI";
import ProblemSelector from "./problemSelector";

interface CodeHeaderProps {
  workflowName: string;
  saveStatus: "saved" | "saving" | "unsaved";
  lastSaved: string;
  testLoading: boolean;
  hasCode: boolean;
  onBack: () => void;
  onRunTests: () => void;
  // Problem selector props
  problems?: ProblemInfo[];
  selectedProblemIndex?: number;
  onProblemSelect?: (index: number) => void;
  problemsLoading?: boolean;
}

export default function CodeHeader({ 
  workflowName, 
  saveStatus, 
  lastSaved, 
  testLoading, 
  hasCode, 
  onBack, 
  onRunTests,
  problems = [],
  selectedProblemIndex = 0,
  onProblemSelect,
  problemsLoading = false
}: CodeHeaderProps) {
  return (
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

          {/* Center - Problem Selector */}
          <div className="flex-1 flex justify-center max-w-xs mx-8">
            {onProblemSelect && (
              <ProblemSelector
                problems={problems}
                selectedProblemIndex={selectedProblemIndex}
                onProblemSelect={onProblemSelect}
                loading={problemsLoading}
                compact={true}
              />
            )}
          </div>
          
          <button
            onClick={onRunTests}
            disabled={testLoading || !hasCode}
            className={`px-6 py-2 rounded-lg font-medium transition duration-200 flex items-center space-x-2 ${
              testLoading || !hasCode
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
  );
} 
