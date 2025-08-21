import React from "react";
import { Edge, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { LivePresentationPromptNodeConfig, livePresentationPromptNodeConfig } from "../configs/livePresentationPromptNodeConfig";

export { livePresentationPromptNodeConfig };

export type LivePresentationPromptNodeData = NodeDataFromConfig<LivePresentationPromptNodeConfig>;

export interface LivePresentationPromptNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[]; 
  data?: LivePresentationPromptNodeData;
}

export class LivePresentationPromptNodeClass extends BaseNode<LivePresentationPromptNodeProps, LivePresentationPromptNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";
  public static canAddNode = true; 

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "livepresentation-input": {
      maxConnections: 1,
      compatibleWith: ["livepresentation-output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "content",
    name: "Live Presentation Prompts",
    icon: "/tool.svg", // Using existing icon for now
    description: "Add saved prompts for live presentation",
  };

  public getNodeType(): string {
    return "livePresentationPrompt";
  }

  protected getConfig(): NodePropertyConfig {
    return livePresentationPromptNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faComments}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm text-center">Live Prompts</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="livepresentation-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function LivePresentationPromptNode(props: LivePresentationPromptNodeProps) {
  return <LivePresentationPromptNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createLivePresentationPromptNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(LivePresentationPromptNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
