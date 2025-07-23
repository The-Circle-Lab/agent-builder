import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { PromptNodeConfig, promptNodeConfig } from "../configs/promptNodeConfig";
import { PlusButton } from "../../components/plusButton";

export { promptNodeConfig };

export type PromptNodeData = NodeDataFromConfig<PromptNodeConfig>;

export interface PromptNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: PromptNodeData;
}

export class PromptNodeClass extends BaseNode<PromptNodeProps, PromptNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "prompt-output": {
      maxConnections: -1,
      compatibleWith: ["prompt-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "starter",
    name: "Prompt",
    icon: "/prompt.svg",
    description: "Add a prompt node",
  };

  public getNodeType(): string {
    return "prompt";
  }

  protected getConfig(): NodePropertyConfig {
    return promptNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div className="flex flex-col items-center justify-center">
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center">
            <FontAwesomeIcon
              icon={faPen}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm text-center">Prompt</div>
          </div>,
          "flex flex-col items-center justify-center w-40 h-30",
          "left" // Use left shape - rounded on left, straight on right
        )}

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="prompt-output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute bottom-[70%] left-[105%] text-xs text-white font-medium">
          User Input
        </div>

        <PlusButton
          handleId="prompt-output"
          objectType="User Input"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "35%",
            right: "-15%",
            transform: "translateX(50%)",
          }}
        />
      </div>
    );
  }

  public getNextNode(_nodes?: Node[]): Node | null {
    if (!_nodes) return null;

    const { edges = [], id } = this.props;

    // Find the edge connected to the mcq-output handle
    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "mcq-output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = _nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }
}

// Functional component wrapper
export function PromptNode(props: PromptNodeProps) {
  return <PromptNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createPromptNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(PromptNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
