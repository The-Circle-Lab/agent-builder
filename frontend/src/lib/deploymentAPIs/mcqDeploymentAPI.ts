// MCQ deployment specific interfaces and functionality
export interface MCQQuestion {
  index: number;
  question: string;
  answers: string[];
}

export interface MCQAnswer {
  question_index: number;
  selected_answer: string;
  is_correct: boolean;
  correct_answer: string | null;
  answered_at: string;
  feedback_message?: string | null;
  chat_available?: boolean;
  next_question_index?: number | null;
  answered_count?: number;
  is_session_completed?: boolean;
  total_questions?: number;
  answers_revealed?: boolean;
  allow_retry_wrong_answer?: boolean;
}

export interface MCQSession {
  session_id: number;
  deployment_id: string;
  questions: MCQQuestion[];
  total_questions: number;
  started_at: string;
  completed_at?: string;
  score?: number;
  is_completed: boolean;
  submitted_answers?: MCQAnswer[];
  one_question_at_a_time: boolean;
  tell_answer_after_each_question: boolean;
  add_message_after_wrong_answer: boolean;
  wrong_answer_message?: string | null;
  add_chatbot_after_wrong_answer: boolean;
  answered_count: number;
  next_question_index: number | null;
  answers_revealed: boolean;
  allow_retry_wrong_answer: boolean;
}

export interface MCQAnswerSubmission {
  question_index: number;
  selected_answer: string;
}

export interface MCQChatRequest {
  message: string;
  history?: string[][];
}

export interface MCQChatResponse {
  response: string;
  sources?: string[];
}

import { API_CONFIG } from '@/lib/constants';

export class MCQDeploymentAPI {
  // Get existing MCQ session
  static async getSession(deploymentId: string): Promise<MCQSession> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/session`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Get or create MCQ session (the backend POST endpoint handles both cases)
  static async getOrCreateSession(deploymentId: string): Promise<MCQSession> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/session`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Create new MCQ session
  static async createSession(deploymentId: string): Promise<MCQSession> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/session`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Submit answer for a question
  static async submitAnswer(
    deploymentId: string,
    answerSubmission: MCQAnswerSubmission
  ): Promise<MCQAnswer> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    if (!answerSubmission.selected_answer?.trim()) {
      throw new Error('Selected answer is required');
    }

    if (answerSubmission.question_index < 0) {
      throw new Error('Valid question index is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(answerSubmission),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }

  // Initialize session (get existing or create new)
  static async initializeSession(deploymentId: string): Promise<MCQSession> {
    // The backend POST endpoint handles both getting existing and creating new sessions
    return await this.getOrCreateSession(deploymentId);
  }

  static async requestRemediationChat(
    deploymentId: string,
    payload: MCQChatRequest
  ): Promise<MCQChatResponse> {
    if (!deploymentId?.trim()) {
      throw new Error('Deployment ID is required');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/mcq/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message: payload.message,
        history: payload.history ?? [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to generate remediation response');
    }

    return await response.json();
  }
} 
