'use client';

import React, { useState } from 'react';
import DocumentViewerModal from './DocumentViewerModal';

interface DocumentItem {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  chunk_count: number;
  uploaded_at: string;
  uploaded_by_email?: string;
  can_view: boolean;
  can_download: boolean;
  view_url?: string;
  download_url?: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  title?: string;
  showUploader?: boolean;
  className?: string;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  title = "Documents",
  showUploader = false,
  className = ''
}) => {
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return (
          <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6l-4-4H4v16zm8-14v3h3l-3-3z"/>
          </svg>
        );
      case 'docx':
      case 'doc':
        return (
          <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6l-4-4H4v16zm8-14v3h3l-3-3z"/>
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M4 18h12V6l-4-4H4v16zm8-14v3h3l-3-3z"/>
          </svg>
        );
    }
  };

  const handleViewDocument = (document: DocumentItem) => {
    if (document.can_view && document.view_url) {
      setSelectedDocument(document);
      setIsModalOpen(true);
    }
  };

  const handleDownloadDocument = (document: DocumentItem) => {
    if (document.can_download && document.download_url) {
      window.open(document.download_url, '_blank');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedDocument(null);
  };

  if (documents.length === 0) {
    return (
      <div className={`card bg-base-100 shadow-xl ${className}`}>
        <div className="card-body">
          <h2 className="card-title">{title}</h2>
          <div className="flex flex-col items-center justify-center py-8 text-base-content/70">
            <svg className="w-12 h-12 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 18h12V6l-4-4H4v16zm8-14v3h3l-3-3z"/>
            </svg>
            <p>No documents available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`card bg-base-100 shadow-xl ${className}`}>
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title">{title}</h2>
            <div className="badge badge-outline">{documents.length} files</div>
          </div>

          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Chunks</th>
                  {showUploader && <th>Uploaded By</th>}
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        {getFileIcon(doc.file_type)}
                        <div>
                          <div className="font-medium">{doc.filename}</div>
                          <div className="badge badge-sm badge-outline">
                            {doc.file_type.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td>
                      <div className="badge badge-sm">{doc.chunk_count}</div>
                    </td>
                    {showUploader && (
                      <td>{doc.uploaded_by_email || 'Unknown'}</td>
                    )}
                    <td>{formatDate(doc.uploaded_at)}</td>
                    <td>
                      <div className="flex gap-2">
                        {doc.can_view && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleViewDocument(doc)}
                            title="View document"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View
                          </button>
                        )}
                        {doc.can_download && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleDownloadDocument(doc)}
                            title="Download document"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Download
                          </button>
                        )}
                        {!doc.can_view && !doc.can_download && (
                          <span className="text-sm text-base-content/50">
                            Not available
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewerModal
          isOpen={isModalOpen}
          onClose={closeModal}
          fileUrl={selectedDocument.view_url || ''}
          fileName={selectedDocument.filename}
          fileType={selectedDocument.file_type}
        />
      )}
    </>
  );
};

export default DocumentList; 
