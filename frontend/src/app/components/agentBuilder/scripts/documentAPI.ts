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

export class DocumentAPI {
  private static readonly BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail || `Upload failed: ${response.status}`);
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
