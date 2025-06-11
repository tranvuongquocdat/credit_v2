import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { addDays, format, parse } from 'date-fns';

interface DateInputWithControlsProps {
  value: string; // format: yyyy-MM-dd
  onChange: (value: string) => void;
  name?: string;
  className?: string;
  disabled?: boolean;
}

export function DateInputWithControls({
  value,
  onChange,
  name,
  className = '',
  disabled = false
}: DateInputWithControlsProps) {
  // Function to handle date increment
  const incrementDate = () => {
    try {
      const currentDate = parse(value, 'yyyy-MM-dd', new Date());
      const newDate = addDays(currentDate, 1);
      onChange(format(newDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error incrementing date:', error);
    }
  };

  // Function to handle date decrement
  const decrementDate = () => {
    try {
      const currentDate = parse(value, 'yyyy-MM-dd', new Date());
      const newDate = addDays(currentDate, -1);
      onChange(format(newDate, 'yyyy-MM-dd'));
    } catch (error) {
      console.error('Error decrementing date:', error);
    }
  };

  return (
    <div className="relative">
      <Input
        type="date"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${className} pr-8`}
        disabled={disabled}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0"
          onClick={incrementDate}
          disabled={disabled}
        >
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-4 w-4 p-0"
          onClick={decrementDate}
          disabled={disabled}
        >
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
} 