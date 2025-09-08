import { getApiConfig } from "@/lib/config";

export interface DocumentInfo {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  chunk_count: number;
  upload_id: string;
  uploaded_at: string;
  collection_name: string;
}

export interface CollectionInfo {
  collection_name: string;
  user_collection_name: string;
  document_count: number;
  total_chunks: number;
  last_uploaded: string;
}

export interface UploadResponse {
  message: string;
  workflow_id: number;
  workflow_name: string;
  collection_name: string;
  total_chunks: number;
  files_processed: Array<{
    filename: string;
    upload_id: string;
    chunks: number;
    size: number;
    file_type: string;
  }>;
}

export interface UploadAccepted {
  message: string;
  task_id: string;
}

export interface UploadTaskStatus {
  state: 'PENDING' | 'PROGRESS' | 'SUCCESS' | 'FAILURE' | string;
  status?: string;
  progress?: number;
  stage?: string;
  result?: { result?: UploadResponse } | UploadResponse;
  error?: string;
}

export interface PromptSubmissionResponse {
  submission_index: number;
  prompt_text: string;
  media_type: string;
  user_response: string;
  submitted_at: string; // ISO string
  is_valid: boolean;
  validation_error?: string | null;
}

export class DocumentAPI {
  private static readonly BASE_URL = getApiConfig().base_url;

  static async uploadDocuments(
    files: FileList | File[], 
    workflowId: number
  ): Promise<UploadResponse> {
    const formData = new FormData();
    
    // Add files to form data
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });
    
    // Add workflow ID
    formData.append('workflow_id', workflowId.toString());

    const response = await fetch(`${this.BASE_URL}/api/documents/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    // If backend now processes uploads asynchronously, it returns 202 with a task_id.
    if (response.status === 202) {
      const accepted: UploadAccepted = await response.json();
      return await this.waitForUploadResult(accepted.task_id);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `Upload failed: ${response.status}`);
    }

    return await response.json();
  }

  // Explicit async variant: returns the task id immediately
  static async uploadDocumentsAsync(
    files: FileList | File[],
    workflowId: number
  ): Promise<UploadAccepted> {
    const formData = new FormData();
    Array.from(files).forEach(file => formData.append('files', file));
    formData.append('workflow_id', workflowId.toString());

    const response = await fetch(`${this.BASE_URL}/api/documents/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    if (response.status === 202) {
      return await response.json();
    }

    // Fall back: if server still processes synchronously
    if (response.ok) {
      await response.json();
      return { message: 'Completed', task_id: '' };
    }

    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || `Upload failed: ${response.status}`);
  }

  static async getUploadStatus(taskId: string): Promise<UploadTaskStatus> {
    const res = await fetch(`${this.BASE_URL}/api/documents/upload/status/${encodeURIComponent(taskId)}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Status check failed' }));
      throw new Error(error.detail || `Status check failed: ${res.status}`);
    }
    return await res.json();
  }

  // Polls until task SUCCESS/FAILURE and returns the final UploadResponse on success
  static async waitForUploadResult(taskId: string, opts?: { intervalMs?: number; timeoutMs?: number }): Promise<UploadResponse> {
    const interval = opts?.intervalMs ?? 1500;
    const timeout = opts?.timeoutMs ?? 10 * 60 * 1000; // 10 minutes
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeout) {
        throw new Error('Upload timed out');
      }

      const status = await this.getUploadStatus(taskId);
      if (status.state === 'SUCCESS') {
        // Backend returns either { result: { ... } } or the UploadResponse directly in result
        const payload: { result?: UploadResponse } | UploadResponse = (status.result) ?? {};
        return ('result' in payload ? payload.result : payload) as UploadResponse;
      }
      if (status.state === 'FAILURE') {
        throw new Error(status.error || status.status || 'Upload failed');
      }

      await new Promise(r => setTimeout(r, interval));
    }
  }

  // Upload a PDF for a prompt submission (deployment-based prompt flow)
  static async uploadPromptPDF(
    deploymentId: string,
    submissionIndex: number,
    file: File
  ): Promise<PromptSubmissionResponse> {
    const formData = new FormData();
    formData.append('submission_index', String(submissionIndex));
    formData.append('file', file, file.name);

    const response = await fetch(
      `${this.BASE_URL}/api/deploy/${encodeURIComponent(deploymentId)}/prompt/submit_pdf`,
      {
        method: 'POST',
        credentials: 'include',
        body: formData,
      }
    );

    if (response.status === 202) {
      const { task_id } = await response.json();
      // Poll the prompt status endpoint
      const statusUrl = `${this.BASE_URL}/api/deploy/${encodeURIComponent(deploymentId)}/prompt/submit_pdf/status/${encodeURIComponent(task_id)}`;
      const wait = async (): Promise<PromptSubmissionResponse> => {
        const r = await fetch(statusUrl, { credentials: 'include' });
        if (!r.ok) throw new Error(`Prompt PDF status failed: ${r.status}`);
        const s = await r.json();
        if (s.state === 'SUCCESS') {
          const payload: { result?: PromptSubmissionResponse } | PromptSubmissionResponse = (s.result) ?? {};
          return ('result' in payload ? payload.result : payload) as PromptSubmissionResponse;
        }
        if (s.state === 'FAILURE') {
          throw new Error(s.error || s.status || 'Prompt PDF upload failed');
        }
        await new Promise(r => setTimeout(r, 1200));
        return wait();
      };
      return await wait();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Prompt PDF upload failed' }));
      throw new Error(error.detail || `Prompt PDF upload failed: ${response.status}`);
    }

    return await response.json();
  }

  static async getWorkflowDocuments(workflowId: number): Promise<{
    workflow_id: number;
    workflow_name: string;
    workflow_collection_id: string;
    document_count: number;
    documents: DocumentInfo[];
  }> {
    const response = await fetch(
      `${this.BASE_URL}/api/documents/workflows/${workflowId}/documents`,
      {
        credentials: 'include'
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch documents' }));
      throw new Error(error.detail || `Failed to fetch documents: ${response.status}`);
    }

    return await response.json();
  }

  static async getAllCollections(): Promise<{
    collections: CollectionInfo[];
  }> {
    const response = await fetch(`${this.BASE_URL}/api/documents/collections`, {
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to fetch collections' }));
      throw new Error(error.detail || `Failed to fetch collections: ${response.status}`);
    }

    return await response.json();
  }

  static async removeDocument(documentId: number): Promise<{
    message: string;
    document_id: number;
    filename: string;
    chunks_removed: number;
  }> {
    const response = await fetch(`${this.BASE_URL}/api/documents/documents/${documentId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to remove document' }));
      throw new Error(error.detail || `Failed to remove document: ${response.status}`);
    }

    return await response.json();
  }

  static async deleteCollection(collectionName: string): Promise<{
    message: string;
    collection_name: string;
    documents_removed: number;
    total_chunks_removed: number;
  }> {
    const response = await fetch(
      `${this.BASE_URL}/api/documents/collections/${encodeURIComponent(collectionName)}`,
      {
        method: 'DELETE',
        credentials: 'include'
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to delete collection' }));
      throw new Error(error.detail || `Failed to delete collection: ${response.status}`);
    }

    return await response.json();
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
} 
