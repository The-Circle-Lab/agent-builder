import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faGears } from "@fortawesome/free-solid-svg-icons";
import { NodeContainerProps } from "../types";

export function NodeContainer({
  children,
  className = "",
  style = {},
  selected = false,
  onDelete,
  onSettings,
  shape = "normal",
}: NodeContainerProps) {
  const defaultStyle = {
    backgroundColor: "#454545",
    border: "3px solid",
    borderColor: selected ? "#f97316" : "#d1d5db", // Orange when selected, grey when not
    transition: "border-color 0.2s ease-in-out",
    ...style,
  };

  // Determine border radius classes based on shape
  const getBorderRadiusClass = () => {
    switch (shape) {
      case "left":
        return "rounded-l-lg"; // Rounded on left side only
      case "right":
        return "rounded-r-lg"; // Rounded on right side only
      case "normal":
      default:
        return "rounded-lg"; // Rounded on all sides
    }
  };

  return (
    <div className="relative">
      {/* Action Tooltips Strip - only show when selected */}
      {selected && (onDelete || onSettings) && (
        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-10">
          <div className="bg-black text-white rounded shadow-lg flex overflow-hidden">
            {/* Delete Button */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete();
                }}
                className="p-2 hover:bg-gray-800 transition-colors duration-200"
                title="Delete Node"
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
                  onSettings();
                }}
                className="p-2 hover:bg-gray-800 transition-colors duration-200"
                title="Node Settings"
              >
                <FontAwesomeIcon icon={faGears} />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={`${getBorderRadiusClass()} p-4 shadow-sm ${className}`}
        style={defaultStyle}
      >
        {children}
      </div>
    </div>
  );
}
