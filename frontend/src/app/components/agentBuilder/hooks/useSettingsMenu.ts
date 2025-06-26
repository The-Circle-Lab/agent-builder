import { useState, useCallback } from "react";
import { NodeData } from "../components/nodes/types";

export interface NodeSettingsData {
  nodeId: string;
  nodeType: string;
  data: NodeData;
  onSave: (updatedData: NodeData) => void;
  workflowId?: string | number;
}

export function useSettingsMenu(workflowId?: string | number) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsData, setSettingsData] = useState<NodeSettingsData | null>(
    null
  );

  // Open the settings menu for a node
  const handleOpenSettings = useCallback(
    (
      nodeId: string,
      nodeType: string,
      data: NodeData,
      onSave: (updatedData: NodeData) => void
    ) => {
      setSettingsData({
        nodeId,
        nodeType,
        data,
        onSave,
        workflowId,
      });
      setIsSettingsOpen(true);
    },
    [workflowId]
  );

  const handleCloseSettings = useCallback(() => {
    setIsSettingsOpen(false);
    setSettingsData(null);
  }, []);

  const handleSaveSettings = useCallback(
    (updatedData: NodeData) => {
      if (settingsData) {
        settingsData.onSave(updatedData);
        handleCloseSettings();
      }
    },
    [settingsData, handleCloseSettings]
  );

  // Return the settings menu state and handlers
  return {
    isSettingsOpen,
    settingsData,
    handleOpenSettings,
    handleCloseSettings,
    handleSaveSettings,
  };
}
