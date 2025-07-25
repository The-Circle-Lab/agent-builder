// Prompt deployment specific interfaces and functionality
export interface PromptSubmissionRequirement {
  prompt: string;
  mediaType: 'textarea' | 'hyperlink';
}

export interface PromptInfo {
  deployment_id: string;
  main_question: string;
  submission_requirements: PromptSubmissionRequirement[];
  total_submissions: number;
}

export interface PromptSubmissionResponse {
  submission_index: number;
  prompt_text: string;
  media_type: 'textarea' | 'hyperlink';
  user_response: string;
  submitted_at: string;
}

export interface PromptSession {
  session_id: number;
  deployment_id: string;
  main_question: string;
  submission_requirements: PromptSubmissionRequirement[];
  total_submissions: number;
  started_at: string;
  completed_at?: string;
  is_completed: boolean;
  submitted_responses?: PromptSubmissionResponse[];
}

export interface PromptSubmissionRequest {
  submission_index: number;
  response: string;
}

export interface PromptSubmissionResult {
  submission_index: number;
  prompt_text: string;
  media_type: string;
  user_response: string;
  submitted_at: string;
  is_valid: boolean;
  validation_error?: string;
}

export interface PromptInstructorSessionView {
  session_id: number;
  user_email: string;
  started_at: string;
  completed_at?: string;
  total_submissions: number;
  submitted_count: number;
  is_completed: boolean;
  progress_percentage: number;
}

export interface PromptInstructorSubmissionView {
  session_id: number;
  user_email: string;
  submissions: PromptSubmissionResponse[];
  completed_at?: string;
}

import { API_CONFIG } from '@/lib/constants';

export class PromptDeploymentAPI {
  // Get prompt deployment info
  static async getPromptInfo(deploymentId: string): Promise<PromptInfo> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/info`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Get or create prompt session (the backend POST endpoint handles both cases)
  static async getOrCreateSession(deploymentId: string): Promise<PromptSession> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/session`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Submit response for a specific submission requirement
  static async submitResponse(
    deploymentId: string,
    submissionRequest: PromptSubmissionRequest
  ): Promise<PromptSubmissionResult> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!submissionRequest.response?.trim()) {
      throw new Error('Response is required');
    }

    if (submissionRequest.submission_index < 0) {
      throw new Error('Valid submission index is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(submissionRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Get specific session details
  static async getSessionDetails(deploymentId: string, sessionId: number): Promise<PromptSession> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/session/${sessionId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Initialize session (get existing or create new)
  static async initializeSession(deploymentId: string): Promise<PromptSession> {
    // The backend POST endpoint handles both getting existing and creating new sessions
    return await this.getOrCreateSession(deploymentId);
  }

  // Instructor Methods
  
  // Get all prompt sessions for instructor review
  static async getInstructorSessions(deploymentId: string): Promise<PromptInstructorSessionView[]> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/instructor/sessions`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Get detailed submissions for a specific session (instructor view)
  static async getInstructorSubmissions(
    deploymentId: string, 
    sessionId: number
  ): Promise<PromptInstructorSubmissionView> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/instructor/submissions/${sessionId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }
} 
