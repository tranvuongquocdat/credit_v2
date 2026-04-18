'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getDisplayLabelByBuild } from '@/utils/nav-display-labels';

// Định nghĩa các loại tab có thể có cho pawns
export type PawnTabId = 
  | 'payment' 
  | 'principal-repayment' 
  | 'additional-loan' 
  | 'extension' 
  | 'redeem'
  | 'liquidation'
  | 'documents'
  | 'history'
  | 'bad-credit';

export interface PawnTab {
  id: PawnTabId;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface PawnActionTabsProps {
  tabs: PawnTab[];
  activeTab: PawnTabId;
  onChangeTab: (tabId: PawnTabId) => void;
  className?: string;
  variant?: 'default' | 'compact' | 'scrollable';
}

export function PawnActionTabs({
  tabs,
  activeTab,
  onChangeTab,
  className,
  variant = 'default'
}: PawnActionTabsProps) {
  return (
    <div 
      className={cn(
        "border-b flex flex-wrap",
        variant === 'scrollable' ? "overflow-y-auto max-h-36" : "",
        variant === 'compact' ? "gap-1" : "",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && onChangeTab(tab.id)}
            disabled={tab.disabled}
            className={cn(
              "px-4 py-2 transition-all",
              isActive 
                ? "border-b-2 border-blue-500 text-blue-600 font-medium" 
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
              tab.disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              variant === 'compact' ? "text-sm" : ""
            )}
          >
            {tab.icon && <span className="mr-2">{tab.icon}</span>}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// Các tab mặc định cho hợp đồng cầm đồ
export const DEFAULT_PAWN_TABS: PawnTab[] = [
  { id: 'payment', label: 'Đóng lãi phí' },
  { id: 'principal-repayment', label: 'Trả bớt gốc' },
  { id: 'additional-loan', label: 'Vay thêm' },
  { id: 'redeem', label: getDisplayLabelByBuild('chuoc_do') }, // Sử dụng nhãn tùy theo build
  { id: 'documents', label: 'Chứng từ' },
  { id: 'history', label: 'Lịch sử' },
  { id: 'bad-credit', label: 'Báo xấu khách hàng' },
] as PawnTab[]; 