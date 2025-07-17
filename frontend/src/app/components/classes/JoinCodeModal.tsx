"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, DocumentDuplicateIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Class } from '@/lib/types';
import { ClassAPI } from './classAPI';

interface JoinCodeModalProps {
  classObj: Class;
  onClose: () => void;
}

export default function JoinCodeModal({ classObj, onClose }: JoinCodeModalProps) {
  const [joinCode, setJoinCode] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadJoinCode = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ClassAPI.getJoinCode(classObj.id);
      setJoinCode(response.join_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load join code');
    } finally {
      setLoading(false);
    }
  }, [classObj.id]);

  useEffect(() => {
    loadJoinCode();
  }, [loadJoinCode]);

  const handleCopyCode = async () => {
    if (!joinCode) return;
    
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="bg-white rounded-lg shadow-xl max-w-md w-full">
          <div className="flex items-center justify-between p-6 border-b">
            <Dialog.Title className="text-lg font-semibold text-black">Class Join Code</Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-600">{error}</p>
                <button
                  onClick={loadJoinCode}
                  className="mt-4 text-blue-600 hover:text-blue-700"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Share this code with students so they can join your class.
                </p>

                <div className="bg-gray-50 rounded-lg p-6">
                  <p className="text-sm text-gray-500 mb-2">Join Code</p>
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-3xl font-mono font-bold text-blue-600">
                      {joinCode}
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

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 
