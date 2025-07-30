import { Node, Edge } from "@xyflow/react";
import { NodeClasses } from "../components/nodes/nodeTypes";
import {
  findStartingNode,
  getNodeConfig,
  getNodeAttachments,
} from "./nodeHelpers";

// Helper function to extract variable name from variable handle ID
function getVariableNameFromHandle(handleId: string, globalVariablesNodes: Node[]): string | null {
  // Extract variable ID from handle (format: var-XXX-input or var-XXX-output)
  const variableIdMatch = handleId.match(/^(var-[^-]+-[^-]+)/);
  if (!variableIdMatch) return null;
  
  const variableId = variableIdMatch[1];
  
  // Find the variable in all globalVariables nodes
  for (const node of globalVariablesNodes) {
    const variables = (node.data as { variables?: Array<{ id: string; name: string; type: string }> })?.variables || [];
    const variable = variables.find(v => v.id === variableId);
    if (variable) {
      return variable.name;
    }
  }
  
  return null;
}

// Creates a JSON representation of the workflow for export to backend
export function createWorkflowJSON(nodes: Node[], edges: Edge[], pageRelationships?: Record<string, string[]>) {
  // Check if the workflow is valid for deployment
  if (!checkWorkflowValidity(nodes, edges)) {
    throw new Error("Invalid workflow: Make sure your workflow has a chat node connected to other nodes and ends with an output node.");
  }

  // Check if pages or behaviours exist in the workflow
  const pagesExist = nodes.some(node => node.type === 'page');
  const behavioursExist = nodes.some(node => node.type === 'behaviour');

  if ((pagesExist || behavioursExist) && pageRelationships) {
    // Organize workflow by pages and behaviours
    const workflow: {
      pagesExist: boolean;
      behavioursExist: boolean;
      variables: Record<string, string>;
      pages: Record<number, {
        input_type: string | null;
        input_id: string | null;
        input_node: boolean;
        output_type: string | null;
        output_id: string | null;
        output_node: boolean;
        nodes: Record<number, {
          type: string;
          config: Record<string, unknown>;
          attachments?: Record<string, unknown>;
        }>;
      }>;
      behaviours: Record<number, {
        input_type: string | null;
        input_id: string | null;
        input_node: boolean;
        output_type: string | null;
        output_id: string | null;
        output_node: boolean;
        nodes: Record<number, {
          type: string;
          config: Record<string, unknown>;
          attachments?: Record<string, unknown>;
        }>;
      }>;
    } = {
      pagesExist,
      behavioursExist,
      variables: {},
      pages: {},
      behaviours: {},
    };

    // Extract all variables from globalVariables nodes
    const globalVariablesNodes = nodes.filter(node => node.type === 'globalVariables');
    globalVariablesNodes.forEach(node => {
      const variables = (node.data as { variables?: Array<{ name: string; type: string }> })?.variables || [];
      variables.forEach(variable => {
        workflow.variables[variable.name] = variable.type;
      });
    });

    // Get all page nodes and sort by page number
    const pageNodes = nodes
      .filter(node => node.type === 'page')
      .sort((a, b) => {
        const aPageNumber = (a.data as { pageNumber?: number })?.pageNumber || 1;
        const bPageNumber = (b.data as { pageNumber?: number })?.pageNumber || 1;
        return aPageNumber - bPageNumber;
      });

    // Process each page
    pageNodes.forEach((pageNode) => {
      const pageNumber = (pageNode.data as { pageNumber?: number })?.pageNumber || 1;
      const nodesInPage = pageRelationships[pageNode.id] || [];
      
      // Find input connections to this page
      const inputEdge = edges.find(edge => 
        edge.target === pageNode.id && edge.targetHandle === 'input'
      );
      let inputType = null;
      let inputId = null;
      if (inputEdge) {
        const sourceNode = nodes.find(n => n.id === inputEdge.source);
        if (sourceNode?.type === 'page') {
          inputType = 'page';
          inputId = String((sourceNode.data as { pageNumber?: number })?.pageNumber || 1);
        } else if (sourceNode?.type === 'behaviour') {
          inputType = 'behaviour';
          inputId = String((sourceNode.data as { pageNumber?: number })?.pageNumber || 1);
        } else if (sourceNode?.type === 'globalVariables') {
          inputType = 'variable';
          inputId = getVariableNameFromHandle(inputEdge.sourceHandle || '', globalVariablesNodes);
        }
      }

      // Find output connections from this page
      const outputEdges = edges.filter(edge => 
        edge.source === pageNode.id && edge.sourceHandle === 'output'
      );
      let outputType = null;
      let outputId = null;
      let outputNode = false;
      
      if (outputEdges.length > 0) {
        // Check for page/behaviour/variable connections
        const pageOrBehaviourOrVariableEdge = outputEdges.find(edge => {
          const targetNode = nodes.find(n => n.id === edge.target);
          return targetNode?.type === 'page' || targetNode?.type === 'behaviour' || targetNode?.type === 'globalVariables';
        });
        
        if (pageOrBehaviourOrVariableEdge) {
          const targetNode = nodes.find(n => n.id === pageOrBehaviourOrVariableEdge.target);
          if (targetNode?.type === 'page') {
            outputType = 'page';
            outputId = String((targetNode.data as { pageNumber?: number })?.pageNumber || 1);
          } else if (targetNode?.type === 'behaviour') {
            outputType = 'behaviour';
            outputId = String((targetNode.data as { pageNumber?: number })?.pageNumber || 1);
          } else if (targetNode?.type === 'globalVariables') {
            outputType = 'variable';
            outputId = getVariableNameFromHandle(pageOrBehaviourOrVariableEdge.targetHandle || '', globalVariablesNodes);
          }
        }
        
        // Check for node connections (non-page/behaviour/globalVariables)
        const nodeEdge = outputEdges.find(edge => {
          const targetNode = nodes.find(n => n.id === edge.target);
          return targetNode && targetNode.type !== 'page' && targetNode.type !== 'behaviour' && targetNode.type !== 'globalVariables';
        });
        outputNode = !!nodeEdge;
      }

      // Check for input connections from regular nodes (non-page/behaviour/globalVariables)
      const inputEdges = edges.filter(edge => 
        edge.target === pageNode.id && edge.targetHandle === 'input'
      );
      let inputNode = false;
      if (inputEdges.length > 0) {
        const nodeInputEdge = inputEdges.find(edge => {
          const sourceNode = nodes.find(n => n.id === edge.source);
          return sourceNode && sourceNode.type !== 'page' && sourceNode.type !== 'behaviour' && sourceNode.type !== 'globalVariables';
        });
        inputNode = !!nodeInputEdge;
      }

      workflow.pages[pageNumber] = {
        input_type: inputType,
        input_id: inputId,
        input_node: inputNode,
        output_type: outputType,
        output_id: outputId,
        output_node: outputNode,
        nodes: {}
      };
      
      // Process nodes in this page
      let nodeIndex = 1;
      nodesInPage.forEach((nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && node.type !== 'page') {
          // Get node configuration
          const config = getNodeConfig(node);
          
          // Get attachments for specific node types
          const attachments = getNodeAttachments(node, edges, nodes);
          
          // Create the workflow entry
          const workflowEntry: {
            type: string;
            config: Record<string, unknown>;
            attachments?: Record<string, unknown>;
          } = {
            type: node.type || "unknown",
            config,
          };
          
          if (attachments) {
            workflowEntry.attachments = attachments;
          }
          
          workflow.pages[pageNumber].nodes[nodeIndex] = workflowEntry;
          nodeIndex++;
        }
      });
    });

    // Get all behaviour nodes and sort by page number (using pageNumber property)
    const behaviourNodes = nodes
      .filter(node => node.type === 'behaviour')
      .sort((a, b) => {
        const aPageNumber = (a.data as { pageNumber?: number })?.pageNumber || 1;
        const bPageNumber = (b.data as { pageNumber?: number })?.pageNumber || 1;
        return aPageNumber - bPageNumber;
      });

    // Process each behaviour
    behaviourNodes.forEach((behaviourNode) => {
      const behaviourNumber = (behaviourNode.data as { pageNumber?: number })?.pageNumber || 1;
      const nodesInBehaviour = pageRelationships[behaviourNode.id] || [];
      
      // Find input connections to this behaviour
      const inputEdge = edges.find(edge => 
        edge.target === behaviourNode.id && edge.targetHandle === 'input'
      );
      let inputType = null;
      let inputId = null;
      if (inputEdge) {
        const sourceNode = nodes.find(n => n.id === inputEdge.source);
        if (sourceNode?.type === 'page') {
          inputType = 'page';
          inputId = String((sourceNode.data as { pageNumber?: number })?.pageNumber || 1);
        } else if (sourceNode?.type === 'behaviour') {
          inputType = 'behaviour';
          inputId = String((sourceNode.data as { pageNumber?: number })?.pageNumber || 1);
        } else if (sourceNode?.type === 'globalVariables') {
          inputType = 'variable';
          inputId = getVariableNameFromHandle(inputEdge.sourceHandle || '', globalVariablesNodes);
        }
      }

      // Find output connections from this behaviour
      const outputEdges = edges.filter(edge => 
        edge.source === behaviourNode.id && edge.sourceHandle === 'output'
      );
      let outputType = null;
      let outputId = null;
      let outputNode = false;
      
      if (outputEdges.length > 0) {
        // Check for page/behaviour/variable connections
        const pageOrBehaviourOrVariableEdge = outputEdges.find(edge => {
          const targetNode = nodes.find(n => n.id === edge.target);
          return targetNode?.type === 'page' || targetNode?.type === 'behaviour' || targetNode?.type === 'globalVariables';
        });
        
        if (pageOrBehaviourOrVariableEdge) {
          const targetNode = nodes.find(n => n.id === pageOrBehaviourOrVariableEdge.target);
          if (targetNode?.type === 'page') {
            outputType = 'page';
            outputId = String((targetNode.data as { pageNumber?: number })?.pageNumber || 1);
          } else if (targetNode?.type === 'behaviour') {
            outputType = 'behaviour';
            outputId = String((targetNode.data as { pageNumber?: number })?.pageNumber || 1);
          } else if (targetNode?.type === 'globalVariables') {
            outputType = 'variable';
            outputId = getVariableNameFromHandle(pageOrBehaviourOrVariableEdge.targetHandle || '', globalVariablesNodes);
          }
        }
        
        // Check for node connections (non-page/behaviour/globalVariables)
        const nodeEdge = outputEdges.find(edge => {
          const targetNode = nodes.find(n => n.id === edge.target);
          return targetNode && targetNode.type !== 'page' && targetNode.type !== 'behaviour' && targetNode.type !== 'globalVariables';
        });
        outputNode = !!nodeEdge;
      }

      // Check for input connections from regular nodes (non-page/behaviour/globalVariables)
      const inputEdges = edges.filter(edge => 
        edge.target === behaviourNode.id && edge.targetHandle === 'input'
      );
      let inputNode = false;
      if (inputEdges.length > 0) {
        const nodeInputEdge = inputEdges.find(edge => {
          const sourceNode = nodes.find(n => n.id === edge.source);
          return sourceNode && sourceNode.type !== 'page' && sourceNode.type !== 'behaviour' && sourceNode.type !== 'globalVariables';
        });
        inputNode = !!nodeInputEdge;
      }

      workflow.behaviours[behaviourNumber] = {
        input_type: inputType,
        input_id: inputId,
        input_node: inputNode,
        output_type: outputType,
        output_id: outputId,
        output_node: outputNode,
        nodes: {}
      };
      
      // Process nodes in this behaviour
      let nodeIndex = 1;
      nodesInBehaviour.forEach((nodeId) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && node.type !== 'behaviour') {
          // Get node configuration
          const config = getNodeConfig(node);
          
          // Get attachments for specific node types
          const attachments = getNodeAttachments(node, edges, nodes);
          
          // Create the workflow entry
          const workflowEntry: {
            type: string;
            config: Record<string, unknown>;
            attachments?: Record<string, unknown>;
          } = {
            type: node.type || "unknown",
            config,
          };
          
          if (attachments) {
            workflowEntry.attachments = attachments;
          }
          
          workflow.behaviours[behaviourNumber].nodes[nodeIndex] = workflowEntry;
          nodeIndex++;
        }
      });
    });

    return JSON.stringify(workflow, null, 2);
  } else {
    // Original workflow structure when no pages or behaviours exist
    const workflow: {
      pagesExist: boolean;
      behavioursExist: boolean;
      variables: Record<string, string>;
      nodes: Record<
        number,
        {
          type: string;
          config: Record<string, unknown>;
          attachments?: Record<string, unknown>;
        }
      >;
    } = {
      pagesExist,
      behavioursExist,
      variables: {},
      nodes: {},
    };

    // Extract all variables from globalVariables nodes
    const globalVariablesNodes = nodes.filter(node => node.type === 'globalVariables');
    globalVariablesNodes.forEach(node => {
      const variables = (node.data as { variables?: Array<{ name: string; type: string }> })?.variables || [];
      variables.forEach(variable => {
        workflow.variables[variable.name] = variable.type;
      });
    });

    // Start from the starting node and traverse the workflow
    let currentNode = findStartingNode(nodes);
    let nodeIndex = 1;
    const visitedNodes = new Set<string>();

    while (currentNode && !visitedNodes.has(currentNode.id)) {
      visitedNodes.add(currentNode.id);

      // Get node configuration
      const config = getNodeConfig(currentNode);

      // Get attachments for specific node types
      const attachments = getNodeAttachments(currentNode, edges, nodes);

      // Create the workflow entry
      const workflowEntry: {
        type: string;
        config: Record<string, unknown>;
        attachments?: Record<string, unknown>;
      } = {
        type: currentNode.type || "unknown",
        config,
      };

      if (attachments) {
        workflowEntry.attachments = attachments;
      }

      workflow.nodes[nodeIndex] = workflowEntry;
      nodeIndex++;

      // Get the next node in the workflow
      const nodeClass = NodeClasses[currentNode.type as keyof typeof NodeClasses];
      if (nodeClass) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tempInstance: any = new nodeClass({ id: currentNode.id, edges } as any);
        currentNode = tempInstance.getNextNode ? tempInstance.getNextNode(nodes) : null;
      } else {
        break;
      }
    }

    return JSON.stringify(workflow, null, 2);
  }
}

// Checks if the workflow is valid (all nodes are connected with their required edges)
export function checkWorkflowValidity(nodes: Node[], edges: Edge[]): boolean {
  // Handle empty workflows (not yet built)
  if (nodes.length === 0) {
    return false;
  }

  // Handle single chat node (initial state - still being built)
  if (nodes.length === 1 && nodes[0].type === "chat") {
    return false;
  }

  let currentNode = findStartingNode(nodes);

  if (!currentNode) return false;

  const visitedNodes = new Set<string>();

  while (currentNode && !visitedNodes.has(currentNode.id)) {
    visitedNodes.add(currentNode.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeClass: any =
      NodeClasses[currentNode.type as keyof typeof NodeClasses];
    if (!nodeClass) return false;

    if (nodeClass.nodeType === "end" || nodeClass.nodeType === "start") {
      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tempInstance: any = new nodeClass({ id: currentNode.id, edges });
    if (!tempInstance.checkNodeValidity()) return false;

    currentNode = tempInstance.getNextNode(nodes);
  }


  return false;
}
