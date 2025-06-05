import React, { useState, useEffect } from 'react';
import { Input } from './input';

interface MoneyInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  label?: string;
  required?: boolean;
}

// Function to convert number to Vietnamese words
const convertNumberToWords = (num: number): string => {
  if (num === 0) return 'Không đồng';
  
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const tens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];
  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  
  // Special case for zero
  if (num === 0) return 'Không đồng';
  
  // Convert to string and handle negative numbers
  const isNegative = num < 0;
  const numStr = Math.abs(num).toString();
  
  // Process in groups of 3 digits
  const groups = [];
  for (let i = numStr.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    groups.unshift(numStr.substring(start, i));
  }
  
  // Function to convert a 3-digit group to words
  const convertGroup = (group: string): string => {
    let result = '';
    const digits = group.padStart(3, '0');
    
    // Hundreds
    if (digits[0] !== '0') {
      result += units[parseInt(digits[0])] + ' trăm ';
    }
    
    // Tens and ones
    if (digits[1] === '0' && digits[2] === '0') {
      // If both tens and ones are 0, and we have a hundreds digit, we're done
      if (result) return result.trim();
      return '';
    } else if (digits[1] === '0') {
      // If tens is 0 but ones is not - remove the word "lẻ"
      result += units[parseInt(digits[2])];
    } else if (digits[1] === '1') {
      // Special case for 10-19
      if (digits[2] === '0') {
        result += 'mười';
      } else if (digits[2] === '5') {
        result += 'mười lăm';
      } else {
        result += 'mười ' + units[parseInt(digits[2])];
      }
    } else {
      // Normal case for tens
      result += tens[parseInt(digits[1])];
      
      // Handle ones
      if (digits[2] !== '0') {
        if (digits[2] === '1' && digits[1] !== '1') {
          result += ' mốt';
        } else if (digits[2] === '5' && digits[1] !== '0') {
          result += ' lăm';
        } else {
          result += ' ' + units[parseInt(digits[2])];
        }
      }
    }
    
    return result.trim();
  };
  
  // Process each group
  const wordsArray = groups.map((group, index) => {
    const groupWords = convertGroup(group);
    if (!groupWords) return '';
    
    const scaleIndex = groups.length - 1 - index;
    return groupWords + (scaleIndex > 0 ? ' ' + scales[scaleIndex] : '');
  }).filter(Boolean);
  
  // Join all groups with proper spacing
  let result = wordsArray.join(' ');
  
  // Add 'đồng' at the end
  result += ' đồng';
  
  // Handle negative numbers
  if (isNegative) {
    result = 'Âm ' + result;
  }
  
  // Capitalize first letter
  return result.charAt(0).toUpperCase() + result.slice(1);
};

// Format number with thousand separators
const formatNumber = (value: string | number): string => {
  // Convert to number and back to string to remove non-numeric characters
  const numericValue = value.toString().replace(/[^0-9]/g, '');
  // Format with thousand separators
  return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export function MoneyInput({ 
  value, 
  onChange, 
  error,
  label,
  required = false,
  className = '',
  ...props 
}: MoneyInputProps) {
  const [formattedValue, setFormattedValue] = useState<string>(formatNumber(value || 0));
  const [amountInWords, setAmountInWords] = useState<string>('');
  
  // Update formatted value when the input value changes
  useEffect(() => {
    setFormattedValue(formatNumber(value || 0));
    
    // Update the text representation
    const numericValue = parseInt(value?.toString().replace(/[^0-9]/g, '') || '0');
    setAmountInWords(convertNumberToWords(numericValue));
  }, [value]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, '');
    setFormattedValue(formatNumber(rawValue));
    
    // Create a synthetic event with the numeric value
    const syntheticEvent = {
      ...e,
      target: {
        ...e.target,
        value: rawValue
      }
    };
    
    onChange(syntheticEvent as React.ChangeEvent<HTMLInputElement>);
  };
  
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      {/* Amount in words displayed above the input */}
      <div className="text-sm font-medium p-2 bg-blue-50 text-blue-700 rounded-md">
        {amountInWords}
      </div>
      
      {/* Input field */}
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        value={formattedValue}
        onChange={handleInputChange}
        className={`${error ? 'border-red-500' : ''} ${className}`}
      />
      
      {/* Error message */}
      {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
    </div>
  );
} 