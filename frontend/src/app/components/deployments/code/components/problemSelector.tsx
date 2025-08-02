"use client";

import React from "react";
import { ProblemInfo } from "../../../../../lib/deploymentAPIs/codeDeploymentAPI";

interface ProblemSelectorProps {
  problems: ProblemInfo[];
  selectedProblemIndex: number;
  onProblemSelect: (index: number) => void;
  loading?: boolean;
  compact?: boolean; // New prop for header use
}

export default function ProblemSelector({
  problems,
  selectedProblemIndex,
  onProblemSelect,
  loading = false,
  compact = false,
}: ProblemSelectorProps) {
  if (loading) {
    if (compact) {
      return (
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-48"></div>
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 mb-3"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (problems.length <= 1) {
    return null; // Don't show selector if there's only one problem
  }

  if (compact) {
    return (
      <div className="flex items-center space-x-3">
        <label htmlFor="problem-selector-header" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Problem:
        </label>
        <select
          id="problem-selector-header"
          value={selectedProblemIndex}
          onChange={(e) => onProblemSelect(parseInt(e.target.value))}
          className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md 
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                     focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm min-w-[200px]"
        >
          {problems.map((problem, index) => (
            <option key={index} value={index}>
              {index + 1}. {problem.function_name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <label htmlFor="problem-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Select Problem:
      </label>
      <select
        id="problem-selector"
        value={selectedProblemIndex}
        onChange={(e) => onProblemSelect(parseInt(e.target.value))}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md 
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        {problems.map((problem, index) => (
          <option key={index} value={index}>
            Problem {index + 1}: {problem.function_name} - {problem.description.slice(0, 50)}
            {problem.description.length > 50 ? "..." : ""}
          </option>
        ))}
      </select>
    </div>
  );
} 
