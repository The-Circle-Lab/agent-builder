import React from "react";
import { Edge } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { NodePropertyConfig, NodeData } from "../../types";
import {
  BaseNode,
  BaseNodeProps,
  NodeDataFromConfig,
  SideMenuInfo,
} from "../baseNode";
import { VideoNodeConfig, videoNodeConfig } from "../configs/videoNodeConfig";
import { faVideo } from "@fortawesome/free-solid-svg-icons/faVideo";

export { videoNodeConfig };

export type VideoNodeData = NodeDataFromConfig<VideoNodeConfig>;

export interface VideoNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: VideoNodeData;
}

export class VideoNodeClass extends BaseNode<VideoNodeProps, VideoNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "starter",
    name: "Video",
    icon: "video.svg",
    description: "Add a video node",
  };

  public getNodeType(): string {
    return "video";
  }

  protected getConfig(): NodePropertyConfig {
    return videoNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div className="flex flex-col items-center justify-center">
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center">
            <FontAwesomeIcon
              icon={faVideo}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm text-center">
              Video
            </div>
          </div>,
          "flex flex-col items-center justify-center w-40 h-30",
          "left" // Use left shape - rounded on left, straight on right
        )}
      </div>
    );
  }
}

// Functional component wrapper
export function VideoNode(props: VideoNodeProps) {
  return <VideoNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createVideoNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges?: Edge[],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(VideoNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
