'use client';

import { useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useRecentCollateralNames } from '@/hooks/useRecentCollateralNames';

interface CollateralNameInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  storeId?: string;
  collateralId?: string;
  placeholder?: string;
  required?: boolean;
}

export function CollateralNameInput({
  id,
  value,
  onChange,
  storeId,
  collateralId,
  placeholder,
  required,
}: CollateralNameInputProps) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: suggestions = [] } = useRecentCollateralNames(storeId, collateralId);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return suggestions;
    return suggestions.filter((name) => name.toLowerCase().includes(query));
  }, [suggestions, value]);

  const showDropdown = open && filtered.length > 0;

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-white shadow-lg">
          <div className="px-3 py-1.5 text-xs text-gray-500 border-b">
            Gợi ý từ lịch sử
          </div>
          {filtered.map((name) => (
            <button
              key={name}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
