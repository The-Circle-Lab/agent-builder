import * as agentNode from "./agentNode";
import * as googleCloudNode from "./googleCloudNode";
import * as openAINode from "./openAINode";
import * as anthropicNode from "./anthropicNode";
import * as chatNode from "./chatNode";
import * as outputNode from "./outputNode";
import * as mcpNode from "./mcpNode";
import * as deepSeekNode from "./deepSeekNode";
import * as metaNode from "./metaNode";
import * as codeNode from "./codeNode";
import * as testsNode from "./testsNode";
import * as codeAnalyzer from "./codeAnalyzerNode"
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
  deepseek: deepSeekNode.DeepSeekNode,
  meta: metaNode.MetaNode,
  chat: chatNode.ChatNode,
  code: codeNode.CodeNode,
  result: outputNode.OutputNode,
  mcp: mcpNode.McpNode,
  tests: testsNode.TestsNode,
  codeAnalyzer: codeAnalyzer.CodeAnalyzerNode
};

export const NodeClasses = {
  agent: agentNode.AgentNodeClass,
  googleCloud: googleCloudNode.GoogleCloudNodeClass,
  openAI: openAINode.OpenAINodeClass,
  anthropic: anthropicNode.AnthropicNodeClass,
  chat: chatNode.ChatNodeClass,
  code: codeNode.CodeNodeClass,
  result: outputNode.OutputNodeClass,
  mcp: mcpNode.McpNodeClass,
  deepSeek: deepSeekNode.DeepSeekNodeClass,
  meta: metaNode.MetaNodeClass,
  tests: testsNode.TestsNodeClass,
  codeAnalyzer: codeAnalyzer.CodeAnalyzerNodeClass
};

export const NodeConfigs = {
  agent: agentNode.agentNodeConfig,
  googleCloud: googleCloudNode.googleCloudNodeConfig,
  openAI: openAINode.openAINodeConfig,
  anthropic: anthropicNode.anthropicNodeConfig,
  chat: chatNode.chatNodeConfig,
  code: codeNode.codeNodeConfig,
  result: outputNode.outputNodeConfig,
  mcp: mcpNode.mcpNodeConfig,
  deepSeek: deepSeekNode.deepSeekNodeConfig,
  meta: metaNode.metaNodeConfig,
  tests: testsNode.testsNodeConfig,
  codeAnalyzer: codeAnalyzer.codeAnalyzerNodeConfig
};

export const NodeCreators = {
  agent: agentNode.createAgentNodeType,
  googleCloud: googleCloudNode.createGoogleCloudNodeType,
  openAI: openAINode.createOpenAINodeType,
  anthropic: anthropicNode.createAnthropicNodeType,
  chat: chatNode.createChatNodeType,
  code: codeNode.createCodeNodeType,
  result: outputNode.createOutputNodeType,
  mcp: mcpNode.createMcpNodeType,
  deepSeek: deepSeekNode.createDeepSeekNodeType,
  meta: metaNode.createMetaNodeType,
  tests: testsNode.createTestsNodeType,
  codeAnalyzer: codeAnalyzer.createCodeAnalyzerNodeType
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
