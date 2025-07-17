import { Node, Edge } from "@xyflow/react";
import { NodeClasses, NodeConfigs } from "../components/nodes/nodeTypes";

// Type for node configuration with optional nested attachments
interface NodeConfigWithAttachments {
  type: string | undefined;
  config: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

// Finds the 'starting' node
export function findStartingNode(nodes: Node[]): Node | null {
  for (const node of nodes) {
    const nodeClass = NodeClasses[node.type as keyof typeof NodeClasses];

    if (nodeClass && nodeClass.nodeType === "start") {
      return node;
    }
  }

  return null;
}

// Helper function to get connected nodes for a specific handle
export function getConnectedNodes(
  sourceNodeId: string,
  handleId: string,
  edges: Edge[],
  nodes: Node[]
): Node[] {
  const connectedEdges = edges.filter(
    (edge) => edge.source === sourceNodeId && edge.sourceHandle === handleId
  );

  return connectedEdges
    .map((edge) => {
      const targetNode = nodes.find((node) => node.id === edge.target);
      return targetNode;
    })
    .filter((node) => node !== undefined) as Node[];
}

// Helper function to get node configuration with data
export function getNodeConfig(node: Node) {
  const nodeConfig = NodeConfigs[node.type as keyof typeof NodeConfigs];
  if (!nodeConfig) return {};

  // Merge the node's data with default values from config
  const config: Record<string, unknown> = {};

  // Add all properties from the node config with their values
  nodeConfig.properties.forEach((property) => {
    const value =
      node.data?.[property.key] !== undefined
        ? node.data[property.key]
        : property.defaultValue;
    config[property.key] = value;
  });

  return config;
}

// Helper function to get attachments for specific node types (recursive)
export function getNodeAttachments(
  node: Node,
  edges: Edge[],
  nodes: Node[],
  visitedNodes: Set<string> = new Set()
): Record<string, unknown> | undefined {
  // Prevent infinite loops
  if (visitedNodes.has(node.id)) {
    return undefined;
  }
  
  visitedNodes.add(node.id);

  if (node.type === "agent") {
    const attachments: Record<string, unknown> = {};

    // Get LLM model attachments
    const llmNodes = getConnectedNodes(node.id, "llm-model", edges, nodes);
    if (llmNodes.length > 0) {
      attachments.llmModel = llmNodes.map((llmNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: llmNode.type,
          config: getNodeConfig(llmNode),
        };
        
        // Recursively get attachments of the LLM node
        const nestedAttachments = getNodeAttachments(llmNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }

    // Get tools attachments
    const toolNodes = getConnectedNodes(node.id, "tools", edges, nodes);
    if (toolNodes.length > 0) {
      attachments.tools = toolNodes.map((toolNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: toolNode.type,
          config: getNodeConfig(toolNode),
        };
        
        // Recursively get attachments of the tool node
        const nestedAttachments = getNodeAttachments(toolNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }

    return Object.keys(attachments).length > 0 ? attachments : undefined;
  } else if (node.type === "code") {
    const attachments: Record<string, unknown> = {};
    const testsNodes = getConnectedNodes(node.id, "tests-input", edges, nodes);
    if (testsNodes.length > 0) {
      attachments.tests = testsNodes.map((testsNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: testsNode.type,
          config: getNodeConfig(testsNode),
        };
        
        // Recursively get attachments of the tests node
        const nestedAttachments = getNodeAttachments(testsNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }
    
    return Object.keys(attachments).length > 0 ? attachments : undefined;
  } else if (node.type === "tests") {
    const attachments: Record<string, unknown> = {};
    
    // Get code analyzer attachments
    const codeAnalyzerNodes = getConnectedNodes(node.id, "analyzer-output", edges, nodes);
    if (codeAnalyzerNodes.length > 0) {
      attachments.codeAnalyzers = codeAnalyzerNodes.map((analyzerNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: analyzerNode.type,
          config: getNodeConfig(analyzerNode),
        };
        
        // Recursively get attachments of the code analyzer node
        const nestedAttachments = getNodeAttachments(analyzerNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }
    
    return Object.keys(attachments).length > 0 ? attachments : undefined;
  } else if (node.type === "codeAnalyzer") {
    const attachments: Record<string, unknown> = {};
    
    // Get LLM model attachments for code analyzer
    const llmNodes = getConnectedNodes(node.id, "llm-model", edges, nodes);
    if (llmNodes.length > 0) {
      attachments.llmModel = llmNodes.map((llmNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: llmNode.type,
          config: getNodeConfig(llmNode),
        };
        
        // Recursively get attachments of the LLM node
        const nestedAttachments = getNodeAttachments(llmNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }
    
    return Object.keys(attachments).length > 0 ? attachments : undefined;
  } else if (node.type === "mcq") {
    const attachments: Record<string, unknown> = {};
    
    // Get questions attachments
    const questionsNodes = getConnectedNodes(node.id, "mcq-output", edges, nodes);
    if (questionsNodes.length > 0) {
      attachments.questions = questionsNodes.map((questionsNode) => {
        const nodeConfig: NodeConfigWithAttachments = {
          type: questionsNode.type,
          config: getNodeConfig(questionsNode),
        };
        
        // Recursively get attachments of the questions node
        const nestedAttachments = getNodeAttachments(questionsNode, edges, nodes, new Set(visitedNodes));
        if (nestedAttachments) {
          nodeConfig.attachments = nestedAttachments;
        }
        
        return nodeConfig;
      });
    }
    
    return Object.keys(attachments).length > 0 ? attachments : undefined;
  }

  return undefined;
}
