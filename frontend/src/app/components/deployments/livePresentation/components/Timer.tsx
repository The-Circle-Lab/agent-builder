"use client";

import React from 'react';
import { ClockIcon } from '@heroicons/react/24/outline';

interface TimerProps {
  remainingSeconds: number;
  durationSeconds: number;
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

export const Timer: React.FC<TimerProps> = ({
  remainingSeconds,
  durationSeconds,
  className = '',
  size = 'medium'
}) => {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = (): number => {
    if (durationSeconds === 0) return 0;
    return ((durationSeconds - remainingSeconds) / durationSeconds) * 100;
  };

  const getTimeColor = (): string => {
    const percentage = (remainingSeconds / durationSeconds) * 100;
    if (percentage <= 10) return 'text-red-600';
    if (percentage <= 25) return 'text-orange-600';
    return 'text-gray-700';
  };

  const getProgressColor = (): string => {
    const percentage = (remainingSeconds / durationSeconds) * 100;
    if (percentage <= 10) return 'bg-red-500';
    if (percentage <= 25) return 'bg-orange-500';
    return 'bg-blue-500';
  };

  const sizeClasses = {
    small: {
      container: 'w-24 h-24',
      text: 'text-sm',
      icon: 'h-4 w-4',
      stroke: 4
    },
    medium: {
      container: 'w-32 h-32',
      text: 'text-lg',
      icon: 'h-5 w-5',
      stroke: 6
    },
    large: {
      container: 'w-48 h-48',
      text: 'text-2xl',
      icon: 'h-8 w-8',
      stroke: 8
    }
  };

  const currentSize = sizeClasses[size];
  const radius = size === 'small' ? 40 : size === 'medium' ? 56 : 80;
  const circumference = 2 * Math.PI * radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (getProgressPercentage() / 100) * circumference;

  return (
    <div className={`relative flex items-center justify-center ${currentSize.container} ${className}`}>
      {/* Background Circle */}
      <svg
        className="absolute inset-0 transform -rotate-90"
        width="100%"
        height="100%"
        viewBox={`0 0 ${radius * 2 + currentSize.stroke * 2} ${radius * 2 + currentSize.stroke * 2}`}
      >
        <circle
          cx={radius + currentSize.stroke}
          cy={radius + currentSize.stroke}
          r={radius}
          stroke="currentColor"
          strokeWidth={currentSize.stroke}
          fill="none"
          className="text-gray-200"
        />
        {/* Progress Circle */}
        <circle
          cx={radius + currentSize.stroke}
          cy={radius + currentSize.stroke}
          r={radius}
          stroke="currentColor"
          strokeWidth={currentSize.stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className={getProgressColor()}
          style={{
            transition: 'stroke-dashoffset 0.3s ease-in-out'
          }}
        />
      </svg>
      
      {/* Content */}
      <div className="flex flex-col items-center justify-center space-y-1">
        <ClockIcon className={`${currentSize.icon} ${getTimeColor()}`} />
        <span className={`font-mono font-bold ${currentSize.text} ${getTimeColor()}`}>
          {formatTime(remainingSeconds)}
        </span>
      </div>
    </div>
  );
};

interface TimerControlProps {
  onStart: (minutes: number, seconds: number) => void;
  onStop: () => void;
  isActive: boolean;
  disabled?: boolean;
}

export const TimerControl: React.FC<TimerControlProps> = ({
  onStart,
  onStop,
  isActive,
  disabled = false
}) => {
  const [minutes, setMinutes] = React.useState(5);
  const [seconds, setSeconds] = React.useState(0);

  const handleStart = () => {
    if (minutes > 0 || seconds > 0) {
      onStart(minutes, seconds);
    }
  };

  const handlePresetClick = (mins: number, secs: number = 0) => {
    setMinutes(mins);
    setSeconds(secs);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Minutes:</label>
          <input
            type="number"
            min="0"
            max="60"
            value={minutes}
            onChange={(e) => setMinutes(Math.max(0, Math.min(60, parseInt(e.target.value) || 0)))}
            disabled={disabled || isActive}
            className="w-16 px-2 py-1 text-black border border-gray-300 rounded text-center disabled:bg-gray-100"
          />
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Seconds:</label>
          <input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={(e) => setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
            disabled={disabled || isActive}
            className="w-16 px-2 py-1 text-black border border-gray-300 rounded text-center disabled:bg-gray-100"
          />
        </div>
      </div>

      {/* Preset buttons */}
      {!isActive && (
        <div className="flex space-x-2">
          <button
            onClick={() => handlePresetClick(1)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            1m
          </button>
          <button
            onClick={() => handlePresetClick(2)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            2m
          </button>
          <button
            onClick={() => handlePresetClick(5)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            5m
          </button>
          <button
            onClick={() => handlePresetClick(10)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            10m
          </button>
          <button
            onClick={() => handlePresetClick(0, 30)}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            30s
          </button>
        </div>
      )}

      <div className="flex space-x-2">
        {!isActive ? (
          <button
            onClick={handleStart}
            disabled={disabled || (minutes === 0 && seconds === 0)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Start Timer
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={disabled}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Stop Timer
          </button>
        )}
      </div>
    </div>
  );
};
