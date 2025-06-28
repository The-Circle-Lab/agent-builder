import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import {
  AnthropicNodeConfig,
  anthropicNodeConfig,
} from "./configs/anthropicNodeConfig";

export { anthropicNodeConfig };

export type AnthropicNodeData = NodeDataFromConfig<AnthropicNodeConfig>;

export interface AnthropicNodeProps extends BaseNodeProps {
  data?: AnthropicNodeData;
}

export class AnthropicNodeClass extends BaseNode<
  AnthropicNodeProps,
  AnthropicNodeData
> {
  public getNodeType(): string {
    return "anthropic";
  }

  protected getConfig(): NodePropertyConfig {
    return anthropicNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image
            src="/anthropic.svg"
            alt="Anthropic"
            width={32}
            height={32}
            className="filter brightness-0 invert"
          />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-45px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          Anthropic Model
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
export function AnthropicNode(props: AnthropicNodeProps) {
  return <AnthropicNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createAnthropicNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(AnthropicNode, {
    onDelete,
    onSettings,
  });
