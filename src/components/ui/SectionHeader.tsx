import React, { ReactNode } from 'react';

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
  color?: 'blue' | 'red' | 'amber' | 'green';
}

export function SectionHeader({ 
  icon, 
  title, 
  color = 'blue' 
}: SectionHeaderProps) {
  const colorClasses = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    green: 'text-green-600'
  };
  
  return (
    <div className="flex items-center mb-4">
      <div className={`mr-2 ${colorClasses[color]}`}>
        {icon}
      </div>
      <h3 className="text-lg font-medium">{title}</h3>
    </div>
  );
}
