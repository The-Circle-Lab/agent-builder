import React, { useCallback } from "react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faGears } from "@fortawesome/free-solid-svg-icons";
import { BaseNode, BaseNodeProps, BaseNodeData } from "../baseNode";

export interface PageNodeData extends BaseNodeData {
  label?: string;
  pageNumber?: number;
  backgroundColor?: string;
  opacity?: number;
  width?: number;
  height?: number;
  [key: string]: unknown; // Add index signature for compatibility
}

interface PageNodeInternalProps extends NodeProps {
  data: PageNodeData;
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string, pageId?: string) => void;
  onDelete?: (nodeId: string) => void;
  onSettings?: (nodeId: string, nodeType: string, data: PageNodeData) => void;
  pageRelationships?: Record<string, string[]>;
  allNodes?: { id: string; type: string }[]; // Add nodes array to verify existence
}

function PageNodeComponent({
  id,
  data,
  selected,
  onAddNodeClick,
  onDelete,
  onSettings,
  pageRelationships,
  allNodes,
  ...props
}: PageNodeInternalProps) {


  const backgroundColor = data.backgroundColor || '#3B82F6';
  const opacity = data.opacity || 0.15;
  const pageNumber = data.pageNumber || 1;
  const label = data.label || `Page ${pageNumber}`;
  
  // Use actual node dimensions from ReactFlow instead of data properties
  const nodeWidth = props.width || data.width || 300;
  const nodeHeight = props.height || data.height || 200;
  
  // Check if page has any nodes that actually still exist
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
    if (onSettings) onSettings(id, 'page', data);
  }, [id, onSettings, data]);

  const handleAddNode = useCallback(() => {
    if (onAddNodeClick) onAddNodeClick("Starter", undefined, id);
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
                title="Delete Page"
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
                title="Page Settings"
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
        className="relative rounded-lg border-2 border-dashed page-container"
        style={{
          backgroundColor: backgroundColor + Math.floor(opacity * 255).toString(16).padStart(2, '0'),
          borderColor: backgroundColor,
          width: nodeWidth,
          height: nodeHeight,
          pointerEvents: 'none', // Allow clicks to pass through to child nodes
        }}
      >
        {/* Page Header */}
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
          
          {/* Page Number Badge */}
          <div 
            className="px-2 py-1 rounded text-xs font-semibold text-white"
            style={{ backgroundColor: backgroundColor }}
            title={`Page ${pageNumber}`}
          >
            {pageNumber}
          </div>
        </div>

        {/* Clickable background area for page selection */}
        <div 
          className="absolute inset-0 top-12"
          style={{ pointerEvents: 'auto', zIndex: -1 }}
          title="Click to select page"
        />
        
        {/* Page Content Area */}
        <div className="absolute inset-0 top-12 flex items-center justify-center">
          {/* Plus button for adding nodes to empty page - only show when page is empty */}
          {!hasNodesInPage && (
            <button
              onClick={handleAddNode}
              className="w-12 h-12 bg-white/80 hover:bg-white rounded-full flex items-center justify-center shadow-md transition-all duration-200 border-2 border-dashed"
              style={{ 
                borderColor: backgroundColor,
                pointerEvents: 'auto', // Re-enable pointer events for plus button
              }}
              title="Add node to page"
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
      </div>
    </div>
  );
}

// Node class for page node
export class PageNodeClass extends BaseNode<BaseNodeProps, PageNodeData> {
  static nodeType = "base" as const;
  static canAddNode = true;
  static defaultHandlerID = "Starter";

  // Handle configurations for this node type
  static handleConfigs = {
    "input": {
      maxConnections: -1,
      compatibleWith: ["output", "chat-output", "variable-output"],
    },
    "output": {
      maxConnections: -1,
      compatibleWith: ["input", "agent-input", "result-input", "output-page", "variable-input"],
    },
    "page-input": {
      maxConnections: -1,
      compatibleWith: ["output", "chat-output", "variable-output"],
    },
    "page-output": {
      maxConnections: -1,
      compatibleWith: ["input", "agent-input", "result-input", "output-page", "variable-input"],
    },
  };

  static getSideMenuInfo() {
    return {
      category: "Structure",
      name: "Page",
      icon: "📄",
      description: "Create a resizable page container for organizing nodes",
    };
  }

  getNodeType() {
    return "page";
  }

  renderNodeContent() {
    return <div>Page Node Content</div>;
  }

  getConfig() {
    return {
      nodeType: "page",
      displayName: "Page",
      properties: []
    };
  }

  render() {
    return <div>Page Node Class</div>;
  }
}

// Export the page node component
export const PageNode = PageNodeComponent;

// Export page node config
export { PAGE_NODE_CONFIG as PageNodeConfig } from "../configs/pageNodeConfig";

// Creator function for the page node
export const createPageNodeType = (
  onAddNodeClick?: (objectType?: string, sourceNodeId?: string, pageId?: string) => void,
  edges?: unknown[],
  onDelete?: (nodeId: string) => void,
  onSettings?: (nodeId: string, nodeType: string, data: PageNodeData) => void,
  pageRelationships?: Record<string, string[]>,
  allNodes?: { id: string; type: string }[]
) => {
  return function PageNodeWrapper(props: NodeProps) {
    return (
      <PageNodeComponent
        {...props}
        data={props.data as PageNodeData}
        onAddNodeClick={onAddNodeClick}
        onDelete={onDelete}
        onSettings={onSettings}
        pageRelationships={pageRelationships}
        allNodes={allNodes}
      />
    );
  };
}; 
