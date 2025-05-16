import React, { useState, useEffect, forwardRef } from 'react'
import { Input } from './input'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface CustomDateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string
  onChange: (value: string) => void
}

const CustomDateInput = forwardRef<HTMLInputElement, CustomDateInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState<string>('')

    // Format date for display when value changes
    useEffect(() => {
      if (value) {
        try {
          const date = new Date(value)
          if (!isNaN(date.getTime())) {
            setDisplayValue(format(date, 'dd/MM/yyyy', { locale: vi }))
          }
        } catch (error) {
          console.error('Invalid date format', error)
        }
      } else {
        setDisplayValue('')
      }
    }, [value])

    // Function to open date picker by clicking on input element
    const handleInputClick = () => {
      // Find and click the hidden date input
      const dateInput = document.getElementById(`${props.id || 'date-input'}-hidden`);
      if (dateInput) {
        dateInput.click();
      }
    }

    return (
      <div className="relative w-full">
        {/* Hidden actual date input that stores the ISO format */}
        <input
          ref={ref}
          id={`${props.id || 'date-input'}-hidden`}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute w-0 h-0 opacity-0 overflow-hidden"
          {...props}
        />
        
        {/* Visible input that shows formatted date - clickable */}
        <div 
          className="relative w-full cursor-pointer"
          onClick={handleInputClick}
        >
          <Input
            type="text"
            value={displayValue}
            readOnly
            placeholder="DD/MM/YYYY"
            className={`pr-10 ${className}`}
          />
          
          {/* Calendar icon */}
          <svg 
            className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" 
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
            />
          </svg>
        </div>
      </div>
    )
  }
)

CustomDateInput.displayName = 'CustomDateInput'

export { CustomDateInput }
