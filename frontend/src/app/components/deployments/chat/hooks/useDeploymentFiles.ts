import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/apiClient';
import { ROUTES } from '@/lib/constants';

interface DeploymentFile {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  chunk_count: number;
  uploaded_at: string;
  uploaded_by_email?: string;
  has_stored_file: boolean;
  can_view: boolean;
  can_download: boolean;
  view_url?: string;
  download_url?: string;
}

interface DeploymentFilesResponse {
  deployment_id: string;
  workflow_name: string;
  has_rag: boolean;
  file_count: number;
  files: DeploymentFile[];
  message?: string;
}

export const useDeploymentFiles = (deploymentId: string) => {
  const [files, setFiles] = useState<DeploymentFile[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    if (!deploymentId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.get<DeploymentFilesResponse>(`${ROUTES.DEPLOYMENTS}/${deploymentId}/files`);
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      if (!response.data) {
        throw new Error('No deployment files data received');
      }
      
      setFiles(response.data.files || []);
      setFileCount(response.data.file_count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
      setFiles([]);
      setFileCount(0);
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  // Fetch files on mount
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    fileCount,
    loading,
    error,
    refetch: fetchFiles
  };
}; 
