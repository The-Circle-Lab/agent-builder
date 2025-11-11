import { getApiConfig } from "@/lib/config";

export interface VideoInfo {
  id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  duration_seconds?: number | null;
  uploaded_at?: string;
  thumbnail_url?: string | null;
  stream_url?: string | null;
  download_url?: string | null;
  status?: "pending" | "processing" | "ready" | "failed" | string;
}

export interface VideoListResponse {
  workflow_id: number;
  videos: VideoInfo[];
}

export interface VideoUploadResponse {
  workflow_id: number;
  videos: VideoInfo[];
  message?: string;
}

export interface VideoUploadAccepted {
  message?: string;
  task_id: string;
}

export interface VideoUploadStatus {
  state: "PENDING" | "PROGRESS" | "SUCCESS" | "FAILURE" | string;
  status?: string;
  progress?: number;
  stage?: string;
  result?: { result?: VideoUploadResponse } | VideoUploadResponse;
  error?: string;
}

export class VideoAPI {
  private static readonly BASE_URL = getApiConfig().base_url;

  static async uploadVideos(
    files: FileList | File[],
    workflowId: number
  ): Promise<VideoUploadResponse> {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      // Backend expects the field name 'files' (List[UploadFile])
      formData.append("files", file);
    });
    formData.append("workflow_id", workflowId.toString());

    const response = await fetch(`${this.BASE_URL}/api/videos/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (response.status === 202) {
      const accepted: VideoUploadAccepted = await response.json();
      return await this.waitForUploadResult(accepted.task_id);
    }

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Video upload failed" }));
      throw new Error(error.detail || `Video upload failed: ${response.status}`);
    }

    return await response.json();
  }

  static async getWorkflowVideos(workflowId: number): Promise<VideoListResponse> {
    const response = await fetch(
      `${this.BASE_URL}/api/videos/workflows/${workflowId}/videos`,
      {
        credentials: "include",
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to fetch videos" }));
      throw new Error(error.detail || `Failed to fetch videos: ${response.status}`);
    }

    return await response.json();
  }

  static async removeVideo(videoId: string): Promise<{ message: string; video_id: string }> {
    const response = await fetch(`${this.BASE_URL}/api/videos/${encodeURIComponent(videoId)}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to remove video" }));
      throw new Error(error.detail || `Failed to remove video: ${response.status}`);
    }

    return await response.json();
  }

  static async getUploadStatus(taskId: string): Promise<VideoUploadStatus> {
    const response = await fetch(
      `${this.BASE_URL}/api/videos/upload/status/${encodeURIComponent(taskId)}`,
      {
        credentials: "include",
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to fetch video upload status" }));
      throw new Error(
        error.detail || `Failed to fetch video upload status: ${response.status}`
      );
    }

    return await response.json();
  }

  static async waitForUploadResult(
    taskId: string,
    opts?: { intervalMs?: number; timeoutMs?: number }
  ): Promise<VideoUploadResponse> {
    const interval = opts?.intervalMs ?? 1500;
    const timeout = opts?.timeoutMs ?? 10 * 60 * 1000;
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeout) {
        throw new Error("Video upload timed out");
      }

      const status = await this.getUploadStatus(taskId);
      if (status.state === "SUCCESS") {
        const payload: { result?: VideoUploadResponse } | VideoUploadResponse =
          status.result ?? {};
        return (
          "result" in payload ? payload.result : payload
        ) as VideoUploadResponse;
      }

      if (status.state === "FAILURE") {
        throw new Error(status.error || status.status || "Video upload failed");
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  static buildStreamUrl(videoId: string): string {
    return `${this.BASE_URL}/api/videos/${encodeURIComponent(videoId)}/stream`;
  }

  static buildDownloadUrl(videoId: string): string {
    return `${this.BASE_URL}/api/videos/${encodeURIComponent(videoId)}/download`;
  }

  static formatFileSize(bytes: number): string {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  static formatDuration(totalSeconds: number): string {
    if (!totalSeconds || Number.isNaN(totalSeconds)) {
      return "0:00";
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const paddedSeconds = seconds.toString().padStart(2, "0");

    if (hours > 0) {
      const paddedMinutes = minutes.toString().padStart(2, "0");
      return `${hours}:${paddedMinutes}:${paddedSeconds}`;
    }

    return `${minutes}:${paddedSeconds}`;
  }
}
