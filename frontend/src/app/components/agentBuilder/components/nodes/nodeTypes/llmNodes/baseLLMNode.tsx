import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../../types";
import {
  BaseNode,
  BaseNodeProps,
  NodeDataFromConfig,
  HandleConfig,
} from "../baseNode";

// Base configuration type for LLM nodes
export type LLMNodeConfig = NodePropertyConfig;

export type LLMNodeData = NodeDataFromConfig<LLMNodeConfig>;

export interface LLMNodeProps extends BaseNodeProps {
  data?: LLMNodeData;
}

// LLM-specific configuration for rendering
export interface LLMRenderConfig {
  iconSrc: string;
  iconAlt: string;
  title: string;
  titleBottomOffset?: string; // e.g., "45px" or "25px"
  applyIconFilter?: boolean; // whether to apply brightness-0 invert filter
}

export abstract class LLMNode<
  TProps extends LLMNodeProps = LLMNodeProps,
  TData extends LLMNodeData = LLMNodeData
> extends BaseNode<TProps, TData> {
  // Common handle configurations for all LLM nodes
  public static handleConfigs: Record<string, HandleConfig> = {
    "llm-input": {
      maxConnections: 1,
      compatibleWith: ["llm-model"],
    },
  };

  // Abstract method for getting LLM-specific render configuration
  protected abstract getLLMRenderConfig(): LLMRenderConfig;

  protected renderNodeContent(): React.ReactNode {
    const config = this.getLLMRenderConfig();
    const titleBottomOffset = config.titleBottomOffset || "45px";

    return (
      <div>
        {this.renderBaseContainer(
          <Image
            src={config.iconSrc}
            alt={config.iconAlt}
            width={32}
            height={32}
            className={
              config.applyIconFilter ? "filter brightness-0 invert" : ""
            }
          />
        )}

        {/* Title positioned outside the node */}
        <div
          className="absolute w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center"
          style={{ bottom: `-${titleBottomOffset}` }}
        >
          {config.title}
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

  // Helper method to create LLM node types with consistent factory pattern
  public static createLLMNodeType<T extends React.ComponentType<LLMNodeProps>>(
    Component: T,
    callbacks?: {
      onDelete?: (nodeId: string) => void;
      onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void;
    }
  ) {
    return BaseNode.createNodeType(Component, callbacks || {});
  }
}
