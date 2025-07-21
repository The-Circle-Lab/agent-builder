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
  correct_answer: string;
  answered_at: string;
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
}

export interface MCQAnswerSubmission {
  question_index: number;
  selected_answer: string;
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
    try {
      // First try to get existing session
      return await this.getSession(deploymentId);
    } catch (error) {
      // If no existing session found (404), create a new one
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
        return await this.createSession(deploymentId);
      }
      // Re-throw other errors
      throw error;
    }
  }
} 
