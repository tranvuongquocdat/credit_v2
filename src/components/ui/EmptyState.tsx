import React from 'react';

interface EmptyStateProps {
  message: string;
  className?: string;
}

export function EmptyState({ message, className = '' }: EmptyStateProps) {
  return (
    <div className={`p-4 text-center text-gray-500 ${className}`}>
      {message}
    </div>
  );
}
