"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  VideoDeploymentAPI,
  VideoSession,
} from "@/lib/deploymentAPIs/videoDeploymentAPI";
import { API_CONFIG } from "@/lib/constants";

interface VideoInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onClose: () => void;
}

export default function VideoInterface({
  deploymentId,
  deploymentName,
  onClose,
}: VideoInterfaceProps) {
  const [session, setSession] = useState<VideoSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const fetchSession = async () => {
      setLoading(true);
      setSessionError(null);
      try {
        const data = await VideoDeploymentAPI.getVideoSession(deploymentId);
        setSession(data);
      } catch (err) {
        setSessionError(
          err instanceof Error ? err.message : "Failed to load video"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [deploymentId]);

  const handleTimeUpdate = async () => {
    const video = videoRef.current;
    if (!video) return;
    const watched_seconds = Math.floor(video.currentTime);
    const total_seconds = Math.floor(video.duration);
    const completed = watched_seconds >= total_seconds - 2; // Allow for small offset

    // Send progress to backend (debounce in real code)
    await fetch(
      `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/video/progress`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watched_seconds, total_seconds, completed }),
      }
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Loading Video...
            </h3>
          </div>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <div className="text-red-600 mb-4">
              <svg
                className="w-12 h-12 mx-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Failed to Load Video
            </h3>
            <p className="text-gray-600 mb-4">{sessionError}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Video Not Found
            </h3>
            <p className="text-gray-600 mb-4">
              Unable to load the video session.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border mb-8">
          <div className="px-8 py-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              {session.title && (
                <h1 className="text-3xl font-extrabold text-gray-900 mb-1 leading-tight">
                  {session.title}
                </h1>
              )}
              <p className="text-base text-gray-500 font-normal">
                {deploymentName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors self-start sm:self-auto"
              aria-label="Close"
            >
              <svg
                className="w-7 h-7"
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
          <div className="px-8 py-12 flex flex-col items-center bg-gray-100 rounded-b-lg">
            <video
              ref={videoRef}
              controls
              width={900}
              className="rounded-xl shadow-lg bg-black border border-gray-300"
              style={{ maxWidth: "100%", minHeight: "420px" }}
              onTimeUpdate={handleTimeUpdate}
            >
              <source src={session.video_url} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>
    </div>
  );
}
