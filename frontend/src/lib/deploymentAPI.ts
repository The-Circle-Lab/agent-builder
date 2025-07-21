// Base deployment interfaces and shared functionality
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

import { apiClient } from '@/lib/apiClient';
import { ROUTES } from '@/lib/constants';

export class BaseDeploymentAPI {
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
}

// Re-export for backward compatibility
export const DeploymentAPI = BaseDeploymentAPI; 
