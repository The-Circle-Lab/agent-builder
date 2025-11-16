"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  VideoDeploymentAPI,
  VideoAssetDetails,
  VideoSession,
} from "@/lib/deploymentAPIs/videoDeploymentAPI";
import { VideoAPI } from "@/lib/videoAPI";
import { getApiConfig } from "@/lib/config";

interface VideoInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onSessionCompleted?: () => void | Promise<void>;
}

const useApiBaseUrl = (): string => {
  return useMemo(() => {
    const base = getApiConfig().base_url;
    return base.endsWith("/") ? base.slice(0, -1) : base;
  }, []);
};

const ensureAbsoluteUrl = (baseUrl: string, url?: string | null): string | null => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${baseUrl}${normalizedPath}`;
};

export default function VideoInterface({
  deploymentId,
  deploymentName,
  onSessionCompleted,
}: VideoInterfaceProps) {
  const [video, setVideo] = useState<VideoAssetDetails | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<VideoSession | null>(null);
  const baseUrl = useApiBaseUrl();
  const videoRef = useRef<HTMLVideoElement>(null);
  const completionNotifiedRef = useRef(false);

  const loadVideo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await VideoDeploymentAPI.getVideoDetails(deploymentId);
      setVideo(response.video ?? null);
      setMessage(response.message ?? null);

      if (!response.video && !response.message) {
        setMessage("No video has been configured for this deployment yet.");
      }

      // Start or get existing session
      try {
        const sessionData = await VideoDeploymentAPI.startSession(deploymentId);
        setSession(sessionData);
        
        // If already completed, notify immediately
        if (sessionData.is_completed && !completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          if (onSessionCompleted) {
            await onSessionCompleted();
          }
        }
      } catch (sessionErr) {
        console.error("Failed to initialize video session:", sessionErr);
        // Don't block video loading if session fails
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load video.";
      setError(errorMessage);
      setVideo(null);
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, [deploymentId, onSessionCompleted]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  const handleVideoEnded = useCallback(async () => {
    if (!session || session.is_completed || completionNotifiedRef.current) {
      return;
    }

    try {
      const updatedSession = await VideoDeploymentAPI.completeSession(deploymentId);
      setSession(updatedSession);
      
      if (updatedSession.is_completed && !completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        if (onSessionCompleted) {
          await onSessionCompleted();
        }
      }
    } catch (err) {
      console.error("Failed to mark video as completed:", err);
    }
  }, [deploymentId, session, onSessionCompleted]);

  const resolvedStreamUrl = useMemo(() => {
    if (!video) return null;
    return (
      ensureAbsoluteUrl(baseUrl, video.stream_url) ??
      (video.id ? VideoAPI.buildStreamUrl(video.id) : null)
    );
  }, [baseUrl, video]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center">
          <div className="bg-red-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Unable to load video</h3>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <button
            onClick={loadVideo}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="max-w-md text-center">
          <div className="bg-yellow-100 rounded-full h-12 w-12 flex items-center justify-center mx-auto">
            <svg
              className="h-6 w-6 text-yellow-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M5.455 19h13.09c1.54 0 2.5-1.67 1.73-2.5L13.73 5c-.77-.83-1.96-.83-2.73 0l-6.545 11.5c-.77.83.19 2.5 1.73 2.5z"
              />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No video available</h3>
          <p className="mt-2 text-sm text-gray-600">
            {message ?? "Your instructor has not selected a video for this deployment yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-4xl w-full mx-auto py-10 px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900">{deploymentName}</h2>
          <p className="mt-1 text-sm text-gray-600">
            Watch the selected video for this page. Your instructor curates the content shown here.
          </p>
        </div>

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="bg-gray-900">
            {resolvedStreamUrl ? (
              <video
                ref={videoRef}
                key={resolvedStreamUrl}
                controls
                playsInline
                className="w-full h-auto max-h-[70vh] bg-black"
                src={resolvedStreamUrl}
                onEnded={handleVideoEnded}
              >
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="flex items-center justify-center h-64 text-white">
                <p>Video preview unavailable.</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
