import React from "react";
import Image from "next/image";
import { Handle, Position, Edge, Node } from "@xyflow/react";
import { PlusButton } from "../../components/plusButton";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { agentNodeConfig, AgentNodeConfig } from "../configs/agentNodeConfig";

export { agentNodeConfig };

export type AgentNodeData = NodeDataFromConfig<AgentNodeConfig>;

export interface AgentNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: AgentNodeData;
}

export class AgentNodeClass extends BaseNode<AgentNodeProps, AgentNodeData> {
  public static canAddNode = true;
  public static defaultHandlerID: string | null = "agent-input";

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "llm-model": {
      maxConnections: 1,
      compatibleWith: ["llm-input"],
    },
    "tools": {
      maxConnections: -1,
      compatibleWith: ["mcp-input"],
    },
    "agent-input": {
      maxConnections: -1,
      compatibleWith: ["output", "chat-output"],
    },
    "output": {
      maxConnections: -1,
      compatibleWith: ["input", "agent-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "output",
    name: "AI Agent",
    icon: "/agent.svg",
    description: "Add a new AI agent",
  };

  public getNodeType(): string {
    return "agent";
  }

  protected getConfig(): NodePropertyConfig {
    return agentNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <Image
              src="/agent.svg"
              alt="Agent"
              width={64}
              height={64}
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <div className="text-white font-bold mt-2">AI Agent</div>
          </div>,
          "flex flex-col items-center w-47"
        )}

        {/* LLM Model Handle - Bottom Left */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="llm-model"
          style={{ left: "25%", bottom: "-2%", transform: "translateX(-50%)" }}
        />
        <div className="absolute bottom-[-15%] left-4 text-xs text-white font-medium">
          LLM Model
        </div>

        {/* Plus Button below LLM Model */}
        <PlusButton
          handleId="llm-model"
          objectType="LLM"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "-45px",
            left: "25%",
            transform: "translateX(-50%)",
          }}
        />

        {/* Tools Handle - Bottom Right */}
        <Handle
          type="source"
          position={Position.Bottom}
          id="tools"
          style={{ left: "75%", bottom: "-2%", transform: "translateX(-50%)" }}
        />
        <div className="absolute bottom-[-15%] right-8.5 text-xs text-white font-medium">
          Tools
        </div>

        {/* Plus Button below Tools */}
        <PlusButton
          handleId="tools"
          objectType="tools"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "-45px",
            right: "25%",
            transform: "translateX(50%)",
          }}
        />

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="agent-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />
        <div className="absolute top-[27%] right-[-21%] text-xs text-white font-medium">
          Output
        </div>

        <PlusButton
          handleId="output"
          objectType="Output"
          nodeId={id}
          edges={edges}
          onAddNodeClick={onAddNodeClick}
          position={{
            bottom: "41%",
            right: "-24%",
            transform: "translateX(-50%)",
          }}
        />
      </div>
    );
  }

  public checkNodeValidity(): boolean {
    const { edges = [], id } = this.props;

    // Check if LLM handle and output handle are connected
    const llmConnected = edges.some(
      (edge) => edge.source === id && edge.sourceHandle === "llm-model"
    );

    const outputConnected = edges.some(
      (edge) => edge.source === id && edge.sourceHandle === "output"
    );

    return llmConnected && outputConnected;
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
export function AgentNode(props: AgentNodeProps) {
  return <AgentNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createAgentNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(AgentNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
