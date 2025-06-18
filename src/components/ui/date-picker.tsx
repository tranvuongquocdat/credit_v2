import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  maxDate?: string;
  minDate?: string;
}

const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ value, onChange, placeholder = 'Chọn ngày', className = '', maxDate, minDate, ...props }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0, showAbove: false });
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Format the display value in Vietnamese
    const displayValue = value ? format(new Date(value), 'dd/MM/yyyy', { locale: vi }) : '';
    const selectedDate = value ? new Date(value) : undefined;
    
    // Calculate optimal position when opening calendar
    useEffect(() => {
      if (isOpen && inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        
        const calendarHeight = 400;
        const calendarWidth = 300;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        // Determine if should show above
        const showAbove = spaceAbove > spaceBelow && spaceBelow < calendarHeight;
        
        // Calculate horizontal position (center relative to input)
        let left = rect.left + scrollLeft + (rect.width / 2) - (calendarWidth / 2);
        
        // Adjust horizontal position if it would go off-screen
        if (left < 10) {
          left = 10;
        } else if (left + calendarWidth > window.innerWidth - 10) {
          left = window.innerWidth - calendarWidth - 10;
        }
        
        // Calculate vertical position
        let top;
        if (showAbove) {
          top = rect.top + scrollTop - calendarHeight - 8;
          // Ensure it doesn't go above viewport
          if (top < 10) {
            top = 10;
          }
        } else {
          top = rect.bottom + scrollTop + 8;
          // If it would go below viewport, force it above
          if (top + calendarHeight > window.innerHeight + scrollTop - 10) {
            top = rect.top + scrollTop - calendarHeight - 8;
            if (top < 10) {
              top = 10;
            }
          }
        }
        
        setPosition({ top, left, showAbove });
      }
    }, [isOpen]);
    
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
    
    // Calendar popup component
    const CalendarPopup = () => (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-[99998]" 
          onClick={() => setIsOpen(false)}
          style={{ pointerEvents: 'auto' }}
        />
        
        {/* Calendar */}
        <div 
          className="fixed z-[99999] bg-white border border-gray-200 rounded-md shadow-xl"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            minWidth: '300px',
            pointerEvents: 'auto'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            locale={vi}
            showOutsideDays
            className="p-3"
            toDate={maxDate ? new Date(maxDate) : undefined}
            fromDate={minDate ? new Date(minDate) : undefined}
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
              month: "space-y-4",
              caption: "flex justify-center pt-1 relative items-center",
              caption_label: "text-sm font-medium",
              nav: "space-x-1 flex items-center",
              nav_button: "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 w-7 cursor-pointer",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex",
              head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
              row: "flex w-full mt-2",
              cell: "text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
              day: "inline-flex items-center justify-center rounded-md text-sm font-normal ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-selected:opacity-100 h-9 w-9 cursor-pointer hover:bg-accent hover:text-accent-foreground",
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
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange('');
                setIsOpen(false);
              }}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer"
              style={{ pointerEvents: 'auto' }}
            >
              Xóa
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const today = format(new Date(), 'yyyy-MM-dd');
                onChange(today);
                setIsOpen(false);
              }}
              className="text-sm text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 cursor-pointer"
              style={{ pointerEvents: 'auto' }}
            >
              Hôm nay
            </button>
          </div>
        </div>
      </>
    );
    
    return (
      <div className="relative">
        {/* Visible input showing Vietnamese formatted date */}
        <Input
          ref={(node) => {
            inputRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
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
        />
        
        {/* Calendar icon */}
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer hover:bg-gray-50 rounded-r-md transition-colors"
          onClick={() => setIsOpen(!isOpen)}
          tabIndex={-1}
        >
          <svg 
            className="w-4 h-4 text-gray-400 hover:text-gray-600" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2v12a2 2 0 002 2z" 
            />
          </svg>
        </button>
        
        {/* Calendar Popup - Rendered via Portal */}
        {isOpen && typeof document !== 'undefined' && createPortal(
          <CalendarPopup />,
          document.body
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

export { DatePicker };
