import { getApiConfig } from "@/lib/config";

/**
 * VideoInfo describes a single uploaded video.
 */
export interface VideoInfo {
  url: string; // Public URL to the video
  filename: string; // Original filename
  size: number; // File size in bytes
  uploaded_at: string; // ISO date string
}

/**
 * Response from a successful video upload.
 */
export interface VideoUploadResponse {
  message: string;
  videos: VideoInfo[];
}

/**
 * Utility class for video upload and management.
 */
export class VideoAPI {
  private static readonly BASE_URL = getApiConfig().base_url;

  /**
   * Requests a signed upload URL from the backend for a given filename.
   * @param filename The name of the file to upload.
   * @returns An object containing the signed upload URL and the final public file URL.
   */
  static async getSignedUploadUrl(
    filename: string,
    filetype: string
  ): Promise<{ uploadUrl: string; fileUrl: string }> {
    const response = await fetch(
      `${this.BASE_URL}/api/videos/get-upload-url?filename=${encodeURIComponent(
        filename
      )}&content_type=${encodeURIComponent(filetype)}`,
      { credentials: "include" }
    );
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to get upload URL" }));
      throw new Error(
        error.detail || `Failed to get upload URL: ${response.status}`
      );
    }
    return await response.json();
  }

  /**
   * Uploads a single video file to DigitalOcean Spaces using a signed URL.
   * @param file The video file to upload.
   * @returns The public URL of the uploaded video.
   */
  static async uploadVideoToDO(file: File): Promise<string> {
    // 1. Get a signed upload URL from the backend
    const { uploadUrl, fileUrl } = await this.getSignedUploadUrl(
      file.name,
      file.type
    );

    // 2. Upload the file directly to DigitalOcean Spaces
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });
    if (!uploadRes.ok) {
      throw new Error("Failed to upload video to storage");
    }

    // 3. Return the public URL to the uploaded file
    return fileUrl;
  }

  /**
   * Uploads multiple video files to DigitalOcean Spaces.
   * @param files List of video files to upload.
   * @returns Array of public URLs for the uploaded videos.
   */
  static async uploadVideos(files: FileList | File[]): Promise<string[]> {
    const fileArray = Array.from(files);
    const urls: string[] = [];
    for (const file of fileArray) {
      if (!file.type.startsWith("video/")) {
        throw new Error(
          `Invalid file type: ${file.name}. Only video files allowed.`
        );
      }
      const url = await this.uploadVideoToDO(file);
      urls.push(url);
    }
    return urls;
  }

  /**
   * Fetches a list of all uploaded videos for the current user/workflow.
   * (You may need to implement this endpoint on your backend.)
   */
  static async getAllVideos(): Promise<VideoInfo[]> {
    const response = await fetch(`${this.BASE_URL}/api/videos/list`, {
      credentials: "include",
    });
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to fetch videos" }));
      throw new Error(
        error.detail || `Failed to fetch videos: ${response.status}`
      );
    }
    return await response.json();
  }

  /**
   * Deletes a video by filename or unique identifier.
   * @param filename The filename or unique key of the video to delete.
   * @returns A message and the deleted filename.
   */
  static async deleteVideo(
    filename: string
  ): Promise<{ message: string; filename: string }> {
    const response = await fetch(
      `${this.BASE_URL}/api/videos/${encodeURIComponent(filename)}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    );
    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to delete video" }));
      throw new Error(
        error.detail || `Failed to delete video: ${response.status}`
      );
    }
    return await response.json();
  }

  /**
   * Formats a file size in bytes to a human-readable string.
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Formats an ISO date string to a human-readable date.
   */
  static formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
