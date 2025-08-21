import React, { useCallback } from "react";
import { NodeProps, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faGears } from "@fortawesome/free-solid-svg-icons";
import { BaseNode, BaseNodeProps, BaseNodeData } from "../baseNode";
import { Variable } from "../../types";

export interface GlobalVariablesNodeData extends BaseNodeData {
  label?: string;
  variables?: Variable[];
  backgroundColor?: string;
  opacity?: number;
  width?: number;
  [key: string]: unknown;
}

interface GlobalVariablesNodeInternalProps extends NodeProps {
  data: GlobalVariablesNodeData;
  onDelete?: (nodeId: string) => void;
  onSettings?: (nodeId: string, nodeType: string, data: GlobalVariablesNodeData) => void;
}

function GlobalVariablesNodeComponent({
  id,
  data,
  selected,
  onDelete,
  onSettings,
}: GlobalVariablesNodeInternalProps) {
  const backgroundColor = data.backgroundColor || '#10B981';
  const opacity = data.opacity || 0.15;
  const label = data.label || 'Global Variables';
  const variables = data.variables || [];
  
  // Fixed width, dynamic height based on variables
  const nodeWidth = data.width || 250;
  const baseHeight = 120;
  const variableHeight = 50;
  const nodeHeight = Math.max(baseHeight, baseHeight + (variables.length * variableHeight));

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(id);
  }, [id, onDelete]);

  const handleSettings = useCallback(() => {
    if (onSettings) onSettings(id, 'globalVariables', data);
  }, [id, onSettings, data]);

  return (
    <div className="relative">
      {/* Action Tooltips Strip - only show when selected */}
      {selected && (onDelete || onSettings) && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-20" style={{ pointerEvents: 'auto' }}>
          <div className="bg-black text-white rounded shadow-lg flex overflow-hidden">
            {/* Delete Button */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleDelete();
                }}
                className="p-2 hover:bg-gray-800 transition-colors duration-200"
                title="Delete Global Variables"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            )}

            {/* Settings Button */}
            {onSettings && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleSettings();
                }}
                className="p-2 hover:bg-gray-800 transition-colors duration-200"
                title="Global Variables Settings"
              >
                <FontAwesomeIcon icon={faGears} />
              </button>
            )}
          </div>
        </div>
      )}
      
      <div
        className="relative rounded-lg border-2 border-solid globalvariables-container"
        style={{
          backgroundColor: backgroundColor + Math.floor(opacity * 255).toString(16).padStart(2, '0'),
          borderColor: backgroundColor,
          width: nodeWidth,
          height: nodeHeight,
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div 
          className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 rounded-t-lg text-white"
          style={{ 
            backgroundColor: backgroundColor,
            borderBottom: `1px solid ${backgroundColor}`,
          }}
        >
          <div className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full text-white"
              style={{ backgroundColor: '#ffffff' }}
            />
            <span className="text-sm font-medium text-white">{label}</span>
          </div>
        </div>

        {/* Variables List */}
        <div className="absolute top-12 left-0 right-0 bottom-12 overflow-y-auto">
          {variables.map((variable) => (
            <div 
              key={variable.id}
              className="relative flex items-center justify-between p-2 mx-2 my-1 bg-white/90 rounded border"
              style={{ height: variableHeight - 10 }}
            >
              {/* Variable Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">
                  {variable.name}
                </div>
                <div className="text-xs text-gray-600">
                  {variable.type}
                </div>
              </div>

              {/* Variable Input Handle - Left side */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${variable.id}-input`}
                className="variable-input-handle"
                style={{ 
                  top: "50%", 
                  left: "-8px", 
                  transform: "translateY(-50%)",
                  backgroundColor: backgroundColor,
                  border: `2px solid ${backgroundColor}`,
                  width: "10px",
                  height: "10px",
                  pointerEvents: 'auto',
                  zIndex: 10
                }}
              />

              {/* Variable Output Handle - Right side */}
              <Handle
                type="source"
                position={Position.Right}
                id={`${variable.id}-output`}
                className="variable-output-handle"
                style={{ 
                  top: "50%", 
                  right: "-8px", 
                  transform: "translateY(-50%)",
                  backgroundColor: backgroundColor,
                  border: `2px solid ${backgroundColor}`,
                  width: "10px",
                  height: "10px",
                  pointerEvents: 'auto',
                  zIndex: 10
                }}
              />
            </div>
          ))}
        </div>

        {/* Add Variable Button - Opens settings menu */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSettings();
            }}
            className="w-full flex items-center justify-center p-2 bg-white/80 hover:bg-white rounded border-2 border-dashed transition-all duration-200"
            style={{ 
              borderColor: backgroundColor,
            }}
            title="Manage variables"
          >
            <FontAwesomeIcon 
              icon={faGears} 
              className="w-4 h-4"
              style={{ color: backgroundColor }}
            />
            <span 
              className="ml-2 text-sm font-medium"
              style={{ color: backgroundColor }}
            >
              Manage Variables
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Node class for global variables node
export class GlobalVariablesNodeClass extends BaseNode<BaseNodeProps, GlobalVariablesNodeData> {
  static nodeType = "base" as const;
  static canAddNode = true;
  static defaultHandlerID = "Starter";

  // Handle configurations for this node type
  static handleConfigs = {
    "variable-input": {
      maxConnections: 1,
      compatibleWith: ["output", "page-output", "behaviour-output"],
    },
    "variable-output": {
      maxConnections: -1,
      compatibleWith: ["input", "page-input", "behaviour-input"],
    },
  };

  static getSideMenuInfo() {
    return {
      category: "Structure",
      name: "Global Variables",
      icon: "🌐",
      description: "Create a global variables container for sharing data across nodes",
    };
  }

  getNodeType() {
    return "globalVariables";
  }

  renderNodeContent() {
    return <div>Global Variables Node Content</div>;
  }

  getConfig() {
    return {
      nodeType: "globalVariables",
      displayName: "Global Variables",
      properties: []
    };
  }

  render() {
    return <div>Global Variables Node Class</div>;
  }
}

// Export the global variables node component
export const GlobalVariablesNode = GlobalVariablesNodeComponent;

// Export global variables node config
export { GLOBAL_VARIABLES_NODE_CONFIG as GlobalVariablesNodeConfig } from "../configs/globalVariablesNodeConfig";

// Creator function for the global variables node
export const createGlobalVariablesNodeType = (
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: GlobalVariablesNodeData) => void,
) => {
  return function GlobalVariablesNodeWrapper(props: NodeProps) {
    return (
      <GlobalVariablesNodeComponent
        {...props}
        data={props.data as GlobalVariablesNodeData}
        onDelete={onDelete}
        onSettings={onSettings}
      />
    );
  };
};
