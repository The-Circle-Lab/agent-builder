import { useState, useCallback } from "react";

export function useSideMenu() {
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const [sideMenuObjectType, setSideMenuObjectType] = useState<
    string | undefined
  >(undefined);
  const [sourceNodeId, setSourceNodeId] = useState<string | undefined>(
    undefined
  );

  const handleOpenSideMenu = useCallback(
    (objectType?: string, nodeId?: string) => {
      setSideMenuObjectType(objectType);
      setSourceNodeId(nodeId);
      setIsSideMenuOpen(true);
    },
    []
  );

  const handleCloseSideMenu = useCallback(() => {
    setIsSideMenuOpen(false);
    setSideMenuObjectType(undefined);
    setSourceNodeId(undefined);
  }, []);

  return {
    isSideMenuOpen,
    sideMenuObjectType,
    sourceNodeId,
    handleOpenSideMenu,
    handleCloseSideMenu,
  };
}
