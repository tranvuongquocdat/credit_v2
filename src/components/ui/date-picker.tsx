import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Input } from './input';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onChange, placeholder = 'Chọn ngày', className = '', ...props }, ref) => {
    const inputId = props.id ? `${props.id}-hidden` : `date-${Math.random().toString(36).substring(2, 9)}`;
    
    return (
      <div className="relative">
        <input
          id={inputId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute opacity-0 w-0 h-0 overflow-hidden"
          required={props.required}
          aria-required={props.required}
        />
        <Input
          type="text"
          value={value ? format(new Date(value), 'dd/MM/yyyy', { locale: vi }) : ''}
          placeholder={placeholder}
          className={`cursor-pointer ${className}`}
          readOnly
          onClick={() => {
            const dateInput = document.getElementById(inputId) as HTMLInputElement;
            if (dateInput && typeof dateInput.showPicker === 'function') {
              dateInput.showPicker();
            } else {
              // Fallback cho các trình duyệt không hỗ trợ showPicker()
              dateInput?.click();
            }
          }}
          {...props}
          id={props.id}
        />
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

export { DatePicker };
