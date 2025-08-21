"use client";

import React from "react";
import dynamic from "next/dynamic";

// Dynamically import DocumentViewer to avoid SSR issues with react-pdf
const DocumentViewer = dynamic(() => import("./DocumentViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="text-gray-600">Loading document viewer...</span>
      </div>
    </div>
  ),
});

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  fileName: string;
  fileType: string;
  initialPage?: number;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  isOpen,
  onClose,
  fileUrl,
  fileName,
  fileType,
  initialPage,
}) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black -50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-5xl max-h-[90vh] w-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {fileName}
            </h2>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded uppercase">
              {fileType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Document Viewer */}
        <div className="flex-1 overflow-hidden">
          <DocumentViewer
            fileUrl={fileUrl}
            fileName={fileName}
            fileType={fileType}
            className="h-full"
            initialPage={initialPage}
          />
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
