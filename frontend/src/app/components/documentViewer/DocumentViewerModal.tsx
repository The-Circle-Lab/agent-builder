'use client';

import React from 'react';
import DocumentViewer from './DocumentViewer';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
  title?: string;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
  title
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="w-full h-full max-w-7xl max-h-screen m-4 bg-base-100 rounded-lg shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b bg-base-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">
              {title || 'Document Viewer'}
            </h2>
            <div className="badge badge-outline">{fileType.toUpperCase()}</div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Download Button */}
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => window.open(fileUrl, '_blank')}
              title="Download file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
            
            {/* Close Button */}
            <button
              className="btn btn-sm btn-ghost"
              onClick={onClose}
              title="Close (Esc)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Modal Content */}
        <div className="h-[calc(100vh-8rem)] overflow-hidden">
          <DocumentViewer
            fileUrl={fileUrl}
            fileName={fileName}
            fileType={fileType}
            className="h-full shadow-none"
            onError={(error) => {
              console.error('Document viewer error:', error);
              // Could show a toast notification here
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal; 
