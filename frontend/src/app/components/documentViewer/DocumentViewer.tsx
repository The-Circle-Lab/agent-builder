'use client';

import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import mammoth from 'mammoth';

// Set up PDF.js worker - use local worker for reliability
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// Import CSS for react-pdf
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface DocumentViewerProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  className?: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
  initialPage?: number; // Page number to start at (only applies to PDF files, defaults to 1)
}

interface DocumentViewerState {
  numPages: number | null;
  currentPage: number;
  scale: number;
  loading: boolean;
  error: string | null;
  docxContent: string | null;
  pdfBlobUrl: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  fileUrl,
  fileName,
  fileType,
  className = '',
  onError,
  onLoad,
  initialPage
}) => {
  const [state, setState] = useState<DocumentViewerState>({
    numPages: null,
    currentPage: initialPage || 1,
    scale: 1.0,
    loading: true,
    error: null,
    docxContent: null,
    pdfBlobUrl: null
  });

  const updateState = (updates: Partial<DocumentViewerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  // Reset state when file changes
  useEffect(() => {
    setState({
      numPages: null,
      currentPage: initialPage || 1,
      scale: 1.0,
      loading: true,
      error: null,
      docxContent: null,
      pdfBlobUrl: null
    });
  }, [fileUrl, fileType, initialPage]);

  // Handle DOCX files - only on client side
  useEffect(() => {
    if (typeof window !== 'undefined' && (fileType.toLowerCase() === 'docx' || fileType.toLowerCase() === 'doc')) {
      loadDocxContent();
    }
  }, [fileUrl, fileType]);

  // Handle PDF files - only on client side
  useEffect(() => {
    if (typeof window !== 'undefined' && fileType.toLowerCase() === 'pdf') {
      loadPdfContent();
    }
  }, [fileUrl, fileType]);

  // Cleanup blob URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (state.pdfBlobUrl) {
        URL.revokeObjectURL(state.pdfBlobUrl);
      }
    };
  }, [state.pdfBlobUrl]);

  const loadDocxContent = async () => {
    try {
      updateState({ loading: true, error: null });
      
      // Include credentials for cross-origin requests to backend
      const response = await fetch(fileUrl, {
        credentials: 'include',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      
      updateState({ 
        docxContent: result.value, 
        loading: false 
      });
      
      if (result.messages.length > 0) {
        console.warn('DOCX conversion messages:', result.messages);
      }
      
      onLoad?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load DOCX file';
      updateState({ 
        error: errorMessage, 
        loading: false 
      });
      onError?.(errorMessage);
    }
  };

  const loadPdfContent = async () => {
    try {
      updateState({ loading: true, error: null });
      
      // Fetch PDF with credentials for cross-origin requests
      const response = await fetch(fileUrl, {
        credentials: 'include',
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      updateState({ 
        pdfBlobUrl: blobUrl,
        loading: false
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load PDF file';
      updateState({ 
        error: errorMessage, 
        loading: false 
      });
      onError?.(errorMessage);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    // Ensure currentPage is within valid range
    const validCurrentPage = Math.min(Math.max(1, state.currentPage), numPages);
    
    updateState({ 
      numPages, 
      currentPage: validCurrentPage,
      loading: false, 
      error: null 
    });
    onLoad?.();
  };

  const onDocumentLoadError = (error: Error) => {
    const errorMessage = `Failed to load PDF: ${error.message}`;
    updateState({ 
      error: errorMessage, 
      loading: false 
    });
    onError?.(errorMessage);
  };

  const goToPrevPage = () => {
    updateState({ 
      currentPage: Math.max(1, state.currentPage - 1) 
    });
  };

  const goToNextPage = () => {
    if (state.numPages) {
      updateState({ 
        currentPage: Math.min(state.numPages, state.currentPage + 1) 
      });
    }
  };

  const zoomIn = () => {
    updateState({ 
      scale: Math.min(3.0, state.scale + 0.2) 
    });
  };

  const zoomOut = () => {
    updateState({ 
      scale: Math.max(0.5, state.scale - 0.2) 
    });
  };

  const resetZoom = () => {
    updateState({ scale: 1.0 });
  };

  const jumpToPage = (page: number) => {
    if (state.numPages && page >= 1 && page <= state.numPages) {
      updateState({ currentPage: page });
    }
  };

  const renderControls = () => (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-base-200 border-b">
      {/* File Info */}
      <div className="flex items-center gap-2">
        <div className="badge badge-primary">{fileType.toUpperCase()}</div>
        <span className="text-sm font-medium truncate max-w-xs" title={fileName}>
          {fileName}
        </span>
      </div>

      {/* PDF Controls */}
      {fileType.toLowerCase() === 'pdf' && state.numPages && (
        <div className="flex items-center gap-2">
          <button 
            className="btn btn-sm btn-outline" 
            onClick={goToPrevPage}
            disabled={state.currentPage <= 1}
          >
            ←
          </button>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max={state.numPages}
              value={state.currentPage}
              onChange={(e) => jumpToPage(parseInt(e.target.value) || 1)}
              className="input input-sm w-16 text-center"
            />
            <span className="text-sm">of {state.numPages}</span>
          </div>
          
          <button 
            className="btn btn-sm btn-outline" 
            onClick={goToNextPage}
            disabled={state.currentPage >= state.numPages}
          >
            →
          </button>
        </div>
      )}

      {/* Zoom Controls */}
      <div className="flex items-center gap-2">
        <button 
          className="btn btn-sm btn-outline" 
          onClick={zoomOut}
          disabled={state.scale <= 0.5}
        >
          -
        </button>
        <span className="text-sm min-w-[4rem] text-center">
          {Math.round(state.scale * 100)}%
        </span>
        <button 
          className="btn btn-sm btn-outline" 
          onClick={zoomIn}
          disabled={state.scale >= 3.0}
        >
          +
        </button>
        <button 
          className="btn btn-sm btn-ghost" 
          onClick={resetZoom}
        >
          Reset
        </button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (state.loading) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="loading loading-spinner loading-lg"></div>
          <p className="text-base-content/70">Loading document...</p>
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{state.error}</span>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => window.open(fileUrl, '_blank')}
          >
            Open in New Tab
          </button>
        </div>
      );
    }

    // Render PDF
    if (fileType.toLowerCase() === 'pdf' && state.pdfBlobUrl) {
      return (
        <div className="flex justify-center bg-gray-100 min-h-[500px] overflow-auto">
          <Document
            file={state.pdfBlobUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-64">
                <div className="loading loading-spinner loading-lg"></div>
              </div>
            }
          >
            <Page
              pageNumber={state.currentPage}
              scale={state.scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg mx-auto"
            />
          </Document>
        </div>
      );
    }

    // Render DOCX
    if ((fileType.toLowerCase() === 'docx' || fileType.toLowerCase() === 'doc') && state.docxContent) {
      return (
        <div 
          className="prose prose-sm max-w-none p-6 bg-white overflow-auto"
          style={{ transform: `scale(${state.scale})`, transformOrigin: 'top left' }}
          dangerouslySetInnerHTML={{ __html: state.docxContent }}
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-base-content/70">Unsupported file type: {fileType}</p>
        <button 
          className="btn btn-primary"
          onClick={() => window.open(fileUrl, '_blank')}
        >
          Download File
        </button>
      </div>
    );
  };

  return (
    <div className={`card bg-base-100 shadow-xl ${className}`}>
      <div className="card-body p-0">
        {renderControls()}
        <div className="min-h-[500px]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer; 
