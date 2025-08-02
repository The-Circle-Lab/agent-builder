import { Node, Edge } from "@xyflow/react";
import { getApiConfig } from "@/lib/config";

export interface WorkflowSaveData {
  nodes: Node[];
  edges: Edge[];
  pageRelationships?: Record<string, string[]>; // pageId -> array of nodeIds
  metadata?: {
    lastSaved: string;
    version: string;
  };
}

// Save workflow data (nodes, edges, and page relationships) without any validation
export function createWorkflowSaveData(
  nodes: Node[], 
  edges: Edge[], 
  pageRelationships?: Record<string, string[]>
): WorkflowSaveData {
  return {
    nodes: nodes.map(node => ({
      ...node,
      // Ensure we preserve all node data
      data: { ...node.data }
    })),
    edges: edges.map(edge => ({
      ...edge
    })),
    pageRelationships: pageRelationships || {},
    metadata: {
      lastSaved: new Date().toISOString(),
      version: "1.0"
    }
  };
}

// API functions for backend integration
export class WorkflowAPI {
  private static readonly BASE_URL = getApiConfig().base_url;

  static async saveWorkflow(
    workflowId: number | null, 
    name: string, 
    description: string, 
    nodes: Node[], 
    edges: Edge[], 
    pageRelationships?: Record<string, string[]>
  ) {
    const workflowData = createWorkflowSaveData(nodes, edges, pageRelationships);
    
    const payload = {
      name,
      description,
      workflow_data: workflowData
    };

    const url = workflowId 
      ? `${this.BASE_URL}/api/workflows/${workflowId}`
      : `${this.BASE_URL}/api/workflows/`;
    
    const method = workflowId ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important for session cookies
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Failed to save workflow: ${response.status}`);
    }

    return await response.json();
  }

  static async loadWorkflow(workflowId: number) {
    const response = await fetch(`${this.BASE_URL}/api/workflows/${workflowId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Failed to load workflow: ${response.status}`);
    }

    return await response.json();
  }

  static async loadAllWorkflows() {
    const response = await fetch(`${this.BASE_URL}/api/workflows/`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Failed to load workflows: ${response.status}`);
    }

    return await response.json();
  }

  static async deleteWorkflow(workflowId: number) {
    const response = await fetch(`${this.BASE_URL}/api/workflows/${workflowId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || `Failed to delete workflow: ${response.status}`);
    }

    return await response.json();
  }
}

// Auto-save functionality
export class AutoSave {
  private static saveTimeout: NodeJS.Timeout | null = null;
  private static readonly SAVE_DELAY = 2000; // 2 seconds delay after last change

  static scheduleAutoSave(
    workflowId: number | null, 
    name: string, 
    description: string, 
    nodes: Node[], 
    edges: Edge[],
    pageRelationships?: Record<string, string[]>,
    onSave?: (result: unknown) => void,
    onError?: (error: Error) => void
  ) {
    // Clear existing timeout
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Schedule new save
    this.saveTimeout = setTimeout(async () => {
      try {
        const result = await WorkflowAPI.saveWorkflow(workflowId, name, description, nodes, edges, pageRelationships);
        if (onSave) {
          onSave(result);
        }
      } catch (error) {
        if (onError) {
          onError(error as Error);
        }
      }
    }, this.SAVE_DELAY);
  }

  static cancelAutoSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }
} 
