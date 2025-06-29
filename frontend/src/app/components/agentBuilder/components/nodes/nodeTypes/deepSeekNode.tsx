import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import {
  DeepSeekNodeConfig,
  deepSeekNodeConfig,
} from "./configs/deepSeekNodeConfig";

export { deepSeekNodeConfig };

export type DeepSeekNodeData = NodeDataFromConfig<DeepSeekNodeConfig>;

export interface DeepSeekNodeProps extends BaseNodeProps {
  data?: DeepSeekNodeData;
}

export class DeepSeekNodeClass extends BaseNode<
  DeepSeekNodeProps,
  DeepSeekNodeData
> {
  public getNodeType(): string {
    return "deepSeek";
  }

  protected getConfig(): NodePropertyConfig {
    return deepSeekNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image
            src="/deepseek.svg"
            alt="DeepSeek"
            width={32}
            height={32}
            className="filter brightness-0 invert"
          />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-25px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          DeepSeek Model
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
export function DeepSeekNode(props: DeepSeekNodeProps) {
  return <DeepSeekNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createDeepSeekNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(DeepSeekNode, {
    onDelete,
    onSettings,
  });
