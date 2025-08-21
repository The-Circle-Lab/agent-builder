import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChalkboardTeacher } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { LivePresentationNodeConfig, livePresentationNodeConfig } from "../configs/livePresentationNodeConfig";
import { PlusButton } from "../../components/plusButton";

export { livePresentationNodeConfig };

export type LivePresentationNodeData = NodeDataFromConfig<LivePresentationNodeConfig>;

export interface LivePresentationNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: LivePresentationNodeData;
}

export class LivePresentationNodeClass extends BaseNode<LivePresentationNodeProps, LivePresentationNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "livepresentation-output": {
      maxConnections: -1,
      compatibleWith: ["livepresentation-input", "input"],
    },
    "output-page": {
      maxConnections: 1,
      compatibleWith: ["output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "starter",
    name: "Live Presentation",
    icon: "/agent.svg", // Using existing icon for now
    description: "Add a live presentation node",
  };

  public getNodeType(): string {
    return "livePresentation";
  }

  protected getConfig(): NodePropertyConfig {
    return livePresentationNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div className="flex flex-col items-center justify-center">
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center">
            <FontAwesomeIcon
              icon={faChalkboardTeacher}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm text-center">Live Presentation</div>
          </div>,
          "flex flex-col items-center justify-center w-40 h-30",
          "left" // Use left shape - rounded on left, straight on right
        )}

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="livepresentation-output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute bottom-[70%] left-[105%] text-xs text-white font-medium">
          Prompts
        </div>

        <PlusButton
          handleId="livepresentation-output"
          objectType="LivePresentationPrompt"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "35%",
            right: "-15%",
            transform: "translateX(50%)",
          }}
        />

        {/* Page Output Handle - Down */}
        <Handle
          type="target"
          position={Position.Bottom}
          id="output-page"
          style={{ top: "100%", left: "50%", transform: "translateX(-50%)" }}
        />
      </div>
    );
  }

  public getNextNode(_nodes?: Node[]): Node | null {
    if (!_nodes) return null;

    const { edges = [], id } = this.props;

    // Find the edge connected to the livepresentation-output handle
    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "livepresentation-output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = _nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }
}

// Functional component wrapper
export function LivePresentationNode(props: LivePresentationNodeProps) {
  return <LivePresentationNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createLivePresentationNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(LivePresentationNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
