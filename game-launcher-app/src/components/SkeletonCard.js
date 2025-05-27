import React from 'react';

function SkeletonCard({ size = 'medium' }) {
  if (size === 'small') {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden h-40 animate-pulse">
        <div className="h-full w-full bg-gray-700"></div>
      </div>
    );
  }

  if (size === 'medium') {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden flex animate-pulse">
        <div className="w-1/3 bg-gray-700 h-32"></div>
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex-1">
            <div className="h-4 bg-gray-700 rounded mb-2 w-3/4"></div>
            <div className="h-3 bg-gray-700 rounded mb-1 w-full"></div>
            <div className="h-3 bg-gray-700 rounded mb-4 w-2/3"></div>
          </div>
          <div className="flex items-center justify-between">
            <div className="h-8 bg-gray-700 rounded w-24"></div>
            <div className="h-3 bg-gray-700 rounded w-16"></div>
          </div>
        </div>
      </div>
    );
  }

  // Large card skeleton
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden animate-pulse">
      <div className="h-48 bg-gray-700"></div>
      <div className="p-4">
        <div className="h-4 bg-gray-700 rounded mb-2 w-3/4"></div>
        <div className="h-3 bg-gray-700 rounded mb-1 w-full"></div>
        <div className="h-3 bg-gray-700 rounded mb-4 w-2/3"></div>
        <div className="h-8 bg-gray-700 rounded w-24"></div>
      </div>
    </div>
  );
}

export default SkeletonCard;
