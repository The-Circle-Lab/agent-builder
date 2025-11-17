import React from 'react';
import type { AutoEnrollOption } from './classAPI';

interface AutoEnrollSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: AutoEnrollOption[];
  selectedIds: Set<number>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onToggle: (classId: number) => void;
  onRefresh: () => void;
  onSave: () => void;
}

export default function AutoEnrollSettingsModal({
  isOpen,
  onClose,
  options,
  selectedIds,
  loading,
  saving,
  error,
  onToggle,
  onRefresh,
  onSave,
}: AutoEnrollSettingsModalProps) {
  if (!isOpen) {
    return null;
  }

  const hasOptions = options.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Auto-Enroll Settings</h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose which classes new students join automatically during registration.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-transparent px-3 py-1 text-sm text-gray-500 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {error && (
            <div className="mb-4 flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <span className="pr-4">{error}</span>
              <button
                onClick={onRefresh}
                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-100"
              >
                Try Again
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : hasOptions ? (
            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
              {options.map(option => (
                <label
                  key={option.class_info.id}
                  className="flex cursor-pointer items-start gap-3 py-4"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={selectedIds.has(option.class_info.id)}
                    disabled={saving}
                    onChange={() => onToggle(option.class_info.id)}
                  />
                  <div className="flex-1">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-gray-900">{option.class_info.name}</p>
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Code: {option.class_info.code}
                      </span>
                    </div>
                    {option.class_info.description && (
                      <p className="mt-1 text-sm text-gray-500">{option.class_info.description}</p>
                    )}
                    <p className="mt-2 text-xs text-gray-400">
                      {option.class_info.member_count} member{option.class_info.member_count === 1 ? '' : 's'} currently enrolled
                    </p>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 px-4 py-12 text-center">
              <p className="text-sm text-gray-600">
                No classes available yet. Create a class first, then configure auto-enrollment.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
