import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { useStore } from '@/contexts/StoreContext';

interface InstallmentsPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export function InstallmentsPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: InstallmentsPaginationProps) {
  // Get store context to display store name in pagination info
  const { currentStore } = useStore();

  // Generate an array of page numbers to display
  const generatePagination = () => {
    // Always show first page, last page, current page, and pages adjacent to current
    const pageNumbers = [];
    const delta = 2; // Number of pages to show before and after current page

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || // First page
        i === totalPages || // Last page
        (i >= currentPage - delta && i <= currentPage + delta) // Pages around current page
      ) {
        pageNumbers.push(i);
      }
    }

    // Add ellipsis where needed
    const result = [];
    let prevPage: number | null = null;

    for (const page of pageNumbers) {
      if (prevPage !== null && page - prevPage > 1) {
        result.push("ellipsis");
      }
      result.push(page);
      prevPage = page;
    }

    return result;
  };

  const pagination = generatePagination();

  // Calculate range of items being displayed
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(startItem + itemsPerPage - 1, totalItems);

  const handlePrevious = () => {
    if (currentPage > 1) {
      onPageChange(currentPage - 1);
    }
  };
  
  const handleNext = () => {
    if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  return (
    <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-3">
      <div className="text-sm text-gray-500">
        {totalItems > 0 ? (
          <>
            Hiển thị <span className="font-medium">{startItem}</span> đến <span className="font-medium">{endItem}</span> trong tổng số <span className="font-medium">{totalItems}</span> hợp đồng
            {currentStore && <span> tại <span className="font-medium text-primary">{currentStore.name}</span></span>}
          </>
        ) : (
          <>
            Không có hợp đồng nào
            {currentStore && <span> tại <span className="font-medium text-primary">{currentStore.name}</span></span>}
          </>
        )}
      </div>
      
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  handlePrevious();
                }}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            
            {pagination.map((page, index) => {
              if (page === "ellipsis") {
                return (
                  <PaginationItem key={`ellipsis-${index}`}>
                    <PaginationLink href="#" onClick={(e) => e.preventDefault()} className="pointer-events-none">
                      ...
                    </PaginationLink>
                  </PaginationItem>
                );
              }
              
              return (
                <PaginationItem key={page}>
                  <PaginationLink 
                    href="#" 
                    isActive={page === currentPage}
                    onClick={(e) => {
                      e.preventDefault();
                      onPageChange(page as number);
                    }}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            
            <PaginationItem>
              <PaginationNext 
                href="#" 
                onClick={(e) => {
                  e.preventDefault();
                  handleNext();
                }}
                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
