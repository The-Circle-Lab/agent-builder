import React, { useState, useEffect } from "react";
import Image from "next/image";
import { SideMenuInfo } from "./nodes/nodeTypes/baseNode";

export * from "../hooks/useSideMenu";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
  objectType?: string;
}

// Interface for node options
interface NodeOption {
  category: string;
  type: string;
  name: string;
  icon: string;
  description: string;
}

// Type for node class with static methods
type NodeClassWithStatics = {
  getSideMenuInfo?: () => SideMenuInfo | null;
};

// Define which categories to show for each object type
const objectTypeFilters: Record<string, string[]> = {
  LLM: ["llm"],
  tools: ["tools"],
  Agent: ["output"],
  Output: ["output"],
  Starter: ["starter", "Structure"],
  Tests: ["tests"],
  codeAnalyzer: ["analysis"],
  Questions: ["questions"],
  Submission: ["submission"],
};

export function SideMenu({
  isOpen,
  onClose,
  onAddNode,
  objectType,
}: SideMenuProps) {
  const [nodeOptions, setNodeOptions] = useState<NodeOption[]>([]);
  const [displayedOptions, setDisplayedOptions] = useState<NodeOption[]>([]);
  const [displayedHeaderTitle, setDisplayedHeaderTitle] = useState("Add Node");

  // Load node options on component mount
  useEffect(() => {
    const loadNodeOptions = async () => {
      try {
        const { NodeClasses } = await import('./nodes/nodeTypes');
        const options: NodeOption[] = [];
        
        Object.entries(NodeClasses).forEach(([nodeKey, NodeClass]) => {
          const NodeClassTyped = NodeClass as unknown as NodeClassWithStatics;
          if (NodeClassTyped && typeof NodeClassTyped.getSideMenuInfo === 'function') {
            const sideMenuInfo = NodeClassTyped.getSideMenuInfo();
            if (sideMenuInfo) {
              options.push({
                category: sideMenuInfo.category,
                type: nodeKey,
                name: sideMenuInfo.name,
                icon: sideMenuInfo.icon,
                description: sideMenuInfo.description,
              });
            }
          }
        });
        
        setNodeOptions(options);
      } catch (error) {
        console.warn("Failed to load NodeClasses for side menu:", error);
      }
    };

    loadNodeOptions();
  }, []);

  // Update displayed options when menu is open, objectType changes, or nodeOptions are loaded
  useEffect(() => {
    if (isOpen) {
      const filteredOptions =
        objectType && objectTypeFilters[objectType]
          ? nodeOptions.filter((option) =>
              objectTypeFilters[objectType].includes(option.category)
            )
          : nodeOptions;

      const headerTitle = objectType ? `Add ${objectType}` : "Add Node";

      setDisplayedOptions(filteredOptions);
      setDisplayedHeaderTitle(headerTitle);
    }
  }, [isOpen, objectType, nodeOptions]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div>
      {/* Subtle transparent backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-300"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
          onClick={handleBackdropClick}
        />
      )}

      {/* Side Menu */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-gray-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            {displayedHeaderTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors duration-200"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="space-y-4">
            {displayedOptions.map((option) => (
              <div
                key={option.type}
                onClick={() => {
                  onAddNode(option.type);
                  onClose();
                }}
                className="flex items-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors duration-200 cursor-pointer group"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-gray-600 rounded-lg flex items-center justify-center group-hover:bg-gray-500 transition-colors duration-200">
                  <Image
                    src="agent.svg"
                    alt={option.name}
                    width={24}
                    height={24}
                    className="opacity-80 group-hover:opacity-100 transition-opacity duration-200"
                    style={
                      option.type === "agent"
                        ? { filter: "brightness(0) invert(1)" }
                        : {}
                    }
                  />
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-white font-medium">{option.name}</h3>
                  <p className="text-gray-400 text-sm">{option.description}</p>
                </div>
                <div className="text-gray-400 group-hover:text-white transition-colors duration-200">
                  <svg
                    className="w-5 h-5"
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
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-700">
          <p className="text-gray-400 text-sm text-center">
            Click on any option to add it to your workflow
          </p>
        </div>
      </div>
    </div>
  );
}
