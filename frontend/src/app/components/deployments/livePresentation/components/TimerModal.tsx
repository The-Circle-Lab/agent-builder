"use client";

import React, { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Timer, TimerControl } from './Timer';

interface TimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartTimer: (minutes: number, seconds: number) => void;
  onStopTimer: () => void;
  timerActive: boolean;
  timerRemainingSeconds: number;
  timerDurationSeconds: number;
  disabled?: boolean;
}

export const TimerModal: React.FC<TimerModalProps> = ({
  isOpen,
  onClose,
  onStartTimer,
  onStopTimer,
  timerActive,
  timerRemainingSeconds,
  timerDurationSeconds,
  disabled = false
}) => {
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 flex items-center"
                  >
                    <ClockIcon className="h-6 w-6 mr-2 text-indigo-600" />
                    Timer Control
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                <div className="mb-6">
                  <p className="text-sm text-gray-600 mb-4">
                    Set a countdown timer that will be visible to {timerActive ? 'stop the current timer or start a new one' : 'students and on roomcast displays'}.
                  </p>
                  
                  {/* Timer Display - Show when active */}
                  {timerActive && timerDurationSeconds > 0 && (
                    <div className="flex justify-center mb-6">
                      <Timer
                        remainingSeconds={timerRemainingSeconds}
                        durationSeconds={timerDurationSeconds}
                        size="large"
                        className="bg-gray-50 rounded-full p-4"
                      />
                    </div>
                  )}
                  
                  <TimerControl
                    onStart={onStartTimer}
                    onStop={onStopTimer}
                    isActive={timerActive}
                    disabled={disabled}
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
