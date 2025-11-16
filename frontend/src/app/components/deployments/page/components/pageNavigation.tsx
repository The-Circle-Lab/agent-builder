"use client";

import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';

interface PageNavigationProps {
  currentPage: number;
  totalPages: number;
  isPageAccessible: (pageNumber: number) => boolean;
  onNavigatePage: (pageNumber: number) => void;
  onBackToMenu?: () => void;
}

export default function PageNavigation({ 
  currentPage, 
  totalPages, 
  isPageAccessible, 
  onNavigatePage,
  onBackToMenu 
}: PageNavigationProps) {
  const previousPageNumber = currentPage - 1;
  const nextPageNumber = currentPage + 1;
  const isLastPage = totalPages > 0 && currentPage === totalPages;

  const hasPrevious = previousPageNumber >= 1 && isPageAccessible(previousPageNumber);
  const hasNext = !isLastPage && nextPageNumber <= totalPages && isPageAccessible(nextPageNumber);

  const handlePrevious = () => {
    if (hasPrevious) {
      onNavigatePage(previousPageNumber);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      onNavigatePage(nextPageNumber);
    }
  };

  const handleBackToMenu = () => {
    if (onBackToMenu) {
      onBackToMenu();
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        {/* Previous Button - Bottom Left */}
        <div className="w-40">
          {hasPrevious && (
            <button
              onClick={handlePrevious}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
            >
              <ChevronLeftIcon className="h-5 w-5" />
              <span className="font-medium">Previous</span>
            </button>
          )}
        </div>

        {/* Page Indicator */}
        <div className="text-sm text-gray-500">
          Page {currentPage} of {totalPages}
        </div>

        {/* Next Button or Back to Menu - Bottom Right */}
        <div className="w-40 flex justify-end">
          {isLastPage ? (
            <button
              onClick={handleBackToMenu}
              className="flex items-center space-x-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
            >
              <HomeIcon className="h-5 w-5" />
              <span className="font-medium">Back to Menu</span>
            </button>
          ) : hasNext ? (
            <button
              onClick={handleNext}
              className="flex items-center space-x-2 px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors duration-200"
            >
              <span className="font-medium">Next</span>
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
