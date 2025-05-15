import React, { ReactNode } from 'react';

interface FormRowProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  labelWidth?: string;
  alignItems?: 'center' | 'start';
}

export function FormRow({ 
  label, 
  required = false, 
  children,
  labelWidth = '150px',
  alignItems = 'center'
}: FormRowProps) {
  const alignClass = alignItems === 'start' ? 'items-start' : 'items-center';
  
  return (
    <div className={`grid grid-cols-[${labelWidth}_1fr] gap-4 ${alignClass} mb-4`}>
      <div className="text-right font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </div>
      <div>{children}</div>
    </div>
  );
}
