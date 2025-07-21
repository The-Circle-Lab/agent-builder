import React, { Component } from "react";
import { NodeProps, Edge, Node } from "@xyflow/react";
import { NodeContainer } from "../components/nodeContainer";
import { NodePropertyConfig, NodeData, PropertyDefinition } from "../types";

// Utility type to map PropertyDefinition types to TypeScript types
type PropertyTypeMap = {
  text: string;
  textarea: string;
  number: number;
  checkbox: boolean;
  select: string;
  range: number;
  dynamicTextList: string[];
  testCases: import("../types").TestCase[];
  multipleChoiceQuestions: import("../types").MultipleChoiceQuestion[];
};

// Handle configuration interface
export interface HandleConfig {
  maxConnections: number; // -1 for unlimited
  compatibleWith: string[]; // Array of handle IDs this handle can connect to
}

// Side menu information interface
export interface SideMenuInfo {
  category: string;
  name: string;
  icon: string;
  description: string;
}

// Utility type to infer the data interface from a configuration
export type InferNodeDataFromConfig<T extends readonly PropertyDefinition[]> = {
  [K in T[number]["key"]]?: T[number] extends {
    key: K;
    type: infer Type;
    defaultValue: infer Default;
  }
    ? Type extends keyof PropertyTypeMap
      ? PropertyTypeMap[Type]
      : Default extends string | number | boolean
      ? Default
      : never
    : never;
} & BaseNodeData;

// Generic utility type for any node config
export type NodeDataFromConfig<
  TConfig extends { properties: readonly PropertyDefinition[] }
> = InferNodeDataFromConfig<TConfig["properties"]>;

// Node data interfaces extending base
export interface BaseNodeData {
  label?: string;
}

// Base interface for all node components with common properties and callbacks
export interface BaseNodeProps {
  id?: string;
  selected?: boolean;
  data?: BaseNodeData;
  onDelete?: () => void;
  onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void;
}

export abstract class BaseNode<
  TProps extends BaseNodeProps,
  TData extends BaseNodeData
> extends Component<TProps> {
  public static nodeType: "base" | "start" | "end" = "base";
  public static canAddNode = false;
  public static defaultHandlerID: string | null = null;
  
  // Static properties for handle configurations and side menu info that nodes can override
  public static handleConfigs: Record<string, HandleConfig> = {};
  public static sideMenuInfo: SideMenuInfo | null = null;
  
  public abstract getNodeType(): string;
  protected abstract renderNodeContent(): React.ReactNode;
  protected abstract getConfig(): NodePropertyConfig;

  // Static method to get handle configurations for this node type
  public static getHandleConfigs(): Record<string, HandleConfig> {
    return this.handleConfigs;
  }

  // Static method to get side menu information for this node type
  public static getSideMenuInfo(): SideMenuInfo | null {
    return this.sideMenuInfo;
  }

  // Static method to create node type factory
  static createNodeType<T extends BaseNodeProps>(
    NodeComponent: React.ComponentType<T>,
    handlers: {
      onAddNodeClick?: (objectType?: string, sourceNodeId?: string) => void;
      edges?: Edge[];
      onDelete?: (nodeId: string) => void;
      onSettings?: (nodeId: string, nodeType: string, data: NodeData) => void;
    }
  ) {
    const NodeTypeComponent = (props: NodeProps) => (
      <NodeComponent
        {...(props as unknown as T)}
        onAddNodeClick={handlers.onAddNodeClick}
        edges={handlers.edges}
        onDelete={() => handlers.onDelete?.(props.id)}
        onSettings={handlers.onSettings}
      />
    );
    NodeTypeComponent.displayName = `NodeType(${
      NodeComponent.displayName || NodeComponent.name
    })`;
    return NodeTypeComponent;
  }

  protected getDefaultData(): TData {
    const config = this.getConfig();
    const defaultData = {} as TData;

    config.properties.forEach((property) => {
      (
        defaultData as unknown as Record<
          string,
          string | number | boolean | string[] | import("../types").TestCase[] | import("../types").MultipleChoiceQuestion[]
        >
      )[property.key] = property.defaultValue;
    });

    return defaultData;
  }

  protected getData(): TData {
    return { ...this.getDefaultData(), ...this.props.data } as TData;
  }

  protected handleSettings = (): void => {
    const { onSettings, id } = this.props;
    if (onSettings && id) {
      onSettings(id, this.getNodeType(), this.getData());
    }
  };

  protected renderBaseContainer(
    children: React.ReactNode,
    className: string = "flex items-center justify-center",
    shape: "normal" | "left" | "right" = "normal"
  ): React.ReactNode {
    const { selected, onDelete } = this.props;

    return (
      <NodeContainer
        className={className}
        selected={selected}
        onDelete={onDelete}
        onSettings={this.handleSettings}
        shape={shape}
      >
        {children}
      </NodeContainer>
    );
  }

  protected logConfig(): void {
    const data = this.getData();
    console.log(`${this.getNodeType()} Config:`, data);
  }

  render(): React.ReactNode {
    return (
      <div className="flex items-center justify-center w-full h-full relative">
        {this.renderNodeContent()}
      </div>
    );
  }

  public checkNodeValidity(): boolean {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public getNextNode(_nodes?: Node[]): Node | null {
    // Base implementation - override in subclasses to use nodes parameter
    return null;
  }
}

// Abstract base class for node configurations
export abstract class BaseNodeConfig {
  abstract nodeType: string;
  abstract displayName: string;
  abstract readonly properties: readonly PropertyDefinition[];

  protected createBaseProperties(): readonly PropertyDefinition[] {
    return [
      {
        key: "label",
        label: "Label",
        type: "text",
        defaultValue: "",
        placeholder: "Enter label",
      },
    ] as const;
  }

  getConfig(): NodePropertyConfig {
    return {
      nodeType: this.nodeType,
      displayName: this.displayName,
      properties: [...this.properties], // Convert readonly array to mutable for compatibility
    };
  }
}
