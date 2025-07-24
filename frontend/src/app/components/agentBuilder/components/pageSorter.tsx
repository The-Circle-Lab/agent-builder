import React, { useState, useCallback } from 'react';
import { Node } from '@xyflow/react';

interface PageSorterProps {
  nodes: Node[];
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
}



export default function PageSorter({ nodes, setNodes }: PageSorterProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Get all page nodes, sorted by page number
  const pageNodes = nodes
    .filter(node => node.type === 'page')
    .map(node => ({
      id: node.id,
      pageNumber: Number(node.data?.pageNumber) || 1,
      label: String(node.data?.label || ''),
      backgroundColor: String(node.data?.backgroundColor || '#3B82F6')
    }))
    .sort((a, b) => a.pageNumber - b.pageNumber);

  // All hooks must be called before any early returns
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.outerHTML);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Create new ordered list of pages
    const newPageOrder = [...pageNodes];
    const draggedPage = newPageOrder[draggedIndex];
    
    // Remove dragged item and insert at new position
    newPageOrder.splice(draggedIndex, 1);
    newPageOrder.splice(dropIndex, 0, draggedPage);

    // Update page numbers to match new order
    const updatedNodes = nodes.map(node => {
      if (node.type === 'page') {
        const newIndex = newPageOrder.findIndex(page => page.id === node.id);
        if (newIndex !== -1) {
          return {
            ...node,
            data: {
              ...node.data,
              pageNumber: newIndex + 1
            }
          };
        }
      }
      return node;
    });

    setNodes(updatedNodes);
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, pageNodes, nodes, setNodes]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // Don't render if no pages exist (after all hooks have been called)
  if (pageNodes.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm border border-gray-700 rounded-lg p-3 min-w-48">
        <div className="flex items-center space-x-2 mb-3">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          <span className="text-sm font-medium text-gray-300">Page Order</span>
        </div>
        
        <div className="space-y-1">
          {pageNodes.map((page, index) => (
            <div
              key={page.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                flex items-center space-x-3 p-2 rounded cursor-move transition-all duration-200
                ${draggedIndex === index ? 'opacity-50 scale-95' : ''}
                ${dragOverIndex === index ? 'bg-gray-700/50 transform scale-105' : 'bg-gray-700/30 hover:bg-gray-700/50'}
              `}
            >
              {/* Drag Handle */}
              <div className="text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              </div>
              
              {/* Page Color Indicator */}
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: page.backgroundColor }}
              />
              
              {/* Page Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate">
                  {page.label || `Page ${page.pageNumber}`}
                </div>
              </div>
              
              {/* Page Number Badge */}
              <div 
                className="px-2 py-1 rounded text-xs font-semibold text-white"
                style={{ backgroundColor: page.backgroundColor }}
              >
                {page.pageNumber}
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-xs text-gray-500 text-center">
            Drag to reorder pages
          </div>
        </div>
      </div>
  );
} 
