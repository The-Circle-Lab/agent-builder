import React from "react";
import { Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faVial } from "@fortawesome/free-solid-svg-icons";
import { NodePropertyConfig, NodeData } from "../types";
import { BaseNode, BaseNodeProps, NodeDataFromConfig } from "./baseNode";
import { TestsNodeConfig, testsNodeConfig } from "./configs/testsNodeConfig";

export { testsNodeConfig };

export type TestsNodeData = NodeDataFromConfig<TestsNodeConfig>;

export interface TestsNodeProps extends BaseNodeProps {
  data?: TestsNodeData;
}

export class TestsNodeClass extends BaseNode<TestsNodeProps, TestsNodeData> {
  public static nodeType: "base" | "start" | "end" = "end";

  public getNodeType(): string {
    return "tests";
  }

  protected getConfig(): NodePropertyConfig {
    return testsNodeConfig;
  }

  protected renderNodeContent(): React.ReactNode {
    return (
      <div>
        {this.renderBaseContainer(
          <div>
            <FontAwesomeIcon
              icon={faVial}
              size="2x"
              className="text-white mb-2"
            />
            <div className="text-white font-bold text-sm">Tests</div>
          </div>,
          "flex flex-col items-center justify-center w-32 h-20",
          "right" // Use right shape - straight on left, rounded on right
        )}

        {/* Input Handle - Left */}
        <Handle
          type="target"
          position={Position.Left}
          id="tests-output"
          style={{ top: "50%", left: "-1.25%", transform: "translateY(-50%)" }}
        />
      </div>
    );
  }
}

// Functional component wrapper
export function TestsNode(props: TestsNodeProps) {
  return <TestsNodeClass {...props} />;
}

// Node type factory for ReactFlow
export const createTestsNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void
) =>
  BaseNode.createNodeType(TestsNode, {
    onDelete,
    onSettings,
  });
