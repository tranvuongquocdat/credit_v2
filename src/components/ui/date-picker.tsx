import React, { forwardRef, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import { Input } from './input';
import 'react-day-picker/dist/style.css';

interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onChange, placeholder = 'Chọn ngày', className = '', ...props }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Format the display value in Vietnamese
    const displayValue = value ? format(new Date(value), 'dd/MM/yyyy', { locale: vi }) : '';
    const selectedDate = value ? new Date(value) : undefined;
    
    const handleDaySelect = (date: Date | undefined) => {
      if (date) {
        // Format as YYYY-MM-DD for consistency
        const formattedDate = format(date, 'yyyy-MM-dd');
        onChange(formattedDate);
      } else {
        onChange('');
      }
      setIsOpen(false);
    };
    
    return (
      <div className="relative">
        {/* Visible input showing Vietnamese formatted date */}
        <Input
          type="text"
          value={displayValue}
          placeholder={placeholder}
          className={`cursor-pointer ${className}`}
          readOnly
          onClick={() => setIsOpen(!isOpen)}
          onKeyDown={(e) => {
            // Allow opening picker with Enter or Space
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
            // Close with Escape
            if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          {...props}
          ref={ref}
        />
        
        {/* Calendar icon */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg 
            className="w-4 h-4 text-gray-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
        </div>
        
        {/* Vietnamese Calendar Popup */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            
            {/* Calendar */}
            <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
              <DayPicker
                mode="single"
                selected={selectedDate}
                onSelect={handleDaySelect}
                locale={vi}
                showOutsideDays
                className="p-3"
                classNames={{
                  months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                  month: "space-y-4",
                  caption: "flex justify-center pt-1 relative items-center",
                  caption_label: "text-sm font-medium",
                  nav: "space-x-1 flex items-center",
                  nav_button: "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 w-7",
                  nav_button_previous: "absolute left-1",
                  nav_button_next: "absolute right-1",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex",
                  head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
                  row: "flex w-full mt-2",
                  cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "inline-flex items-center justify-center rounded-md text-sm font-normal ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-selected:opacity-100 h-9 w-9",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground",
                  day_outside: "text-muted-foreground opacity-50",
                  day_disabled: "text-muted-foreground opacity-50",
                  day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
                  day_hidden: "invisible",
                }}
                components={{
                  IconLeft: () => <span>‹</span>,
                  IconRight: () => <span>›</span>,
                }}
              />
              
              {/* Action buttons */}
              <div className="flex justify-between items-center px-3 pb-3 pt-0 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = format(new Date(), 'yyyy-MM-dd');
                    onChange(today);
                    setIsOpen(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded"
                >
                  Hôm nay
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

export { DatePicker };
