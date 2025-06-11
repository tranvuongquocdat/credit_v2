import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface CreditWarningsPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  itemsPerPage?: number;
  onPageChange: (page: number) => void;
  maxButtons?: number;
}

export function CreditWarningsPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage = 10,
  onPageChange,
  maxButtons = 5
}: CreditWarningsPaginationProps) {
  if (totalPages <= 1) return null;

  // Calculate range of visible pages
  const getPageNumbers = () => {
    const halfButtons = Math.floor(maxButtons / 2);
    
    let startPage = Math.max(currentPage - halfButtons, 1);
    let endPage = Math.min(startPage + maxButtons - 1, totalPages);
    
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(endPage - maxButtons + 1, 1);
    }
    
    const pages = [];
    
    // Add first page and ellipsis if needed
    if (startPage > 1) {
      pages.push(1);
      if (startPage > 2) {
        pages.push('ellipsis-start');
      }
    }
    
    // Add visible pages
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    // Add last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pages.push('ellipsis-end');
      }
      pages.push(totalPages);
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();
  
  // Calculate range for items display
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(startItem + itemsPerPage - 1, totalItems || 0);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between w-full gap-2">
      {/* Items info */}
      {totalItems !== undefined && (
        <div className="text-sm text-gray-500">
          Hiển thị {startItem}-{endItem} trên tổng số {totalItems} cảnh báo
        </div>
      )}
      
      {/* Pagination buttons */}
      <nav className="flex items-center space-x-1">
        {/* Previous page button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-9 w-9 p-0"
        >
          <span className="sr-only">Trang trước</span>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {/* Page number buttons */}
        {pageNumbers.map((page, index) => {
          if (page === 'ellipsis-start' || page === 'ellipsis-end') {
            return (
              <Button
                key={`ellipsis-${index}`}
                variant="outline"
                size="sm"
                disabled
                className="h-9 w-9 p-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            );
          }
          
          const pageNum = page as number;
          return (
            <Button
              key={pageNum}
              variant={currentPage === pageNum ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNum)}
              className="h-9 w-9 p-0"
            >
              {pageNum}
            </Button>
          );
        })}
        
        {/* Next page button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-9 w-9 p-0"
        >
          <span className="sr-only">Trang sau</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
} 