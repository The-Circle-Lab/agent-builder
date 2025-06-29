import React, { useState, useEffect } from "react";
import Image from "next/image";

export * from "../hooks/useSideMenu";

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (nodeType: string) => void;
  objectType?: string;
}

// Define the node options for the side menu
const nodeOptions = [
  {
    category: "llm",
    type: "googleCloud",
    name: "Google AI Models",
    icon: "/google.svg",
    description: "Add Google AI language models",
  },
  {
    category: "llm",
    type: "openAI",
    name: "OpenAI Models",
    icon: "/openai.svg",
    description: "Add OpenAI language models",
  },
  {
    category: "llm",
    type: "anthropic",
    name: "Anthropic Models",
    icon: "/anthropic.svg",
    description: "Add Anthropic language models",
  },
  {
    category: "llm",
    type: "deepSeek",
    name: "DeepSeek Models",
    icon: "/deepseek.svg",
    description: "Add DeepSeek language models",
  },
  {
    category: "llm",
    type: "meta",
    name: "Meta Models",
    icon: "/meta.svg",
    description: "Add Meta language models",
  },
  {
    category: "agent",
    type: "agent",
    name: "AI Agent",
    icon: "/agent.svg",
    description: "Add a new AI agent",
  },
  {
    category: "tools",
    type: "mcp",
    name: "MCP Tool",
    icon: "/tool.svg",
    description: "Add a custom MCP tool",
  },
  {
    category: "output",
    type: "result",
    name: "Output",
    icon: "/output.svg",
    description: "Add an output node",
  },
];

// Define which categories to show for each object type
const objectTypeFilters: Record<string, string[]> = {
  LLM: ["llm"],
  tools: ["tools"],
  Agent: ["agent"],
  Output: ["output"],
};

export function SideMenu({
  isOpen,
  onClose,
  onAddNode,
  objectType,
}: SideMenuProps) {
  // State to preserve filtered options during transition
  const [displayedOptions, setDisplayedOptions] = useState(nodeOptions);
  const [displayedHeaderTitle, setDisplayedHeaderTitle] = useState("Add Node");

  // Update displayed options only when menu is open and objectType changes
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
  }, [isOpen, objectType]);

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
                    src={option.icon}
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
