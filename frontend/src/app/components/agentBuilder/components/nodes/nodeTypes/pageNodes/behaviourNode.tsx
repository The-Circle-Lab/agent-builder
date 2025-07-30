import React, { useCallback } from "react";
import { NodeProps, NodeResizer, Handle, Position } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faGears } from "@fortawesome/free-solid-svg-icons";
import { BaseNode, BaseNodeProps, BaseNodeData } from "../baseNode";

export interface BehaviourNodeData extends BaseNodeData {
  label?: string;
  pageNumber?: number;
  backgroundColor?: string;
  opacity?: number;
  width?: number;
  height?: number;
  [key: string]: unknown; // Add index signature for compatibility
}

interface BehaviourNodeInternalProps extends NodeProps {
  data: BehaviourNodeData;
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string, pageId?: string) => void;
  onDelete?: (nodeId: string) => void;
  onSettings?: (nodeId: string, nodeType: string, data: BehaviourNodeData) => void;
  pageRelationships?: Record<string, string[]>;
  allNodes?: { id: string; type: string }[]; // Add nodes array to verify existence
}

function BehaviourNodeComponent({
  id,
  data,
  selected,
  onAddNodeClick,
  onDelete,
  onSettings,
  pageRelationships,
  allNodes,
  ...props
}: BehaviourNodeInternalProps) {


  const backgroundColor = data.backgroundColor || '#8B5CF6';
  const opacity = data.opacity || 0.15;
  const pageNumber = data.pageNumber || 1;
  const label = data.label || `Behaviour ${pageNumber}`;
  
  // Use actual node dimensions from ReactFlow instead of data properties
  const nodeWidth = props.width || data.width || 300;
  const nodeHeight = props.height || data.height || 200;
  
  // Check if behaviour has any nodes that actually still exist
  const hasNodesInPage = (() => {
    if (!pageRelationships || !pageRelationships[id]) {
      return false;
    }
    
    const nodeIdsInPage = pageRelationships[id];
    
    // If we have the allNodes array, verify that the referenced nodes still exist
    if (allNodes) {
      const existingNodeIds = new Set(allNodes.map(node => node.id));
      const existingNodesInPage = nodeIdsInPage.filter(nodeId => existingNodeIds.has(nodeId));
      return existingNodesInPage.length > 0;
    }
    
    // Fallback to simple length check if allNodes not provided
    return nodeIdsInPage.length > 0;
  })();

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(id);
  }, [id, onDelete]);

  const handleSettings = useCallback(() => {
    if (onSettings) onSettings(id, 'behaviour', data);
  }, [id, onSettings, data]);

  const handleAddNode = useCallback(() => {
    if (onAddNodeClick) onAddNodeClick("Behaviour", undefined, id);
  }, [onAddNodeClick, id]);

  // Handle resize to update dimensions (without opening settings)
  const handleResize = useCallback(() => {
    // Note: The visual update happens automatically through nodeWidth/nodeHeight
    // The data update for persistence should be handled elsewhere if needed
  }, []);



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
                title="Delete Behaviour"
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
                title="Behaviour Settings"
              >
                <FontAwesomeIcon icon={faGears} />
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ pointerEvents: 'auto' }}>
        <NodeResizer
          minWidth={200}
          minHeight={150}
          isVisible={selected}
          onResize={handleResize}
          lineStyle={{ borderColor: backgroundColor, borderWidth: 2 }}
          handleStyle={{ 
            backgroundColor: backgroundColor, 
            width: 8, 
            height: 8, 
            borderRadius: 4 
          }}
        />
      </div>
      
      <div
        className="relative rounded-lg border-2 border-dashed behaviour-container"
        style={{
          backgroundColor: backgroundColor + Math.floor(opacity * 255).toString(16).padStart(2, '0'),
          borderColor: backgroundColor,
          width: nodeWidth,
          height: nodeHeight,
          pointerEvents: 'none', // Allow clicks to pass through to child nodes
        }}
      >
        {/* Behaviour Header */}
        <div 
          className="absolute top-0 left-0 right-0 flex items-center justify-between p-2 rounded-t-lg text-white"
          style={{ 
            backgroundColor: backgroundColor + '40',
            borderBottom: `1px solid ${backgroundColor}`,
            pointerEvents: 'auto', // Re-enable pointer events for header 
          }}
        >
          <div className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full text-white"
              style={{ backgroundColor: backgroundColor }}
            />
            <span className="text-sm font-medium text-white">{label}</span>
          </div>
          
          {/* Behaviour Number Badge */}
          <div 
            className="px-2 py-1 rounded text-xs font-semibold text-white"
            style={{ backgroundColor: backgroundColor }}
            title={`Behaviour ${pageNumber}`}
          >
            {pageNumber}
          </div>
        </div>

        {/* Clickable background area for behaviour selection */}
        <div 
          className="absolute inset-0 top-12"
          style={{ pointerEvents: 'auto', zIndex: -1 }}
          title="Click to select behaviour"
        />
        
        {/* Behaviour Content Area */}
        <div className="absolute inset-0 top-12 flex items-center justify-center">
          {/* Plus button for adding nodes to empty behaviour - only show when behaviour is empty */}
          {!hasNodesInPage && (
            <button
              onClick={handleAddNode}
              className="w-12 h-12 bg-white bg-opacity-80 hover:bg-opacity-100 rounded-full flex items-center justify-center shadow-md transition-all duration-200 border-2 border-dashed"
              style={{ 
                borderColor: backgroundColor,
                pointerEvents: 'auto', // Re-enable pointer events for plus button
              }}
              title="Add node to behaviour"
            >
              <svg
                className="w-6 h-6"
                style={{ color: backgroundColor }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Input Handle - Left side, vertically centered */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="behaviour-input-handle"
          style={{ 
            top: "50%", 
            left: "-1.25%", 
            transform: "translateY(-50%)",
            backgroundColor: backgroundColor,
            border: `2px solid ${backgroundColor}`,
            width: "12px",
            height: "12px",
            pointerEvents: 'auto',
            zIndex: 10
          }}
        />

        {/* Output Handle - Right side, vertically centered */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="behaviour-output-handle"
          style={{ 
            top: "50%", 
            right: "-1.25%", 
            transform: "translateY(-50%)",
            backgroundColor: backgroundColor,
            border: `2px solid ${backgroundColor}`,
            width: "12px",
            height: "12px",
            pointerEvents: 'auto',
            zIndex: 10
          }}
        />
      </div>
    </div>
  );
}

// Node class for behaviour node
export class BehaviourNodeClass extends BaseNode<BaseNodeProps, BehaviourNodeData> {
  static nodeType = "base" as const;
  static canAddNode = true;
  static defaultHandlerID = "Starter";

  // Handle configurations for this node type
  static handleConfigs = {
    "input": {
      maxConnections: -1,
      compatibleWith: ["output", "variable-output"],
    },
    "output": {
      maxConnections: -1,
      compatibleWith: ["input", "variable-input"],
    },
    "behaviour-input": {
      maxConnections: -1,
      compatibleWith: ["output", "variable-output"],
    },
    "behaviour-output": {
      maxConnections: -1,
      compatibleWith: ["input", "variable-input"],
    },
  };

  static getSideMenuInfo() {
    return {
      category: "Structure",
      name: "Behaviour",
      icon: "🎭",
      description: "Create a resizable behaviour container for organizing nodes",
    };
  }

  getNodeType() {
    return "behaviour";
  }

  renderNodeContent() {
    return <div>Behaviour Node Content</div>;
  }

  getConfig() {
    return {
      nodeType: "behaviour",
      displayName: "Behaviour",
      properties: []
    };
  }

  render() {
    return <div>Behaviour Node Class</div>;
  }
}

// Export the behaviour node component
export const BehaviourNode = BehaviourNodeComponent;

// Export behaviour node config
export { BEHAVIOUR_NODE_CONFIG as BehaviourNodeConfig } from "../configs/behaviourNodeConfig";

// Creator function for the behaviour node
export const createBehaviourNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string, pageId?: string) => void,
  edges?: unknown[],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: BehaviourNodeData) => void,
  pageRelationships?: Record<string, string[]>,
  allNodes?: { id: string; type: string }[]
) => {
  return function BehaviourNodeWrapper(props: NodeProps) {
    return (
      <BehaviourNodeComponent
        {...props}
        data={props.data as BehaviourNodeData}
        onAddNodeClick={onAddNodeClick}
        onDelete={onDelete}
        onSettings={onSettings}
        pageRelationships={pageRelationships}
        allNodes={allNodes}
      />
    );
  };
}; 
