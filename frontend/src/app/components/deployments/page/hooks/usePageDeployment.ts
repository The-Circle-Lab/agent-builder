import { useState, useEffect, useCallback } from 'react';
import { PageListResponse, PageInfo } from '../types';
import { API_CONFIG } from '@/lib/constants';

export interface UsePageDeploymentReturn {
  pages: PageInfo[];
  currentPage: number;
  currentPageInfo: PageInfo | null;
  totalPages: number;
  loading: boolean;
  error: string | null;
  setCurrentPage: (pageNumber: number) => void;
  refreshPages: () => Promise<void>;
}

export function usePageDeployment(deploymentId: string): UsePageDeploymentReturn {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/pages`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch pages: ${errorText}`);
      }

      const data: PageListResponse = await response.json();
      setPages(data.pages);
      
      // Set current page to first page if not already set
      if (data.pages.length > 0 && currentPage === 1) {
        setCurrentPage(data.pages[0].page_number);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch pages';
      setError(errorMessage);
      console.error('Error fetching pages:', err);
    } finally {
      setLoading(false);
    }
  }, [deploymentId, currentPage]);

  const refreshPages = useCallback(async () => {
    await fetchPages();
  }, [fetchPages]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const currentPageInfo = pages.find(page => page.page_number === currentPage) || null;
  const totalPages = pages.length;

  return {
    pages,
    currentPage,
    currentPageInfo,
    totalPages,
    loading,
    error,
    setCurrentPage,
    refreshPages,
  };
} 
