import React from "react";
import { connectionConfig } from "../../../config/connectionConfig";
import { PlusButtonProps } from "../types";

export function PlusButton({
  handleId,
  objectType,
  nodeId,
  edges,
  onAddNodeClick,
  position,
}: PlusButtonProps) {
  // Check if handle has reached max connections
  const handleConfig = connectionConfig[handleId];
  const currentConnections = edges.filter(
    (edge) => edge.source === nodeId && edge.sourceHandle === handleId
  ).length;

  const canAddConnection =
    handleConfig?.maxConnections === -1 ||
    currentConnections < (handleConfig?.maxConnections || 0);

  if (!onAddNodeClick || !canAddConnection) {
    return null;
  }

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onAddNodeClick(objectType, nodeId);
      }}
      className="absolute w-6 h-6 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl"
      style={{
        bottom: position.bottom,
        left: position.left,
        right: position.right,
        transform: position.transform,
        transition: "all 0.2s ease-in-out",
      }}
      onMouseEnter={(e) => {
        const originalTransform = position.transform || "";
        e.currentTarget.style.transform = `${originalTransform} scale(1.1)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = position.transform || "";
      }}
    >
      <svg
        className="w-4 h-4 text-white"
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
  );
}
