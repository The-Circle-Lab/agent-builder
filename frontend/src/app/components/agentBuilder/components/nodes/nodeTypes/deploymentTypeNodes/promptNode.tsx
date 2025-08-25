import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData, Var } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { PromptNodeConfig, promptNodeConfig } from "../configs/promptNodeConfig";
import { PlusButton } from "../../components/plusButton";
import { useNodeContext } from "../../nodeContext";

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
      compatibleWith: ["prompt-input", "input"],
    },
    "output-page": {
      maxConnections: 1,
      compatibleWith: ["output"],
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
          Input
        </div>

        <PlusButton
          handleId="prompt-output"
          objectType="Submission"
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

    // Find the edge connected to the mcq-output handle
    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "prompt-output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = _nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }

  public nodeVariables(_nodes?: Node[]): Var[] {
    if (!_nodes) return [];

    const { edges = [], id } = this.props;

    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "prompt-output"
    );

    if (!outputEdge) return [];

    const targetNode = _nodes.find((node) => node.id === outputEdge.target);

    if (targetNode) {
      if (targetNode.data) {
        const currentValue = targetNode.data["submission_prompts"];
        console.log("currentValue", currentValue);
        console.log("page number", this.getCurrentPageId());
        console.log("in page", this.isInPage());
        const pageNumber = this.getCurrentPageId();

        const res: Var[] = [];
        if (currentValue instanceof Array) {
          for (const i in currentValue) {
            let type = currentValue[i]["mediaType"] || "text";
            if (type === "textarea") type = "text";
            const name = "prompt_" + pageNumber + "_" + type + "_" + i;

            const route: Var = {
              name: name,
              origin_type: "student",
              origin: "prompt",
              type: type,
              page: parseInt(pageNumber || "0"),
              index: parseInt(i || "0"),
            }

            console.log("route", route);
            res.push(route);
          }
        }

        return res;
      }
      
    }
    
    return [];
  }
}

// Functional component wrapper that provides context data
export function PromptNode(props: PromptNodeProps) {
  const { pageRelationships, nodes } = useNodeContext();
  
  // Merge context data with props, prioritizing props if they exist
  const enhancedProps = {
    ...props,
    pageRelationships: props.pageRelationships || pageRelationships,
    nodes: props.nodes || nodes,
  };
  
  return <PromptNodeClass {...enhancedProps} />;
}

// Node type factory for ReactFlow
export const createPromptNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void,
  pageRelationships?: Record<string, string[]>,
  nodes?: { id: string; type: string }[]
) =>
  BaseNode.createNodeType(PromptNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
    pageRelationships,
    nodes,
  });
