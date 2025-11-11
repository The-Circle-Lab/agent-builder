import { getApiConfig } from "@/lib/config";

export interface VideoAssetDetails {
  id: string;
  filename?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  uploaded_at?: string | null;
  status?: string | null;
  stream_url?: string | null;
  download_url?: string | null;
  thumbnail_url?: string | null;
  source?: string | null;
}

export interface VideoDeploymentDetails {
  deployment_id: string;
  video: VideoAssetDetails | null;
  message?: string | null;
}

export class VideoDeploymentAPI {
  private static readonly BASE_URL = getApiConfig().base_url;

  static async getVideoDetails(
    deploymentId: string
  ): Promise<VideoDeploymentDetails> {
    const response = await fetch(
      `${this.BASE_URL}/api/deploy/${encodeURIComponent(deploymentId)}/video`,
      {
        credentials: "include",
      }
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ detail: "Failed to fetch video deployment" }));
      throw new Error(
        error.detail || `Failed to fetch video deployment: ${response.status}`
      );
    }

    return await response.json();
  }
}
