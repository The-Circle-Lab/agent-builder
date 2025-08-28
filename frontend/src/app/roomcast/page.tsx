"use client";

import React, { useState } from 'react';
import { TvIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import RoomcastInterface from './components/RoomcastInterface';

export default function RoomcastPage() {
  const [code, setCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length === 5) {
      setIsConnected(true);
      setError(null);
    } else {
      setError('Please enter a valid 5-character code');
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 5) {
      setCode(value);
      setError(null);
    }
  };

  if (isConnected) {
    return (
      <RoomcastInterface 
        code={code} 
        onDisconnect={() => {
          setIsConnected(false);
          setCode('');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <TvIcon className="h-8 w-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Roomcast Display
            </h1>
            <p className="text-gray-600">
              Enter the 5-character code from your instructor to connect this device as a group display
            </p>
          </div>

          {/* Code Entry Form */}
          <form onSubmit={handleCodeSubmit} className="space-y-6">
            <div>
              <label htmlFor="code" className="sr-only">
                Roomcast Code
              </label>
              <div className="relative">
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="Enter code"
                  className="w-full text-blue-500 px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 uppercase"
                  autoComplete="off"
                  autoFocus
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="text-sm text-gray-400">
                    {code.length}/5
                  </span>
                </div>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={code.length !== 5}
              className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-lg transition-colors ${
                code.length === 5
                  ? 'text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500'
                  : 'text-gray-400 bg-gray-200 cursor-not-allowed'
              }`}
            >
              Connect to Presentation
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </button>
          </form>

          {/* Instructions */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-900 mb-2">How to use:</h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>1. Get the 5-character code from your instructor</li>
              <li>2. Enter the code above to connect</li>
              <li>3. Select your group when prompted</li>
              <li>4. This device will display instructions for your group</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
