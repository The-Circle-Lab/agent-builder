import { useState, useEffect, useCallback } from 'react';
import { PageListResponse, PageInfo } from '../types';
import { API_CONFIG } from '@/lib/constants';

export interface UsePageDeploymentReturn {
  pages: PageInfo[];
  currentPage: number;
  currentPageInfo: PageInfo | null;
  totalPages: number;
  pagesAccessible: number;
  loading: boolean;
  error: string | null;
  setCurrentPage: (pageNumber: number) => void;
  refreshPages: () => Promise<void>;
  isPageAccessible: (pageNumber: number) => boolean;
}

export function usePageDeployment(deploymentId: string): UsePageDeploymentReturn {
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [pagesAccessible, setPagesAccessible] = useState<number>(1);
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
      setPagesAccessible(data.pages_accessible);
      
      // Choose first unlocked & accessible page
      const firstUnlocked = data.pages.find(p => p.is_accessible);
      if (firstUnlocked) {
        setCurrentPage(firstUnlocked.page_number);
      } else if (data.pages.length > 0) {
        // If none are accessible, keep page at 1 and set error
        setCurrentPage(data.pages[0].page_number);
        setError('No pages are accessible yet. Please wait until your instructor unlocks a page.');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch pages';
      setError(errorMessage);
      console.error('Error fetching pages:', err);
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  const refreshPages = useCallback(async () => {
    await fetchPages();
  }, [fetchPages]);

  const isPageAccessible = useCallback((pageNumber: number): boolean => {
    const page = pages.find(p => p.page_number === pageNumber);
    return page ? page.is_accessible : false;
  }, [pages]);

  const handleSetCurrentPage = useCallback((pageNumber: number) => {
    const page = pages.find(p => p.page_number === pageNumber);
    
    if (!page) {
      setError(`Page ${pageNumber} does not exist. Available pages: 1-${pages.length}`);
      return;
    }
    
    if (!page.is_accessible) {
      setError(page.accessibility_reason || `Page ${pageNumber} is not yet accessible.`);
      return;
    }
    
    setError(null);
    setCurrentPage(pageNumber);
  }, [pages]);

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
    pagesAccessible,
    loading,
    error,
    setCurrentPage: handleSetCurrentPage,
    refreshPages,
    isPageAccessible,
  };
} 
