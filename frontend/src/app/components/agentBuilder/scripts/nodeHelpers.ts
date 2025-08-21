import { Node, Edge } from "@xyflow/react";
import { NodeClasses, NodeConfigs } from "../components/nodes/nodeTypes";
import { PropertyDefinition } from "../components/nodes/types";

// Type for node configuration with optional nested attachments
interface NodeConfigWithAttachments {
  type: string | undefined;
  config: Record<string, unknown>;
  attachments?: Record<string, unknown>;
}

// Interface for node config structure
interface NodeConfigStructure {
  properties: PropertyDefinition[];
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
export function getNodeConfig(node: Node, edges?: Edge[], nodes?: Node[], pageRelationships?: Record<string, string[]>) {
  const nodeConfig = NodeConfigs[node.type as keyof typeof NodeConfigs] as unknown as NodeConfigStructure;
  if (!nodeConfig) return {};

  // Merge the node's data with default values from config
  const config: Record<string, unknown> = {};

  // Add all properties from the node config with their values
  nodeConfig.properties.forEach((property: PropertyDefinition) => {
    const value =
      node.data?.[property.key] !== undefined
        ? node.data[property.key]
        : property.defaultValue;
    config[property.key] = value;
  });

  // Special handling for group nodes: expand selected_submission_prompts from IDs to full prompt details
  if (node.type === 'group' && edges && nodes && pageRelationships) {
    const selectedPromptIds = config['selected_submission_prompts'] as string[] || [];
    
    if (selectedPromptIds.length > 0) {
      // Get all available submission prompts
      const availablePrompts = getAvailableSubmissionPrompts(node.id, edges, nodes, pageRelationships);
      
      // Find the full prompt details for each selected ID
      const selectedPromptDetails: Array<{
        id: string;
        prompt: string;
        mediaType: string;
        nodeId: string;
        nodeLabel: string;
      }> = [];
      
      selectedPromptIds.forEach(selectedId => {
        availablePrompts.forEach(nodeInfo => {
          nodeInfo.prompts.forEach(prompt => {
            if (prompt.id === selectedId) {
              selectedPromptDetails.push({
                id: prompt.id,
                prompt: prompt.prompt,
                mediaType: prompt.mediaType,
                nodeId: nodeInfo.nodeId,
                nodeLabel: nodeInfo.nodeLabel
              });
            }
          });
        });
      });
      
      // Replace the ID array with full prompt details for the backend
      config['selected_submission_prompts'] = selectedPromptDetails;
    }
  }

  return config;
}

// Helper function to find all submission nodes connected via behavior/page nodes
export function findConnectedSubmissionNodes(
  groupNodeId: string,
  edges: Edge[],
  nodes: Node[],
  pageRelationships?: Record<string, string[]>
): Node[] {
  const submissionNodes: Node[] = [];
  const visitedNodes = new Set<string>();

  // First, let's check if there are ANY submission nodes in the entire workflow
  const allSubmissionNodes = nodes.filter(node => node.type === 'submission');

  // Helper function to recursively traverse connections
  function traverseConnections(nodeId: string, depth = 0) {
    if (visitedNodes.has(nodeId) || depth > 10) return; // Prevent infinite loops and limit depth
    visitedNodes.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) {
      return;
    }
    
    // Check if this node has any outgoing edges to see what it connects to
    const outgoingEdges = edges.filter(edge => edge.source === nodeId);

    // If this is a submission node, add it to our collection
    if (node.type === 'submission') {
      submissionNodes.push(node);
      return;
    }

    // If this is a page or behaviour node, check nodes inside it
    if ((node.type === 'page' || node.type === 'behaviour') && pageRelationships) {
      const nodesInContainer = pageRelationships[nodeId] || [];
      nodesInContainer.forEach(containedNodeId => {
        traverseConnections(containedNodeId, depth + 1);
      });
    }

    // Follow outgoing connections from this node (but don't re-filter, we already have them)
    outgoingEdges.forEach(edge => {
      traverseConnections(edge.target, depth + 1);
    });
  }

  // Start traversal from the group node's output connections
  const groupOutputEdges = edges.filter(edge => 
    edge.source === groupNodeId && edge.sourceHandle === 'group-output'
  );
  
  groupOutputEdges.forEach(edge => {
    traverseConnections(edge.target);
  });

  // FALLBACK: Check if there are any submission nodes that exist but weren't found by traversal
  // This can happen if pageRelationships data is out of sync OR if submission nodes are in separate flows
  if (submissionNodes.length === 0 && allSubmissionNodes.length > 0) {
    // For grouping purposes, we should include ALL submission nodes that are reachable
    // from the same page structure that the group node can access
    submissionNodes.push(...allSubmissionNodes);
  }

  return submissionNodes;
}

// Helper function to extract all submission prompts from submission nodes
export function getAvailableSubmissionPrompts(
  groupNodeId: string,
  edges: Edge[],
  nodes: Node[],
  pageRelationships?: Record<string, string[]>
): Array<{ nodeId: string; nodeLabel: string; prompts: Array<{ id: string; prompt: string; mediaType: string }> }> {
  const submissionNodes = findConnectedSubmissionNodes(groupNodeId, edges, nodes, pageRelationships);
  
  return submissionNodes.map(node => {
    const nodeData = node.data as { label?: string; submission_prompts?: Array<{ prompt?: string; mediaType?: string }> };
    const submissionPrompts = nodeData?.submission_prompts || [];
    
    return {
      nodeId: node.id,
      nodeLabel: nodeData?.label || `Submission Node ${node.id.slice(0, 8)}`,
      prompts: submissionPrompts.map((prompt, index: number) => ({
        id: `${node.id}-prompt-${index}`,
        prompt: prompt.prompt || '',
        mediaType: prompt.mediaType || 'textarea'
      }))
    };
  }).filter(nodeInfo => nodeInfo.prompts.length > 0);
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
          config: getNodeConfig(llmNode, edges, nodes),
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
          config: getNodeConfig(toolNode, edges, nodes),
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
          config: getNodeConfig(testsNode, edges, nodes),
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
          config: getNodeConfig(analyzerNode, edges, nodes),
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
          config: getNodeConfig(llmNode, edges, nodes),
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
          config: getNodeConfig(questionsNode, edges, nodes),
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
