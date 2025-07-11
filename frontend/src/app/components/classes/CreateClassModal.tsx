"use client";

import React, { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Class } from '@/lib/types';

interface CreateClassModalProps {
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<Class>;
}

export default function CreateClassModal({ onClose, onCreate }: CreateClassModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdClass, setCreatedClass] = useState<Class | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Class name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newClass = await onCreate(name.trim(), description.trim() || undefined);
      setCreatedClass(newClass);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create class');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!createdClass) return;
    
    try {
      await navigator.clipboard.writeText(createdClass.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDone = () => {
    onClose();
  };

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-md w-full">
          {!createdClass ? (
            // Create Class Form
            <>
              <div className="flex items-center justify-between p-6 border-b">
                <Dialog.Title className="text-lg font-semibold text-black">Create New Class</Dialog.Title>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="class-name" className="block text-sm font-medium text-gray-700">
                      Class Name
                    </label>
                    <input
                      type="text"
                      id="class-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                      placeholder=""
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="class-description" className="block text-sm font-medium text-gray-700">
                      Description (Optional)
                    </label>
                    <textarea
                      id="class-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-black"
                      placeholder=""
                    />
                  </div>
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
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating...' : 'Create Class'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            // Success View with Join Code
            <div className="p-8 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <CheckIcon className="h-6 w-6 text-green-600" />
              </div>
              
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Class Created Successfully!</h3>
              <p className="mt-2 text-sm text-gray-600">
                Share this code with your students so they can join your class.
              </p>

              <div className="mt-6 bg-gray-50 rounded-lg p-6">
                <p className="text-sm text-gray-500 mb-2">Join Code</p>
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-3xl font-mono font-bold text-blue-600">
                    {createdClass.join_code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <CheckIcon className="h-5 w-5 text-green-600" />
                    ) : (
                      <DocumentDuplicateIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <button
                onClick={handleDone}
                className="mt-6 w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
