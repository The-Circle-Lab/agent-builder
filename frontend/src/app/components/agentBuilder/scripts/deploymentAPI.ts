export interface DeploymentRequest {
  workflow_name: string;
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
}

export interface ChatResponse {
  response: string;
  sources: string[];
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

export class DeploymentAPI {
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  static async deployWorkflow(
    workflowName: string,
    workflowData: Record<string, unknown>
  ): Promise<DeploymentResponse> {
    const response = await fetch(`${this.BASE_URL}/api/deploy/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        workflow_name: workflowName,
        workflow_data: workflowData
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Deployment failed' }));
      throw new Error(error.detail || `Deployment failed: ${response.status}`);
    }

    return await response.json();
  }

  static async chatWithDeployment(
    deploymentId: string,
    message: string,
    history: string[][] = []
  ): Promise<ChatResponse> {
    const response = await fetch(`${this.BASE_URL}/api/deploy/chat/${deploymentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message,
        history
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Chat failed' }));
      throw new Error(error.detail || `Chat failed: ${response.status}`);
    }

    return await response.json();
  }

  static async getActiveDeployments(): Promise<{ deployments: ActiveDeployment[] }> {
    const response = await fetch(`${this.BASE_URL}/api/deploy/active`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch deployments' }));
      throw new Error(error.detail || `Failed to fetch deployments: ${response.status}`);
    }

    return await response.json();
  }

  static async deleteDeployment(deploymentId: string): Promise<{ message: string }> {
    const response = await fetch(`${this.BASE_URL}/api/deploy/${deploymentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete deployment' }));
      throw new Error(error.detail || `Failed to delete deployment: ${response.status}`);
    }

    return await response.json();
  }

  // Debug function to test authentication
  static async debugAuth(): Promise<any> {
    const response = await fetch(`${this.BASE_URL}/api/deploy/debug/auth`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Auth debug failed' }));
      throw new Error(error.detail || `Auth debug failed: ${response.status}`);
    }

    return await response.json();
  }
} 
