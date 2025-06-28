import * as agentNode from "./agentNode";
import * as googleCloudNode from "./googleCloudNode";
import * as openAINode from "./openAINode";
import * as anthropicNode from "./anthropicNode";
import * as chatNode from "./chatNode";
import * as outputNode from "./outputNode";
import * as mcpNode from "./mcpNode";
import { BaseNode, BaseNodeProps, BaseNodeData } from "./baseNode";

// Base classes and interfaces
export { BaseNode } from "./baseNode";

// Type for node class constructors
type NodeClassConstructor = new (props: BaseNodeProps) => BaseNode<
  BaseNodeProps,
  BaseNodeData
>;

export const NodeTypes = {
  agent: agentNode.AgentNode,
  googleCloud: googleCloudNode.GoogleCloudNode,
  openAI: openAINode.OpenAINode,
  anthropic: anthropicNode.AnthropicNode,
  chat: chatNode.ChatNode,
  result: outputNode.OutputNode,
  mcp: mcpNode.McpNode,
};

export const NodeClasses = {
  agent: agentNode.AgentNodeClass,
  googleCloud: googleCloudNode.GoogleCloudNodeClass,
  openAI: openAINode.OpenAINodeClass,
  anthropic: anthropicNode.AnthropicNodeClass,
  chat: chatNode.ChatNodeClass,
  result: outputNode.OutputNodeClass,
  mcp: mcpNode.McpNodeClass,
};

export const NodeConfigs = {
  agent: agentNode.agentNodeConfig,
  googleCloud: googleCloudNode.googleCloudNodeConfig,
  openAI: openAINode.openAINodeConfig,
  anthropic: anthropicNode.anthropicNodeConfig,
  chat: chatNode.chatNodeConfig,
  result: outputNode.outputNodeConfig,
  mcp: mcpNode.mcpNodeConfig,
};

export const NodeCreators = {
  agent: agentNode.createAgentNodeType,
  googleCloud: googleCloudNode.createGoogleCloudNodeType,
  openAI: openAINode.createOpenAINodeType,
  anthropic: anthropicNode.createAnthropicNodeType,
  chat: chatNode.createChatNodeType,
  result: outputNode.createOutputNodeType,
  mcp: mcpNode.createMcpNodeType,
};

// Registry of available node types (dynamically generated from NodeClasses)
export const AVAILABLE_NODE_TYPES = Object.values(NodeClasses).map(
  (NodeClass) => {
    const tempInstance = new (NodeClass as NodeClassConstructor)({
      id: "temp",
      data: {},
    });
    return tempInstance.getNodeType();
  }
);

export type AvailableNodeType = (typeof AVAILABLE_NODE_TYPES)[number];
