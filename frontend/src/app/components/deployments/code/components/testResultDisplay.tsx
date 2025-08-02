import { DetailedCodeTestResult } from "../../../../../lib/deploymentAPIs/codeDeploymentAPI";

interface TestResultDisplayProps {
  testResult: DetailedCodeTestResult;
  analysisPending: boolean;
}

export default function TestResultDisplay({ testResult, analysisPending }: TestResultDisplayProps) {
  return (
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

      {/* Analysis */}
      {testResult.analysis_enabled && analysisPending && (
        <div className="flex items-center space-x-2 text-sm text-blue-600 mb-3">
          <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
          <span>Generating feedback with AI...</span>
        </div>
      )}
      {testResult.analysis_enabled && testResult.analysis && (
        <div className="mt-4 p-3 text-black bg-gray-50 border border-gray-200 rounded text-sm whitespace-pre-wrap">
          {testResult.analysis}
        </div>
      )}

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
  );
} 
