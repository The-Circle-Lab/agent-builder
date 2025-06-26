import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import {
  McpNodeConfig,
  mcpNodeConfig,
} from "./configs/mcpNodeConfig";
import { DocumentAPI } from "../../../scripts/documentAPI";

export { mcpNodeConfig };

export type McpNodeData = NodeDataFromConfig<McpNodeConfig>;

export interface McpNodeProps extends BaseNodeProps {
  data?: McpNodeData;
}

export class McpNodeClass extends BaseNode<
  McpNodeProps,
  McpNodeData
> {
  public getNodeType(): string {
    return "mcp";
  }

  protected getConfig(): NodePropertyConfig {
    return mcpNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image 
            src="/tool.svg" 
            alt="MCP Tool" 
            width={32} 
            height={32} 
            style={{ filter: 'invert(1)' }}
          />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-25px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          MCP Sources
        </div>

        {/* Input Handle - Top */}
        <Handle
          type="target"
          position={Position.Top}
          id="mcp-input"
          style={{ top: "-1.25%", left: "50%", transform: "translateX(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function McpNode(props: McpNodeProps) {
  return <McpNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createMcpNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void,
  workflowId?: string | number
) =>
  BaseNode.createNodeType(McpNode, {
    onDelete: onDelete ? async (nodeId: string) => {
      try {
        // Clear the workflow's document collection
        if (workflowId) {
          const collectionName = `workflow_${workflowId}`;
          try {
            const response = await DocumentAPI.getDocumentsInCollection(collectionName);
            if (response.documents && response.documents.length > 0) {
              await DocumentAPI.deleteCollection(collectionName);
              console.log(`Cleared document collection for workflow ${workflowId}: ${collectionName}`);
            }
                     } catch {
             // Collection might not exist, which is fine
             console.log(`No collection to clear for workflow ${workflowId}`);
           }
        }
        
        // Call the original delete handler
        onDelete(nodeId);
      } catch (error) {
        console.error("Error during MCP node deletion:", error);
        // Still call the original delete handler even if collection cleanup fails
        onDelete(nodeId);
      }
    } : undefined,
    onSettings,
  });
