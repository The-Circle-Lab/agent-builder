import { API_CONFIG } from "@/lib/constants";

/**
 * Video deployment session info returned from the backend.
 */
export interface VideoSession {
  title: string;
  video_url: string;
}

/**
 * API class for interacting with video deployments.
 */
export class VideoDeploymentAPI {
  /**
   * Fetch video session info for a deployment.
   * @param deploymentId The deployment ID.
   * @returns VideoSession object with title and video_url.
   */
  static async getVideoSession(deploymentId: string): Promise<VideoSession> {
    if (!deploymentId?.trim()) {
      throw new Error("Deployment ID is required");
    }

    const response = await fetch(
      `${API_CONFIG.BASE_URL}/api/deploy/${deploymentId}/video`,
      {
        credentials: "include",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }

    return await response.json();
  }
}
