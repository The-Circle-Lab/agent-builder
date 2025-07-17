import { ProblemInfo, DetailedCodeTestResult } from "../../agentBuilder/scripts/deploymentAPI";
import TestResultDisplay from "./TestResultDisplay";
import ErrorDisplay from "./ErrorDisplay";

interface ProblemPanelProps {
  problemInfo: ProblemInfo;
  testResult: DetailedCodeTestResult | null;
  analysisPending: boolean;
  error: string;
  onDismissError: () => void;
  containsChat: boolean;
}

export default function ProblemPanel({ 
  problemInfo, 
  testResult, 
  analysisPending, 
  error, 
  onDismissError, 
  containsChat 
}: ProblemPanelProps) {
  return (
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
            <TestResultDisplay testResult={testResult} analysisPending={analysisPending} />
          )}

          {/* Error Display */}
          <ErrorDisplay error={error} onDismiss={onDismissError} />
        </div>
      </div>
    </div>
  );
} 
