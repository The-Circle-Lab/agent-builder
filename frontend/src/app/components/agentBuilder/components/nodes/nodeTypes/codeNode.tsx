import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCode } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import { CodeNodeConfig, codeNodeConfig } from "./configs/codeNodeConfig";
import { PlusButton } from "../components/plusButton";

export { codeNodeConfig };

export type CodeNodeData = NodeDataFromConfig<CodeNodeConfig>;

export interface CodeNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: CodeNodeData;
}

export class CodeNodeClass extends BaseNode<CodeNodeProps, CodeNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  public getNodeType(): string {
    return "code";
  }

  protected getConfig(): NodePropertyConfig {
    return codeNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faCode}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Code</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "left" // Use left shape - rounded on left, straight on right
        )}

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="tests-input"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute bottom-[70%] left-[105%] text-xs text-white font-medium">
          Tests
        </div>

        <PlusButton
          handleId="tests-input"
          objectType="Tests"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "35%",
            right: "-15%",
            transform: "translateX(50%)",
          }}
        />

        <Handle
          type="source"
          position={Position.Bottom}
          id="chat-output"
          style={{ top: "100%", right: "45%", transform: "translateY(-50%)" }}
        />

        <PlusButton
          handleId="chat-output"
          objectType="Agent"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "-50%",
            right: "45%",
            transform: "translateX(50%)",
          }}
        />

        <div className="absolute bottom-[-25%] left-4 text-xs text-white font-medium">
          Chatbot
        </div>
      </div>
    );
  }

  public getNextNode(_nodes?: Node[]): Node | null {
    if (!_nodes) return null;

    const { edges = [], id } = this.props;

    // Find the edge connected to the chat-output handle
    const outputEdge = edges.find(
      (edge) => edge.source === id && edge.sourceHandle === "chat-output"
    );

    if (!outputEdge) return null;

    // Find and return the target node
    const targetNode = _nodes.find((node) => node.id === outputEdge.target);
    return targetNode || null;
  }
}

// Functional component wrapper
export function CodeNode(props: CodeNodeProps) {
  return <CodeNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createCodeNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(CodeNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
