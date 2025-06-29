import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import {
  MetaNodeConfig,
  metaNodeConfig,
} from "./configs/metaNodeConfig";

export { metaNodeConfig };

export type MetaNodeData = NodeDataFromConfig<MetaNodeConfig>;

export interface MetaNodeProps extends BaseNodeProps {
  data?: MetaNodeData;
}

export class MetaNodeClass extends BaseNode<
  MetaNodeProps,
  MetaNodeData
> {
  public getNodeType(): string {
    return "meta";
  }

  protected getConfig(): NodePropertyConfig {
    return metaNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image
            src="/meta.svg"
            alt="Meta"
            width={32}
            height={32}
            className="filter brightness-0 invert"
          />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-45px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          Meta Model
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
export function MetaNode(props: MetaNodeProps) {
  return <MetaNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createMetaNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(MetaNode, {
    onDelete,
    onSettings,
  });
