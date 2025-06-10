'use client';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';

interface CustomersPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function CustomersPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}: CustomersPaginationProps) {
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      // Show all pages if there are few
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show a subset of pages with current page in the middle
      let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
      
      // Adjust if we're near the end
      if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  // Luôn hiển thị cả thông tin về số lượng và nút phân trang, kể cả khi chỉ có 1 trang
  // Để màn hình giống với trang Credits
  // Với totalPages <= 1, chúng ta vẫn sẽ render toàn bộ UI và chỉ disable các nút

  // Ensure we always have at least one page
  const effectiveTotalPages = Math.max(1, totalPages);
  const pageNumbers = totalPages > 0 ? getPageNumbers() : [1];
  
  return (
    <div className="flex justify-between items-center mb-4">
      <div className="text-sm text-gray-500">
        Hiển thị {Math.min(totalItems, currentPage * itemsPerPage)} / {totalItems} khách hàng
      </div>
      
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                if (currentPage > 1) onPageChange(currentPage - 1);
              }}
              className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
          
          {/* First page link */}
          {pageNumbers[0] > 1 && (
            <>
              <PaginationItem>
                <PaginationLink onClick={() => onPageChange(1)}>
                  1
                </PaginationLink>
              </PaginationItem>
              {pageNumbers[0] > 2 && (
                <PaginationItem>
                  <span className="px-2">...</span>
                </PaginationItem>
              )}
            </>
          )}
          
          {/* Page numbers */}
          {pageNumbers.map((page) => (
            <PaginationItem key={page}>
              <PaginationLink 
                onClick={() => onPageChange(page)}
                isActive={currentPage === page}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}
          
          {/* Last page link */}
          {pageNumbers[pageNumbers.length - 1] < effectiveTotalPages - 1 && (
            <PaginationItem>
              <span className="px-2">...</span>
            </PaginationItem>
          )}
          {pageNumbers[pageNumbers.length - 1] < effectiveTotalPages && (
            <PaginationItem>
              <PaginationLink onClick={() => onPageChange(effectiveTotalPages)}>
                {effectiveTotalPages}
              </PaginationLink>
            </PaginationItem>
          )}
          
          <PaginationItem>
            <PaginationNext 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                if (currentPage < effectiveTotalPages) onPageChange(currentPage + 1);
              }}
              className={currentPage === effectiveTotalPages ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}