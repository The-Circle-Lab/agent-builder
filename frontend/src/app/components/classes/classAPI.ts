import { apiClient } from '@/lib/apiClient';
import { ROUTES } from '@/lib/constants';
import { Class, ClassMember, Workflow, Deployment, Conversation, ChatMessage } from '@/lib/types';

export class ClassAPI {
  // Create a new class (instructors only)
  static async createClass(name: string, description?: string): Promise<Class> {
    const response = await apiClient.post<Class>(`${ROUTES.CLASSES}/`, {
      name,
      description
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Join a class using join code
  static async joinClass(joinCode: string): Promise<Class> {
    const response = await apiClient.post<Class>(`${ROUTES.CLASSES}/join`, {
      join_code: joinCode
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Get user's classes
  static async getUserClasses(): Promise<Class[]> {
    const response = await apiClient.get<Class[]>(`${ROUTES.CLASSES}/`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data || [];
  }

  // Get class details
  static async getClassDetails(classId: number): Promise<Class> {
    const response = await apiClient.get<Class>(`${ROUTES.CLASSES}/${classId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Get join code for a class (instructors only)
  static async getJoinCode(classId: number): Promise<{ class_id: number; class_name: string; join_code: string }> {
    const response = await apiClient.get<{ class_id: number; class_name: string; join_code: string }>(
      `${ROUTES.CLASSES}/${classId}/join-code`
    );
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Leave a class
  static async leaveClass(classId: number): Promise<void> {
    const response = await apiClient.delete(`${ROUTES.CLASSES}/${classId}/leave`);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  // Delete a class (instructors only)
  static async deleteClass(classId: number): Promise<void> {
    const response = await apiClient.delete(`${ROUTES.CLASSES}/${classId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  // Get workflows for a class
  static async getClassWorkflows(classId: number): Promise<Workflow[]> {
    const response = await apiClient.get<Workflow[]>(`${ROUTES.WORKFLOWS}/`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Filter workflows by class_id
    const workflows = response.data || [];
    return workflows.filter(w => w.class_id === classId);
  }

  // Create a workflow in a class (instructors only)
  static async createWorkflow(classId: number, name: string, description?: string, workflowData?: Record<string, unknown>): Promise<Workflow> {
    const response = await apiClient.post<Workflow>(`${ROUTES.WORKFLOWS}/`, {
      name,
      description,
      workflow_data: workflowData || { nodes: [], edges: [] },
      class_id: classId
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Get active deployments
  static async getActiveDeployments(): Promise<{ deployments: Deployment[] }> {
    const response = await apiClient.get<{ deployments: Deployment[] }>(`${ROUTES.DEPLOYMENTS}/active`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Get class deployments (filter by class)
  static async getClassDeployments(): Promise<Deployment[]> {
    const activeDeployments = await this.getActiveDeployments();
    return activeDeployments.deployments;
  }

  // Deploy a workflow (instructors only)
  static async deployWorkflow(workflowId: number, workflowName: string, workflowData: Record<string, unknown>): Promise<{ deployment_id: string; chat_url: string }> {
    const response = await apiClient.post<{ deployment_id: string; chat_url: string }>(`${ROUTES.DEPLOYMENTS}/`, {
      workflow_id: workflowId,
      workflow_name: workflowName,
      workflow_data: workflowData
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data!;
  }

  // Delete a deployment (instructors only)
  static async deleteDeployment(deploymentId: string): Promise<void> {
    const response = await apiClient.delete(`${ROUTES.DEPLOYMENTS}/${deploymentId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  // Get all conversations for a deployment (instructors only)
  static async getAllConversations(deploymentId: string): Promise<Conversation[]> {
    const response = await apiClient.get<Conversation[]>(`${ROUTES.DEPLOYMENTS}/${deploymentId}/all-conversations`);
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data || [];
  }

  // Get messages for a conversation (instructors can view any, students only their own)
  static async getConversationMessages(deploymentId: string, conversationId: number): Promise<ChatMessage[]> {
    const response = await apiClient.get<ChatMessage[]>(
      `${ROUTES.DEPLOYMENTS}/${deploymentId}/conversations/${conversationId}/messages`
    );
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data || [];
  }

  // Delete a workflow (instructors only)
  static async deleteWorkflow(workflowId: number): Promise<void> {
    const response = await apiClient.delete(`${ROUTES.WORKFLOWS}/${workflowId}`);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  // Get class members
  static async getClassMembers(classId: number): Promise<ClassMember[]> {
    const response = await apiClient.get<{ members: ClassMember[] }>(
      `${ROUTES.CLASSES}/${classId}/members`
    );
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    return response.data?.members || [];
  }
} 
