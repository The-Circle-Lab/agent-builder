export interface DeploymentRequest {
  workflow_name: string;
  workflow_id: number;
  workflow_data: Record<string, unknown>;
}

export interface DeploymentResponse {
  deployment_id: string;
  chat_url: string;
  message: string;
  grade?: [number, number] | null;
  configuration: {
    model: string;
    has_rag: boolean;
    collection?: string;
  };
  type?: 'chat' | 'code' | 'mcq';
}

export interface ChatMessage {
  message: string;
  history: string[][];
  conversation_id?: number;
}

export interface ChatResponse {
  response: string;
  sources: string[];
  conversation_id?: number;
}

export interface ActiveDeployment {
  deployment_id: string;
  workflow_name: string;
  created_at: string;
  chat_url: string;
  grade?: [number, number] | null;
  configuration: {
    model: string;
    has_rag: boolean;
  };
  type?: 'chat' | 'code' | 'mcq';
}

export interface DebugAuthResponse {
  authenticated: boolean;
  user_id: number;
  user_email: string;
  message: string;
}

export interface ConversationCreateRequest {
  title?: string;
}

export interface ConversationResponse {
  id: number;
  deployment_id: string;
  title: string;
  workflow_name: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface MessageResponse {
  id: number;
  message_text: string;
  is_user_message: boolean;
  sources?: string[];
  created_at: string;
}

export interface ProblemInfo {
  problem_index?: number;
  function_name: string;
  description: string;
  parameter_names: string[];
}

export interface AllProblemsInfo {
  deployment_id: string;
  problem_count: number;
  problems: ProblemInfo[];
}

export interface ProblemCountResponse {
  deployment_id: string;
  problem_count: number;
}

export interface CodeTestResult {
  deployment_id: string;
  passed: boolean;
  message: string;
}

export interface TestCaseResult {
  test_id: number;
  parameters: unknown[];
  expected_output: unknown;
  actual_output: unknown | null;
  passed: boolean;
  error: string | null;
  execution_time: number | null;
}

export interface DetailedCodeTestResult {
  deployment_id: string;
  all_passed: boolean;
  message: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  test_results: TestCaseResult[];
  submission_id?: number;
  analysis?: string | null;
  analysis_enabled?: boolean;
}

export interface CodeSaveRequest {
  code: string;
  problem_index?: number;
}

export interface CodeSaveResponse {
  deployment_id: string;
  problem_index?: number;
  message: string;
  saved_at: string;
}

export interface CodeLoadResponse {
  deployment_id: string;
  code: string;
  last_saved: string;
}

export interface StudentSubmission {
  id: number;
  user_id: number;
  user_email: string;
  code: string;
  status: string;
  execution_time: number | null;
  error: string | null;
  submitted_at: string;
  passed: boolean;
}

export interface SubmissionSummary {
  deployment_id: string;
  deployment_name: string;
  problem_id: number | null;
  problem_title: string;
  problem_description: string;
  problem_info: ProblemInfo | null;
  latest_submissions: StudentSubmission[];
  all_submissions: StudentSubmission[];
  student_count: number;
  total_submissions: number;
  passed_students: number;
  failed_students: number;
}

export interface SubmissionTestResults {
  submission_id: number;
  deployment_id: string;
  user_email: string;
  user_id: number;
  submitted_at: string;
  status: string;
  execution_time: number | null;
  code: string;
  analysis: string | null;
  test_results: DetailedCodeTestResult;
}

// Response for analysis polling
export interface CodeAnalysisResponse {
  submission_id: number;
  deployment_id: string;
  analysis: string | null;
}

import { apiClient } from '@/lib/apiClient';
import { ROUTES } from '@/lib/constants';
import { isDevelopment } from '@/lib/utils';

export class DeploymentAPI {
  static async deployWorkflow(
    workflowName: string,
    workflowId: number,
    workflowData: Record<string, unknown>
  ): Promise<DeploymentResponse> {
    if (!workflowName?.trim()) {
      throw new Error('Workflow name is required');
    }
    
    if (!workflowId || workflowId < 1) {
      throw new Error('Valid workflow ID is required');
    }

    const response = await apiClient.post<DeploymentResponse>(`${ROUTES.DEPLOYMENTS}/`, {
      workflow_name: workflowName,
      workflow_id: workflowId,
      workflow_data: workflowData
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No deployment data received');
    }

    return response.data;
  }

  static async chatWithDeployment(
    deploymentId: string,
    message: string,
    history: string[][] = [],
    conversationId?: number
  ): Promise<ChatResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }
    
    if (!message?.trim()) {
      throw new Error('Message cannot be empty');
    }

    const response = await apiClient.post<ChatResponse>(`${ROUTES.DEPLOYMENTS}/chat/${deploymentId}`, {
      message,
      history,
      conversation_id: conversationId
    });

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No chat response received');
    }

    return response.data;
  }

  static async getActiveDeployments(): Promise<{ deployments: ActiveDeployment[] }> {
    const response = await apiClient.get<{ deployments: ActiveDeployment[] }>(`${ROUTES.DEPLOYMENTS}/active`);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No deployments data received');
    }

    return response.data;
  }

  static async deleteDeployment(deploymentId: string): Promise<{ message: string }> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.delete<{ message: string }>(`${ROUTES.DEPLOYMENTS}/${deploymentId}`);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No response data received');
    }

    return response.data;
  }

  // Debug function to test authentication
  static async debugAuth(): Promise<DebugAuthResponse> {
    const response = await apiClient.get<DebugAuthResponse>(`${ROUTES.DEPLOYMENTS}/debug/auth`);

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No debug data received');
    }

    return response.data;
  }

  // Create new conversation for a deployment
  static async createConversation(
    deploymentId: string,
    title?: string
  ): Promise<ConversationResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (isDevelopment()) {
      console.log('Creating conversation for deployment:', deploymentId, 'with title:', title);
    }
    
    const response = await apiClient.post<ConversationResponse>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/conversations`,
      { title }
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No conversation data received');
    }

    if (isDevelopment()) {
      console.log('Created conversation:', response.data);
    }

    return response.data;
  }

  // Get all conversations for a deployment
  static async getConversations(deploymentId: string): Promise<ConversationResponse[]> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (isDevelopment()) {
      console.log('Getting conversations for deployment:', deploymentId);
    }
    
    const response = await apiClient.get<ConversationResponse[]>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/conversations`
    );
    
    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No conversations data received');
    }

    if (isDevelopment()) {
      console.log('Retrieved conversations:', response.data);
    }

    return response.data;
  }

  // Get messages for a specific conversation
  static async getConversationMessages(
    deploymentId: string,
    conversationId: number
  ): Promise<MessageResponse[]> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }
    
    if (!conversationId || conversationId < 1) {
      throw new Error('Valid conversation ID is required');
    }

    const response = await apiClient.get<MessageResponse[]>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/conversations/${conversationId}/messages`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No messages data received');
    }

    return response.data;
  }

  // Delete a conversation
  static async deleteConversation(
    deploymentId: string,
    conversationId: number
  ): Promise<{ message: string }> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }
    
    if (!conversationId || conversationId < 1) {
      throw new Error('Valid conversation ID is required');
    }

    const response = await apiClient.delete<{ message: string }>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/conversations/${conversationId}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No response data received');
    }

    return response.data;
  }

  // Get deployment type
  static async getDeploymentType(deploymentId: string): Promise<{ deployment_id: string; type: string }> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<{ deployment_id: string; type: string }>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/type`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No type data received');
    }

    return response.data;
  }

  // Check if deployment contains chat
  static async containsChat(deploymentId: string): Promise<{ deployment_id: string; contains_chat: boolean }> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<{ deployment_id: string; contains_chat: boolean }>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/contains-chat`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No contains chat data received');
    }

    return response.data;
  }

  // Get problem info for specific problem in code deployment
  static async getProblemInfo(deploymentId: string, problemIndex: number = 0): Promise<{ deployment_id: string; problem_info: ProblemInfo }> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<{ deployment_id: string; problem_info: ProblemInfo }>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/problem-info?problem_index=${problemIndex}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No problem info received');
    }

    return response.data;
  }

  // Get all problems info for code deployment
  static async getAllProblemsInfo(deploymentId: string): Promise<AllProblemsInfo> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<AllProblemsInfo>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/problems-info`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No problems info received');
    }

    return response.data;
  }

  // Get problem count for code deployment
  static async getProblemCount(deploymentId: string): Promise<ProblemCountResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<ProblemCountResponse>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/problem-count`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No problem count received');
    }

    return response.data;
  }

  // Run tests for specific problem in code deployment
  static async runTests(deploymentId: string, code: string, problemIndex: number = 0): Promise<DetailedCodeTestResult> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!code?.trim()) {
      throw new Error('Code is required');
    }

    const response = await apiClient.post<DetailedCodeTestResult>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/run-tests?problem_index=${problemIndex}`,
      { code }
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No test result received');
    }

    return response.data;
  }

  // Fetch analysis for a submission (student or instructor)
  static async getSubmissionAnalysis(
    deploymentId: string,
    submissionId: number,
  ): Promise<CodeAnalysisResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }
    if (!submissionId || submissionId < 1) {
      throw new Error('Valid submission ID is required');
    }

    const response = await apiClient.get<CodeAnalysisResponse>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/submissions/${submissionId}/analysis`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No analysis data received');
    }

    return response.data;
  }

  // Save code for specific problem in code deployment
  static async saveCode(deploymentId: string, code: string, problemIndex: number = 0): Promise<CodeSaveResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!code?.trim()) {
      throw new Error('Code is required');
    }

    const response = await apiClient.post<CodeSaveResponse>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/save-code`,
      { code, problem_index: problemIndex }
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No save response received');
    }

    return response.data;
  }

  // Load code for specific problem in code deployment
  static async loadCode(deploymentId: string, problemIndex: number = 0): Promise<CodeLoadResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<CodeLoadResponse>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/load-code?problem_index=${problemIndex}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No load response received');
    }

    return response.data;
  }

  // Get student submissions for code deployment (instructors only)
  static async getStudentSubmissions(deploymentId: string, problemIndex: number = 0): Promise<SubmissionSummary> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await apiClient.get<SubmissionSummary>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/submissions?problem_index=${problemIndex}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No submissions data received');
    }

    return response.data;
  }

  // Get detailed test results for a specific submission (instructors only)
  static async getSubmissionTestResults(deploymentId: string, submissionId: number, problemIndex: number = 0): Promise<SubmissionTestResults> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!submissionId || submissionId < 1) {
      throw new Error('Valid submission ID is required');
    }

    const response = await apiClient.get<SubmissionTestResults>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/submissions/${submissionId}/test-results?problem_index=${problemIndex}`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No test results received');
    }

    return response.data;
  }
} 
