// Prompt deployment specific interfaces and functionality
export type PromptMediaType =
  | 'textarea'
  | 'hyperlink'
  | 'pdf'
  | 'list'
  | 'dynamic_list'
  | 'websiteInfo'
  | 'multiple_choice';

export interface PromptSubmissionRequirement {
  prompt: string;
  mediaType: PromptMediaType;
  items?: number; // Number of items required for list type (not applicable to dynamic_list)
  max?: number; // Maximum number of entries for websiteInfo type
  options?: string[]; // Available options for multiple choice prompts
}

export interface GroupInfo {
  group_name: string;
  group_members: string[];
  member_count: number;
  explanation?: string;
}

export interface PromptInfo {
  deployment_id: string;
  main_question: string;
  submission_requirements: PromptSubmissionRequirement[];
  total_submissions: number;
  group_info?: GroupInfo;
}

export interface PromptSubmissionResponse {
  submission_index: number;
  prompt_text: string;
  media_type: PromptMediaType;
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
  group_info?: GroupInfo;
}

export interface PromptSubmissionRequest {
  submission_index: number;
  response: string;
}

export interface PromptEditSubmissionRequest {
  submission_index: number;
  response: string;
}

export interface PromptSubmissionResult {
  submission_index: number;
  prompt_text: string;
  media_type: PromptMediaType;
  user_response: string;
  submitted_at: string;
  is_valid: boolean;
  validation_error?: string;
}

export interface PromptPdfTaskStatus {
  state: 'PENDING' | 'PROGRESS' | 'SUCCESS' | 'FAILURE' | string;
  status?: string;
  progress?: number; // 0-100
  stage?: string;
  result?: PromptSubmissionResult;
  error?: string;
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

  // Edit an existing response for a specific submission requirement
  static async editResponse(
    deploymentId: string,
    editRequest: PromptEditSubmissionRequest
  ): Promise<PromptSubmissionResult> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!editRequest.response?.trim()) {
      throw new Error('Response is required');
    }

    if (editRequest.submission_index < 0) {
      throw new Error('Valid submission index is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/edit`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(editRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Submit a PDF file for a specific submission requirement
  static async submitPdf(
    deploymentId: string,
    submissionIndex: number,
    file: File,
    onProgress?: (status: PromptPdfTaskStatus) => void,
  ): Promise<PromptSubmissionResult> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }
    if (!(file instanceof File)) {
      throw new Error('A PDF file is required');
    }

    const form = new FormData();
    form.append('submission_index', String(submissionIndex));
    form.append('file', file);

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/submit_pdf`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    });

    // Async path: 202 Accepted with task id, then poll status endpoint and report progress
    if (response.status === 202) {
      const { task_id } = await response.json();
      const statusUrl = `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/prompt/submit_pdf/status/${encodeURIComponent(task_id)}`;

      const start = Date.now();
      const timeoutMs = 10 * 60 * 1000; // 10 minutes
      const intervalMs = 1200;

      while (true) {
        if (Date.now() - start > timeoutMs) {
          throw new Error('PDF processing timed out');
        }

        const r = await fetch(statusUrl, { credentials: 'include' });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t || `Status check failed (${r.status})`);
        }
        const s: PromptPdfTaskStatus = await r.json();
        onProgress?.(s);

        if (s.state === 'SUCCESS') {
          const payload: { result?: PromptSubmissionResult } | PromptSubmissionResult = s.result ?? {};
          const result: PromptSubmissionResult = ('result' in payload ? payload.result : payload) as PromptSubmissionResult;
          return result;
        }
        if (s.state === 'FAILURE') {
          throw new Error(s.error || s.status || 'PDF processing failed');
        }

        await new Promise((res) => setTimeout(res, intervalMs));
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    // Sync path (fallback)
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
