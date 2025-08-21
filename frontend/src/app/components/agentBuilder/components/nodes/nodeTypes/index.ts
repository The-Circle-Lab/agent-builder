import React from "react";
import * as agentNode from "./agenticNodes/agentNode";
import * as googleCloudNode from "./llmNodes/googleCloudNode";
import * as openAINode from "./llmNodes/openAINode";
import * as anthropicNode from "./llmNodes/anthropicNode";
import * as chatNode from "./deploymentTypeNodes/chatNode";
import * as outputNode from "./placeHolderNodes/outputNode";
import * as mcpNode from "./toolNodes/mcpNode";
import * as deepSeekNode from "./llmNodes/deepSeekNode";
import * as metaNode from "./llmNodes/metaNode";
import * as codeNode from "./deploymentTypeNodes/codeNode";
import * as testsNode from "./contentNodes/testsNode";
import * as codeAnalyzer from "./agenticNodes/codeAnalyzerNode"
import * as multipleChoiceNode from "./deploymentTypeNodes/multipleChoiceNode"
import * as questionsNode from "./contentNodes/questionsNode"
import * as promptNode from "./deploymentTypeNodes/promptNode"
import * as submissionNode from "./contentNodes/submissionNode"
import * as pageNode from "./pageNodes/pageNode"
import * as behaviourNode from "./pageNodes/behaviourNode"
import * as globalVariablesNode from "./pageNodes/globalVariablesNode"
import * as groupNode from "./behaviourNodes/groupNode"
import * as themeCreatorNode from "./behaviourNodes/themeCreatorNode"
import * as livePresentationNode from "./deploymentTypeNodes/livePresentationNode"
import * as livePresentationPromptNode from "./contentNodes/livePresentationPromptNode"
import { BaseNode, BaseNodeProps, BaseNodeData } from "./baseNode";

// Base classes and interfaces
export { BaseNode } from "./baseNode";

// Type for node class constructors
type NodeClassConstructor = {
  new (props: BaseNodeProps): BaseNode<BaseNodeProps, BaseNodeData>;
  nodeType?: "base" | "start" | "end";
  canAddNode?: boolean;
  defaultHandlerID?: string | null;
  handleConfigs?: Record<string, unknown>;
  sideMenuInfo?: unknown;
  getHandleConfigs?: () => Record<string, unknown>;
  getSideMenuInfo?: () => unknown;
};

// Type definitions for node module exports
type NodeComponent = React.ComponentType<BaseNodeProps>;
type NodeClass = NodeClassConstructor;
type NodeConfig = Record<string, unknown>;
type NodeCreator = (...args: unknown[]) => unknown;

// Registry of all node modules with their corresponding keys
const NODE_MODULES = {
  agent: agentNode,
  googleCloud: googleCloudNode,
  openAI: openAINode,
  anthropic: anthropicNode,
  chat: chatNode,
  result: outputNode, // Special case: outputNode -> result
  mcp: mcpNode,
  deepSeek: deepSeekNode,
  meta: metaNode,
  code: codeNode,
  tests: testsNode,
  codeAnalyzer: codeAnalyzer,
  mcq: multipleChoiceNode, // Special case: multipleChoiceNode -> mcq
  questions: questionsNode,
  prompt: promptNode,
  submission: submissionNode,
  page: pageNode,
  behaviour: behaviourNode,
  globalVariables: globalVariablesNode,
  group: groupNode,
  themeCreator: themeCreatorNode,
  livePresentation: livePresentationNode,
  livePresentationPrompt: livePresentationPromptNode,
} as const;

// Dynamically generate NodeTypes
export const NodeTypes = Object.entries(NODE_MODULES).reduce((acc, [key, module]) => {
  const nodeName = Object.keys(module).find(exportName => 
    exportName.endsWith('Node') && !exportName.endsWith('NodeClass') && !exportName.endsWith('NodeConfig')
  );
  if (nodeName && module[nodeName as keyof typeof module]) {
    acc[key] = module[nodeName as keyof typeof module];
  }
  return acc;
}, {} as Record<string, NodeComponent>);

// Dynamically generate NodeClasses
export const NodeClasses = Object.entries(NODE_MODULES).reduce((acc, [key, module]) => {
  const nodeClassName = Object.keys(module).find(exportName => exportName.endsWith('NodeClass'));
  if (nodeClassName && module[nodeClassName as keyof typeof module]) {
    acc[key] = module[nodeClassName as keyof typeof module];
  }
  return acc;
}, {} as Record<string, NodeClass>);

// Dynamically generate NodeConfigs
export const NodeConfigs = Object.entries(NODE_MODULES).reduce((acc, [key, module]) => {
  const configName = Object.keys(module).find(exportName => exportName.endsWith('NodeConfig'));
  if (configName && module[configName as keyof typeof module]) {
    acc[key] = module[configName as keyof typeof module];
  }
  return acc;
}, {} as Record<string, NodeConfig>);

// Dynamically generate NodeCreators
export const NodeCreators = Object.entries(NODE_MODULES).reduce((acc, [key, module]) => {
  const creatorName = Object.keys(module).find(exportName => exportName.startsWith('create') && exportName.endsWith('NodeType'));
  if (creatorName && module[creatorName as keyof typeof module]) {
    acc[key] = module[creatorName as keyof typeof module];
  }
  return acc;
}, {} as Record<string, NodeCreator>);

// Register NodeClasses with the connection config system to resolve circular dependency
if (typeof window !== 'undefined') {
  // Only run on client side
  import('../../../config/connectionConfig').then(({ registerNodeClasses }) => {
    registerNodeClasses(() => NodeClasses);
  });
}

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
