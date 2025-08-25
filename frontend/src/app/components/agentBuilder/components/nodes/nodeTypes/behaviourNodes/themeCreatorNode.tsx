import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPalette } from "@fortawesome/free-solid-svg-icons";
import { Handle, Position, Edge, Node } from "@xyflow/react";
import { NodePropertyConfig, NodeData, Var } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { themeCreatorNodeConfig, ThemeCreatorNodeConfig } from "../configs/themeCreatorNodeConfig";

export { themeCreatorNodeConfig };

export type ThemeCreatorNodeData = NodeDataFromConfig<ThemeCreatorNodeConfig>;

export interface ThemeCreatorNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: ThemeCreatorNodeData;
}

export class ThemeCreatorNodeClass extends BaseNode<ThemeCreatorNodeProps, ThemeCreatorNodeData> {
  public static canAddNode = true;
  public static defaultHandlerID: string | null = "agent-input";

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "theme-input": {
      maxConnections: -1,
      compatibleWith: ["input"],
    },
    "theme-output": {
      maxConnections: -1,
      compatibleWith: ["output"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "behaviour",
    name: "Theme Creator",
    icon: "/group.svg",
    description: "Create themes from selected submissions",
  };

  public getNodeType(): string {
    return "themeCreator";
  }

  protected getConfig(): NodePropertyConfig {
    return themeCreatorNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <>
        {this.renderBaseContainer(
          <div className="flex flex-col items-center justify-center w-full h-full">
            <FontAwesomeIcon
              icon={faPalette}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Theme Creator</div>
          </div>,
          "flex flex-col items-center justify-center w-42 h-30",
          "normal"
        )}

        {/* Input Handle - Left */}
        <Handle
          type="source"
          position={Position.Left}
          id="theme-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute top-[27%] left-[-20%] text-xs text-white font-medium">
          Input
        </div>

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="theme-output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute top-[27%] right-[-25%] text-xs text-white font-medium">
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
      (edge) => edge.source === id && edge.sourceHandle === "theme-output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }

  public nodeVariables(_nodes?: Node[]): Var[] {
    if (!_nodes) return [];

    const pageNumber = this.getCurrentPageId(); 
    const _var: Var = {
      name: "theme_" + pageNumber,
      origin_type: "behaviour",
      origin: "theme",
      type: "list",
      page: parseInt(pageNumber || "0"),
      index: 0,
    }

    return [_var];
  }
}

// Functional component wrapper
export function ThemeCreatorNode(props: ThemeCreatorNodeProps) {
  return <ThemeCreatorNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createThemeCreatorNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(ThemeCreatorNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });


