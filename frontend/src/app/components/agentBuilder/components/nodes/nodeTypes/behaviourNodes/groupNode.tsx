import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserGroup } from "@fortawesome/free-solid-svg-icons";
import { Handle, Position, Edge, Node } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { groupNodeConfig, GroupNodeConfig } from "../configs/groupNodeConfig";

export { groupNodeConfig };

export type GroupNodeData = NodeDataFromConfig<GroupNodeConfig>;

export interface GroupNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: GroupNodeData;
}

export class GroupNodeClass extends BaseNode<GroupNodeProps, GroupNodeData> {
  public static canAddNode = true;
  public static defaultHandlerID: string | null = "agent-input";

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "group-input": {
      maxConnections: -1,
      compatibleWith: ["input"],
    },
    "group-output": {
      maxConnections: -1,
      compatibleWith: ["output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "behaviour",
    name: "Grouping Agent",
    icon: "/group.svg",
    description: "Add a new group",
  };

  public getNodeType(): string {
    return "group";
  }

  protected getConfig(): NodePropertyConfig {
    return groupNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faUserGroup}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Grouping Agent</div>
          </div>,
          "flex flex-col items-center justify-center w-42 h-30",
          "normal"
        )}

        {/* Input Handle - Left */}
        <Handle
          type="source"
          position={Position.Left}
          id="group-input"
          style={{ top: "50%", left: "-17.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute top-[27%] left-[-40%] text-xs text-white font-medium">
          Input
        </div>

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="group-output"
          style={{ top: "50%", right: "-17.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute top-[27%] right-[-45%] text-xs text-white font-medium">
          Output
        </div>
      </>
    );
  }

  public getNextNode(nodes?: Node[]): Node | null {
    if (!nodes) return null;

    const { edges = [], id } = this.props;

    // Find the edge connected to the output handle
    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }
}

// Functional component wrapper
export function GroupNode(props: GroupNodeProps) {
  return <GroupNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createGroupNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(GroupNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
