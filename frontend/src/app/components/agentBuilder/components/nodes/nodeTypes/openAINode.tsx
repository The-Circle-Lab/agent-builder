import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import { OpenAINodeConfig, openAINodeConfig } from "./configs/openAINodeConfig";

export { openAINodeConfig };

export type OpenAINodeData = NodeDataFromConfig<OpenAINodeConfig>;

export interface OpenAINodeProps extends BaseNodeProps {
  data?: OpenAINodeData;
}

export class OpenAINodeClass extends BaseNode<OpenAINodeProps, OpenAINodeData> {
  public getNodeType(): string {
    return "openAI";
  }

  protected getConfig(): NodePropertyConfig {
    return openAINodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image
            src="/openai.svg"
            alt="OpenAI"
            width={32}
            height={32}
            className="filter brightness-0 invert"
          />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-45px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          OpenAI Model
        </div>

        {/* Input Handle - Top */}
        <Handle
          type="target"
          position={Position.Top}
          id="llm-input"
          style={{ top: "-1.25%", left: "50%", transform: "translateX(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function OpenAINode(props: OpenAINodeProps) {
  return <OpenAINodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createOpenAINodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(OpenAINode, {
    onDelete,
    onSettings,
  });
