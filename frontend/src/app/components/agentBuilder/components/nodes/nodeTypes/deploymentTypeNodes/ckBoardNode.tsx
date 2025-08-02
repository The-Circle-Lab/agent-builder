import React from "react";
import { Edge, Handle, Position, Node } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComments } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig, HandleConfig, SideMenuInfo } from "../baseNode";
import { ChatNodeConfig, chatNodeConfig } from "../configs/chatNodeConfig";
import { PlusButton } from "../../components/plusButton";

export { chatNodeConfig };

export type ChatNodeData = NodeDataFromConfig<ChatNodeConfig>;

export interface ChatNodeProps extends BaseNodeProps {
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
  edges?: Edge[];
  data?: ChatNodeData;
}

export class ChatNodeClass extends BaseNode<ChatNodeProps, ChatNodeData> {
  public static nodeType: "base" | "start" | "end" = "start";
  public static canAddNode = true;

  // Handle configurations for this node type
  public static handleConfigs: Record<string, HandleConfig> = {
    "chat-output": {
      maxConnections: 1,
      compatibleWith: ["agent-input"],
    },
  };

  // Side menu information for this node type
  public static sideMenuInfo: SideMenuInfo = {
    category: "starter",
    name: "Chat",
    icon: "/chat.svg",
    description: "Add a chat node",
  };

  public getNodeType(): string {
    return "chat";
  }

  protected getConfig(): NodePropertyConfig {
    return chatNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    const { onAddNodeClick, id, edges = [] } = this.props;

    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faComments}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Chat</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "left" // Use left shape - rounded on left, straight on right
        )}

        {/* Output Handle - Right */}
        <Handle
          type="source"
          position={Position.Right}
          id="chat-output"
          style={{ top: "50%", right: "-1.25%", transform: "translateY(-50%)" }}
        />

        <PlusButton
          handleId="chat-output"
          objectType="Agent"
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

  public checkNodeValidity(): boolean {
    const { edges = [], id } = this.props;

    // Check if chat-output handle is connected
    const chatOutputConnected = edges.some(
      (edge) => edge.source === id && edge.sourceHandle === "chat-output"
    );

    // Return true only if chat-output handle is connected
    return chatOutputConnected;
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
export function ChatNode(props: ChatNodeProps) {
  return <ChatNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createChatNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void,
  edges: Edge[] = [],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(ChatNode, {
    onAddNodeClick,
    edges,
    onDelete,
    onSettings,
  });
