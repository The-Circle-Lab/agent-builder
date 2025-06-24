import React from "react";
import Image from "next/image";
import { Handle, Position } from "@xyflow/react";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import {
  GoogleCloudNodeConfig,
  googleCloudNodeConfig,
} from "./configs/googleCloudNodeConfig";

export { googleCloudNodeConfig };

export type GoogleCloudNodeData = NodeDataFromConfig<GoogleCloudNodeConfig>;

export interface GoogleCloudNodeProps extends BaseNodeProps {
  data?: GoogleCloudNodeData;
}

export class GoogleCloudNodeClass extends BaseNode<
  GoogleCloudNodeProps,
  GoogleCloudNodeData
> {
  public getNodeType(): string {
    return "googleCloud";
  }

  protected getConfig(): NodePropertyConfig {
    return googleCloudNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <Image src="/google.svg" alt="Google Cloud" width={32} height={32} />
        )}

        {/* Title positioned outside the node */}
        <div className="absolute bottom-[-45px] w-30 left-1/2 transform -translate-x-1/2 text-white font-bold text-sm text-center">
          Google Cloud Model
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
export function GoogleCloudNode(props: GoogleCloudNodeProps) {
  return <GoogleCloudNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createGoogleCloudNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(GoogleCloudNode, {
    onDelete,
    onSettings,
  });
