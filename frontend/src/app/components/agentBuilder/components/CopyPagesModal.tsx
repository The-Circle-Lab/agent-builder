import React, { useEffect, useMemo, useState } from "react";
import { WorkflowAPI, WorkflowSaveData } from "../scripts/workflowSave";
import { Node } from "@xyflow/react";

interface WorkflowSummary {
  id: number;
  name: string;
  description?: string | null;
  workflow_data?: WorkflowSaveData;
  class_id: number;
  updated_at?: string;
}

interface CopyPagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (args: {
    workflowId: number;
    workflowName: string;
    workflowData: WorkflowSaveData;
    selectedPageIds: string[];
  }) => void;
  currentWorkflowId?: number | string;
}

export function CopyPagesModal({
  isOpen,
  onClose,
  onCopy,
  currentWorkflowId,
}: CopyPagesModalProps) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(
    null
  );
  const [selectedPages, setSelectedPages] = useState<Record<string, boolean>>(
    {}
  );
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function fetchWorkflows() {
      try {
        setLoading(true);
        setError("");
        const response = await WorkflowAPI.loadAllWorkflows();
        if (!isMounted) {
          return;
        }

        const normalized = Array.isArray(response)
          ? response
          : Array.isArray(response?.items)
          ? response.items
          : [];

        setWorkflows(
          normalized.filter((wf: WorkflowSummary) => {
            if (!wf?.workflow_data?.nodes?.length) {
              return false;
            }
            if (
              currentWorkflowId !== undefined &&
              wf?.id === Number(currentWorkflowId)
            ) {
              return false;
            }
            return true;
          })
        );
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load workflows"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchWorkflows();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentWorkflowId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedWorkflowId(null);
      setSelectedPages({});
      setIsCopying(false);
    }
  }, [isOpen]);

  const selectedWorkflow = useMemo(() => {
    if (!selectedWorkflowId) {
      return undefined;
    }
    return workflows.find((wf) => wf.id === selectedWorkflowId);
  }, [selectedWorkflowId, workflows]);

  const availablePages = useMemo(() => {
    const nodes = selectedWorkflow?.workflow_data?.nodes || [];
    return nodes.filter((node: Node) => node.type === "page");
  }, [selectedWorkflow]);

  const togglePageSelection = (pageId: string) => {
    setSelectedPages((prev) => ({
      ...prev,
      [pageId]: !prev[pageId],
    }));
  };

  const handleCopy = async () => {
    if (!selectedWorkflow || !selectedWorkflow.workflow_data) {
      return;
    }

    const selectedPageIds = Object.entries(selectedPages)
      .filter(([, isChecked]) => isChecked)
      .map(([pageId]) => pageId);

    if (selectedPageIds.length === 0) {
      return;
    }

    try {
      setIsCopying(true);
      onCopy({
        workflowId: selectedWorkflow.id,
        workflowName: selectedWorkflow.name,
        workflowData: selectedWorkflow.workflow_data,
        selectedPageIds,
      });
      onClose();
    } finally {
      setIsCopying(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-white">Copy Pages</h2>
            <p className="text-sm text-gray-400">
              Select another workflow and choose the pages you want to import.
            </p>
          </div>
          <button
            className="text-gray-400 hover:text-white"
            onClick={onClose}
            aria-label="Close copy pages modal"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-900/40 text-red-200 border border-red-800 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Source workflow
            </label>
            <select
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              value={selectedWorkflowId ?? ""}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                setSelectedWorkflowId(Number.isNaN(nextId) ? null : nextId);
                setSelectedPages({});
              }}
              disabled={loading}
            >
              <option value="" disabled>
                {loading ? "Loading workflows..." : "Select a workflow"}
              </option>
              {workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>

          {selectedWorkflow && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm text-gray-400">Pages in workflow</p>
                  <p className="text-base text-white font-medium">
                    {selectedWorkflow.name}
                  </p>
                </div>
                <button
                  className="text-xs text-gray-400 hover:text-gray-200"
                  onClick={() => {
                    const allSelected = availablePages.every(
                      (page) => selectedPages[page.id]
                    );
                    if (allSelected) {
                      setSelectedPages({});
                    } else {
                      const updated: Record<string, boolean> = {};
                      availablePages.forEach((page) => {
                        updated[page.id] = true;
                      });
                      setSelectedPages(updated);
                    }
                  }}
                >
                  {availablePages.every((page) => selectedPages[page.id])
                    ? "Clear all"
                    : "Select all"}
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                {availablePages.map((page) => {
                  const labelText = page.data?.label
                    ? String(page.data.label)
                    : `Page ${page.data?.pageNumber ?? ""}`;

                  return (
                    <label
                      key={page.id}
                      className="flex items-center justify-between bg-gray-800/80 border border-gray-700 rounded-lg px-4 py-3 cursor-pointer hover:border-gray-500"
                    >
                      <div>
                        <div className="text-white font-medium">{labelText}</div>
                        <div className="text-xs text-gray-400">
                          Page ID: {page.id}
                        </div>
                      </div>
                    <input
                      type="checkbox"
                      checked={!!selectedPages[page.id]}
                      onChange={() => togglePageSelection(page.id)}
                      className="w-5 h-5 text-blue-500 bg-gray-900 border-gray-600 rounded"
                    />
                    </label>
                  );
                })}
                {availablePages.length === 0 && (
                  <div className="text-sm text-gray-500 text-center py-8">
                    This workflow does not have any pages yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-800 bg-gray-950/60 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {Object.values(selectedPages).filter(Boolean).length} page(s) selected
          </div>
          <div className="space-x-2">
            <button
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:bg-blue-600/40"
              disabled={
                isCopying ||
                !selectedWorkflow ||
                Object.values(selectedPages).filter(Boolean).length === 0
              }
              onClick={handleCopy}
            >
              {isCopying ? "Copying..." : "Copy pages"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
