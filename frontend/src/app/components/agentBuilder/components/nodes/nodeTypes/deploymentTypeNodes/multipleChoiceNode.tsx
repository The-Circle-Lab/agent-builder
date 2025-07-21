import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSchool } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { MultipleChoiceNodeConfig, multipleChoiceNodeConfig } from "../configs/multipleChoiceNodeConfig";
import { PlusButton } from "../../components/plusButton";

export { multipleChoiceNodeConfig };

export type MultipleChoiceNodeData = NodeDataFromConfig<MultipleChoiceNodeConfig>;

export interface MultipleChoiceNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: MultipleChoiceNodeData;
}

export class MultipleChoiceNodeClass extends BaseNode<MultipleChoiceNodeProps, MultipleChoiceNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "mcq-output": {
      maxConnections: -1,
      compatibleWith: ["mcq-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "starter",
    name: "Multiple Choice",
    icon: "/mcq.svg",
    description: "Add a multiple choice node",
  };

  public getNodeType(): string {
    return "mcq";
  }

  protected getConfig(): NodePropertyConfig {
    return multipleChoiceNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div className="flex flex-col items-center justify-center">
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center">
            <FontAwesomeIcon
              icon={faSchool}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm text-center">Multiple Choice</div>
          </div>,
          "flex flex-col items-center justify-center w-40 h-30",
          "left" // Use left shape - rounded on left, straight on right
        )}

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="mcq-output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute bottom-[70%] left-[105%] text-xs text-white font-medium">
          Questions
        </div>

        <PlusButton
          handleId="mcq-output"
          objectType="Questions"
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
export function MultipleChoiceNode(props: MultipleChoiceNodeProps) {
  return <MultipleChoiceNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createMultipleChoiceNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(MultipleChoiceNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
