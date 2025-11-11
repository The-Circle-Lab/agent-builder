'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VideoAPI, VideoInfo } from "../../../../../../lib/videoAPI";
import { VideoAsset } from "../types";

interface VideoUploadManagerProps {
  workflowId?: string | number;
  value?: VideoAsset[];
  onChange: (videos: VideoAsset[]) => void;
  label?: string;
  selectedVideoId?: string | number;
  onSelect?: (id: string | number | null) => void;
}

const MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB default limit
const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/x-matroska",
];

function normalizeVideoInfo(video: VideoInfo): VideoAsset {
  // Build absolute stream/download URLs when the backend returns relative paths
  const streamUrl = video.stream_url && video.stream_url.startsWith("http")
    ? video.stream_url
    : VideoAPI.buildStreamUrl(String(video.id));
  const downloadUrl = video.download_url && video.download_url.startsWith("http")
    ? video.download_url
    : VideoAPI.buildDownloadUrl(String(video.id));
  
  // Ensure status is one of the allowed values
  const validStatuses = ["pending", "processing", "ready", "failed"] as const;
  const status = video.status && validStatuses.includes(video.status as typeof validStatuses[number])
    ? (video.status as "pending" | "processing" | "ready" | "failed")
    : "ready";
  
  return {
    id: video.id,
    filename: video.filename,
    fileSize: video.file_size,
    fileType: video.mime_type,
    url: streamUrl || downloadUrl || null,
    thumbnailUrl: video.thumbnail_url ?? null,
    durationSeconds: video.duration_seconds ?? null,
    uploadedAt: video.uploaded_at,
    status,
  };
}

export default function VideoUploadManager({ workflowId = "default", value = [], onChange, label, selectedVideoId, onSelect }: VideoUploadManagerProps) {
  const [videos, setVideos] = useState<VideoAsset[]>(Array.isArray(value) ? value : []);
  const [loading, setLoading] = useState(false);
  // Tracks whether an initial load (or sync) has completed to avoid flickering between loading and empty states
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const numericWorkflowId = useMemo(() => {
    if (typeof workflowId === "number") return workflowId;
    if (typeof workflowId === "string" && workflowId !== "default") {
      const parsed = parseInt(workflowId, 10);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  }, [workflowId]);

  const canUpload = numericWorkflowId !== null;

  const syncVideos = useCallback((items: VideoAsset[]) => {
    setVideos(items);
    onChange(items);
  }, [onChange]);

  const loadVideos = useCallback(async () => {
    if (!numericWorkflowId) {
      // No persisted workflow yet; just reflect local value and mark as loaded
      syncVideos(Array.isArray(value) ? value : []);
      setLoaded(true);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await VideoAPI.getWorkflowVideos(numericWorkflowId);
      const mapped = response.videos.map(normalizeVideoInfo);
      syncVideos(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load videos";
      setError(message);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [numericWorkflowId, syncVideos, value]);

  // Fetch when workflow id changes (persisted workflows) or sync local value when not persisted
  useEffect(() => {
    loadVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericWorkflowId]);

  // Keep local videos in sync with incoming prop if workflow not yet saved
  useEffect(() => {
    if (!numericWorkflowId) {
      syncVideos(Array.isArray(value) ? value : []);
      if (!loaded) setLoaded(true);
    }
  }, [numericWorkflowId, value, loaded, syncVideos]);

  const handleUploadFiles = useCallback(async (files?: FileList | File[] | null) => {
    if (!files || files.length === 0) return;

    if (!numericWorkflowId) {
      setError("Unable to upload videos until the workflow is saved.");
      return;
    }

    const fileArray = Array.from(files);

    const invalidType = fileArray.find((file) => !file.type.startsWith("video/") || (ACCEPTED_VIDEO_TYPES.length > 0 && !ACCEPTED_VIDEO_TYPES.includes(file.type)));
    if (invalidType) {
      setError(`Unsupported file type: ${invalidType.name}. Please upload a video file (MP4, MOV, WEBM, MKV).`);
      return;
    }

    const tooLarge = fileArray.find((file) => file.size > MAX_VIDEO_SIZE_BYTES);
    if (tooLarge) {
      setError(`File too large: ${tooLarge.name}. Maximum size is ${VideoAPI.formatFileSize(MAX_VIDEO_SIZE_BYTES)}.`);
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const response = await VideoAPI.uploadVideos(fileArray, numericWorkflowId);
      const mapped: VideoAsset[] = response.videos.map(normalizeVideoInfo);

      // Merge new uploads with existing videos, deduplicating by id if possible
      const existingById = new Map(videos.map((v) => [v.id, v]));
      for (const video of mapped) {
        existingById.set(video.id, video);
      }

      syncVideos(Array.from(existingById.values()));

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Video upload failed";
      setError(message);
    } finally {
      setUploading(false);
    }
  }, [numericWorkflowId, videos, syncVideos]);

  const handleRemoveVideo = useCallback(async (video: VideoAsset) => {
    if (!numericWorkflowId || video.id === undefined || video.id === null) {
      syncVideos(videos.filter((item) => item.id !== video.id));
      return;
    }

    if (!confirm(`Remove \"${video.filename}\"?`)) {
      return;
    }

    try {
      await VideoAPI.removeVideo(String(video.id));
      syncVideos(videos.filter((item) => item.id !== video.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove video";
      setError(message);
    }
  }, [numericWorkflowId, videos, syncVideos]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canUpload) return;
    setDragOver(true);
  }, [canUpload]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (!canUpload) return;
    handleUploadFiles(event.dataTransfer.files);
  }, [canUpload, handleUploadFiles]);

  const renderVideoRow = (video: VideoAsset) => {
    const previewUrl = video.url ?? (numericWorkflowId ? VideoAPI.buildStreamUrl(String(video.id)) : undefined);
    const statusLabel = video.status === "processing" ? "Processing" : video.status === "failed" ? "Failed" : "Ready";
    const isSelected = selectedVideoId !== undefined && selectedVideoId !== null && String(selectedVideoId) === String(video.id);

    return (
      <div
        key={`${video.id ?? video.filename}`}
        className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3 hover:bg-gray-600/50 transition-colors"
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onSelect?.(video.id as string | number)}
            className={`w-5 h-5 rounded-full mr-1 flex items-center justify-center border ${isSelected ? "border-blue-400 bg-blue-500" : "border-gray-400 bg-transparent"}`}
            title={isSelected ? "Selected video" : "Use this video"}
          >
            {isSelected ? (
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : null}
          </button>
          <div className="text-2xl">🎬</div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{video.filename}</div>
            <div className="text-gray-400 text-xs flex items-center space-x-2">
              <span>{VideoAPI.formatFileSize(video.fileSize ?? 0)}</span>
              {video.durationSeconds ? (
                <span>• {VideoAPI.formatDuration(video.durationSeconds)}</span>
              ) : null}
              <span>• {statusLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {!isSelected ? (
            <button
              onClick={() => onSelect?.(video.id as string | number)}
              className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white"
            >
              Use
            </button>
          ) : (
            <span className="text-green-400 text-xs px-2 py-1 border border-green-600 rounded">In use</span>
          )}
          {previewUrl ? (
            <button
              onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
              className="text-gray-300 hover:text-white transition-colors text-sm"
            >
              Preview
            </button>
          ) : null}
          <button
            onClick={() => handleRemoveVideo(video)}
            className="text-gray-400 hover:text-red-400 transition-colors p-1"
            title="Remove video"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  const headerLabel = label ?? "Videos";

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-200">
          {headerLabel} ({videos.length})
        </label>
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            canUpload
              ? dragOver
                ? "border-blue-400 bg-blue-900/20"
                : "border-gray-600 hover:border-gray-500 bg-gray-700/50 cursor-pointer"
              : "border-gray-700 bg-gray-700/30 cursor-not-allowed"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!canUpload) return;
            fileInputRef.current?.click();
          }}
        >
          <div className="text-3xl mb-2">🎬</div>
          <div className="text-gray-300 text-sm">
            {uploading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span>Uploading...</span>
              </div>
            ) : (
              <>
                <p className="font-medium">{canUpload ? `Drop ${headerLabel.toLowerCase()} here or click to browse` : "Save the workflow to enable uploads"}</p>
                <p className="text-gray-400 text-xs mt-1">
                  MP4, MOV, WEBM, MKV up to {VideoAPI.formatFileSize(MAX_VIDEO_SIZE_BYTES)} each
                </p>
              </>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*"
          onChange={(event) => handleUploadFiles(event.target.files)}
          className="hidden"
        />
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-200 px-3 py-2 rounded-md text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-100">
            ×
          </button>
        </div>
      )}

      <div className="space-y-2">
        {!loaded || loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-400 text-sm">Loading videos...</span>
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-4 text-gray-400 text-sm">No videos uploaded yet</div>
        ) : (
          videos.map(renderVideoRow)
        )}
      </div>
    </div>
  );
}
