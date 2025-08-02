"use client";

import React, { useState, useRef } from "react";
import { VideoAPI } from "../../../../../../lib/videoAPI";

interface VideoUploadManagerProps {
  value?: string;
  onChange?: (url: string) => void;
}

export default function VideoUploadManager({
  value = "",
  onChange,
}: VideoUploadManagerProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uploads a single video file using VideoAPI and updates the value
  const handleFileUpload = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const file = Array.from(files)[0];
      if (!file.type.startsWith("video/")) {
        setError(`Invalid file type: ${file.name}. Only video files allowed.`);
        setUploading(false);
        return;
      }
      // Upload to DigitalOcean Spaces using VideoAPI
      const url = await VideoAPI.uploadVideoToDO(file);
      if (onChange) onChange(url);
    } catch (err) {
      setError("Upload failed" + err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileUpload(e.target.files);
    }
  };

  // Delete a video by its URL (extract filename from URL)
  const handleDelete = async () => {
    if (!value) return;
    setError("");
    setUploading(true);
    try {
      const filename = value.split("/").pop() || value;
      await VideoAPI.deleteVideo(filename);
      if (onChange) onChange("");
    } catch (err) {
      setError("Delete failed " + err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || !!value}
        className="px-3 py-1 bg-blue-600 text-white rounded"
      >
        {uploading ? "Uploading..." : "Upload Video"}
      </button>
      {error && <div className="text-red-500">{error}</div>}
      {value && (
        <ul className="mt-2">
          <li className="flex items-center gap-2">
            <a rel="noopener noreferrer" className="text-blue-400 underline">
              Video
            </a>
            <button
              type="button"
              className="text-red-500 hover:underline text-xs"
              onClick={handleDelete}
              disabled={uploading}
            >
              Delete
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
