"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { DocumentAPI, DocumentInfo } from "../../../scripts/documentAPI";

interface DocumentManagerProps {
  workflowId?: string | number;
  onDocumentsChange?: (documentCount: number) => void;
}

export default function DocumentManager({ 
  workflowId = "default", 
  onDocumentsChange 
}: DocumentManagerProps) {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert workflowId to number, skip if it's "default" or invalid
  const numericWorkflowId = typeof workflowId === 'number' ? workflowId : 
    (typeof workflowId === 'string' && workflowId !== "default" ? parseInt(workflowId, 10) : null);

  const loadDocuments = useCallback(async () => {
    if (!numericWorkflowId) {
      setDocuments([]);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await DocumentAPI.getWorkflowDocuments(numericWorkflowId);
      setDocuments(response.documents);
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        // Workflow doesn't exist yet, which is fine
        setDocuments([]);
      } else {
        setError(error instanceof Error ? error.message : "Failed to load documents");
      }
    } finally {
      setLoading(false);
    }
  }, [numericWorkflowId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (onDocumentsChange) {
      onDocumentsChange(documents.length);
    }
  }, [documents.length, onDocumentsChange]);

  const handleFileUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    
    if (!numericWorkflowId) {
      setError("Invalid workflow ID. Cannot upload documents.");
      return;
    }

    try {
      setUploading(true);
      setError("");

      // Validate files
      const validFiles = Array.from(files).filter(file => {
        const validTypes = ['application/pdf', 'application/msword', 
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const maxSize = 10 * 1024 * 1024; // 10MB

        if (!validTypes.includes(file.type)) {
          setError(`Invalid file type: ${file.name}. Only PDF, DOC, DOCX allowed.`);
          return false;
        }
        if (file.size > maxSize) {
          setError(`File too large: ${file.name}. Maximum 10MB allowed.`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) {
        setUploading(false);
        return;
      }

      await DocumentAPI.uploadDocuments(validFiles, numericWorkflowId);
      await loadDocuments(); // Refresh the list
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveDocument = async (documentId: number, filename: string) => {
    if (!confirm(`Are you sure you want to remove "${filename}"?`)) {
      return;
    }

    try {
      await DocumentAPI.removeDocument(documentId);
      await loadDocuments(); // Refresh the list
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove document");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return '📄';
      case 'docx':
      case 'doc':
        return '📝';
      default:
        return '📁';
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-200">
          Documents ({documents.length})
        </label>
        
        {/* Drag & Drop Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
            dragOver 
              ? 'border-blue-400 bg-blue-900/20' 
              : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-3xl mb-2">📁</div>
          <div className="text-gray-300 text-sm">
            {uploading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span>Uploading...</span>
              </div>
            ) : (
              <>
                <p className="font-medium">Drop files here or click to browse</p>
                <p className="text-gray-400 text-xs mt-1">
                  PDF, DOC, DOCX files up to 10MB each
                </p>
              </>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-md text-sm">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-300 hover:text-red-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Documents List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-400 text-sm">Loading documents...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">
            No documents uploaded yet
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3 hover:bg-gray-600/50 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <span className="text-lg">{getFileIcon(doc.file_type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {doc.filename}
                  </div>
                  <div className="text-gray-400 text-xs">
                    {DocumentAPI.formatFileSize(doc.file_size)} • {doc.chunk_count} chunks
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRemoveDocument(doc.id, doc.filename)}
                className="text-gray-400 hover:text-red-400 transition-colors p-1"
                title="Remove document"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Workflow Info */}
      {documents.length > 0 && numericWorkflowId && (
        <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
          Workflow ID: {numericWorkflowId} • Total chunks: {documents.reduce((sum, doc) => sum + doc.chunk_count, 0)}
        </div>
      )}
    </div>
  );
} 
