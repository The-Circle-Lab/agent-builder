export interface DeploymentRequest {
  workflow_name: string;
  workflow_id: number;
  workflow_data: Record<string, unknown>;
}

export interface DeploymentResponse {
  deployment_id: string;
  chat_url: string;
  message: string;
  configuration: {
    model: string;
    has_rag: boolean;
    collection?: string;
  };
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
  configuration: {
    model: string;
    has_rag: boolean;
  };
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

import { apiClient } from '@/lib/api-client';
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
} 
