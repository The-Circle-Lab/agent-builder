import React from "react";
import { NodePropertyConfig, NodeData } from "../../types";
import {
  BaseNode,
  BaseNodeProps,
  NodeDataFromConfig,
  HandleConfig,
  SideMenuInfo,
} from "../baseNode";
import { VideoNodeConfig, videoNodeConfig } from "../configs/videoNodeConfig";

export { videoNodeConfig };

export type VideoNodeData = NodeDataFromConfig<VideoNodeConfig>;

export interface VideoNodeProps extends BaseNodeProps {
  data?: VideoNodeData;
}

export class VideoNodeClass extends BaseNode<VideoNodeProps, VideoNodeData> {
  public static handleConfigs: Record<string, HandleConfig> = {};

  public static sideMenuInfo: SideMenuInfo = {
    category: "Structure",
    name: "Video Upload",
    icon: "/tool.svg",
    description: "Upload supporting video content for this page",
  };

  public getNodeType(): string {
    return "video";
  }

  protected getConfig(): NodePropertyConfig {
    return videoNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const data = this.getData();
    const videos = Array.isArray(data.videos) ? data.videos : [];
    const videoCountLabel = videos.length === 1 ? "1 video" : `${videos.length} videos`;

    return (
      <div className="relative">
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center text-white space-y-2 w-32 h-24">
            <div className="text-3xl" role="img" aria-label="Video">🎬</div>
            <span className="text-sm font-semibold">Video Upload</span>
            <span className="text-xs text-gray-300">{videoCountLabel}</span>
          </div>
        )}
      </div>
    );
  }
}

export function VideoNode(props: VideoNodeProps) {
  return <VideoNodeClass {...props} />;
}

export const createVideoNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void,
) =>
  BaseNode.createNodeType(VideoNode, {
    onDelete,
    onSettings,
  });
