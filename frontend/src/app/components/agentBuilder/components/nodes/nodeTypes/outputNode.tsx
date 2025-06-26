import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import { OutputNodeConfig, outputNodeConfig } from "./configs/outputNodeConfig";

export { outputNodeConfig };

export type OutputNodeData = NodeDataFromConfig<OutputNodeConfig>;

export interface OutputNodeProps extends BaseNodeProps {
  data?: OutputNodeData;
}

export class OutputNodeClass extends BaseNode<OutputNodeProps, OutputNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";

  public getNodeType(): string {
    return "result";
  }

  protected getConfig(): NodePropertyConfig {
    return outputNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faFileExport}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Output</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="result-input"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function OutputNode(props: OutputNodeProps) {
  return <OutputNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createOutputNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(OutputNode, {
    onDelete,
    onSettings,
  });
