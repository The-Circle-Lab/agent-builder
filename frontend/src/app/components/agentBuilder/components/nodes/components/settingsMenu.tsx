import React, { useState, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { NodeData } from "../types";
import { getNodeConfig } from "../nodeRegistry";
import { PropertyDefinition } from "../types";
import DocumentManager from "./DocumentManager";

export * from "../../../hooks/useSettingsMenu";

interface SettingsPopupProps {
  isOpen: boolean;
  nodeType: string;
  data: NodeData;
  onClose: () => void;
  onSave: (updatedData: NodeData) => void;
  workflowId?: string | number;
}

interface GenericFormProps {
  properties: PropertyDefinition[];
  data: NodeData;
  onSave: (data: NodeData) => void;
  workflowId?: string | number;
}

function GenericSettingsForm({ properties, data, onSave, workflowId }: GenericFormProps) {
  const [formData, setFormData] = useState<NodeData>(() => {
    // Initialize form data with existing data or default values
    const initialData: Record<string, string | number | boolean> = {};
    properties.forEach((prop) => {
      initialData[prop.key] =
        (data as Record<string, string | number | boolean>)[prop.key] ??
        prop.defaultValue;
    });
    return initialData as NodeData;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleInputChange = useCallback((key: string, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Create memoized document change handlers for upload fields
  const documentChangeHandlers = useMemo(() => {
    const handlers: Record<string, (count: number) => void> = {};
    properties.forEach((prop) => {
      if (prop.type === "upload") {
        handlers[prop.key] = (count: number) => {
          handleInputChange(prop.key, count.toString());
        };
      }
    });
    return handlers;
  }, [properties, handleInputChange]);

  // Renders a single field based on the property type
  const renderField = (property: PropertyDefinition) => {
    const { key, label, type, placeholder, options, min, max, step, rows } =
      property;
    const value = (formData as Record<string, string | number | boolean>)[key];

    switch (type) {
      case "text":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <input
              type="text"
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={placeholder}
            />
          </div>
        );

      case "textarea":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <textarea
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              rows={rows || 4}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={placeholder}
            />
          </div>
        );

      case "number":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <input
              type="number"
              value={typeof value === "number" ? value : ""}
              onChange={(e) =>
                handleInputChange(key, parseInt(e.target.value) || 0)
              }
              min={min}
              max={max}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );

      case "checkbox":
        return (
          <div key={key}>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => handleInputChange(key, e.target.checked)}
                className="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-200">{label}</span>
            </label>
          </div>
        );

      case "select":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label}
            </label>
            <select
              value={String(value || "")}
              onChange={(e) => handleInputChange(key, e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );

      case "range":
        return (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-200 mb-2">
              {label} ({value})
            </label>
            <input
              type="range"
              value={
                typeof value === "number"
                  ? value
                  : Number(property.defaultValue)
              }
              onChange={(e) =>
                handleInputChange(key, parseFloat(e.target.value))
              }
              min={min}
              max={max}
              step={step}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{min}</span>
              <span>{max}</span>
            </div>
          </div>
        );

      case "upload":
        return (
          <div key={key}>
            <DocumentManager 
              workflowId={workflowId} 
              onDocumentsChange={documentChangeHandlers[key] || (() => {})}
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Renders the settings form
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {properties.filter((prop) => prop.key !== "label").map(renderField)}

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Save Settings
        </button>
      </div>
    </form>
  );
}

export function SettingsMenu({
  isOpen,
  nodeType,
  data,
  onClose,
  onSave,
  workflowId,
}: SettingsPopupProps) {
  if (!isOpen) return null;

  const nodeConfig = getNodeConfig(nodeType);

  // If the node config is not found, return a message
  if (!nodeConfig) {
    return (
      <div
        className="fixed inset-0 transition-opacity flex items-center justify-center z-40"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
        onClick={onClose}
      >
        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
          <div className="p-6 text-center">
            <div className="text-gray-400">
              Settings not available for this node type.
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Renders the settings menu
  return (
    <div
      className="fixed inset-0 transition-opacity flex items-center justify-center z-40"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.65)" }}
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">
            {nodeConfig.displayName} Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <GenericSettingsForm
            properties={nodeConfig.properties}
            data={data}
            onSave={onSave}
            workflowId={workflowId}
          />
        </div>
      </div>
    </div>
  );
}
