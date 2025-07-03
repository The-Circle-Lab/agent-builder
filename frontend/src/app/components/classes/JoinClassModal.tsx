"use client";

import React, { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

interface JoinClassModalProps {
  onClose: () => void;
  onJoin: (joinCode: string) => Promise<void>;
}

export default function JoinClassModal({ onClose, onJoin }: JoinClassModalProps) {
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) {
      setError('Join code is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onJoin(joinCode.trim().toUpperCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join class');
      setLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase();
    // Only allow alphanumeric characters
    if (/^[A-Z0-9]*$/.test(value)) {
      setJoinCode(value);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">Join a Class</Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div>
              <label htmlFor="join-code" className="block text-sm font-medium text-black">
                Class Join Code
              </label>
              <input
                type="text"
                id="join-code"
                value={joinCode}
                onChange={handleCodeChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-center text-lg font-mono text-blue-500"
                placeholder="Enter 8-character code"
                maxLength={8}
                required
                autoComplete="off"
                spellCheck={false}
              />
              <p className="mt-2 text-sm text-gray-500">
                Ask your instructor for the class join code
              </p>
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-600">{error}</div>
            )}

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || joinCode.length !== 8}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Joining...' : 'Join Class'}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
