import { Button } from "@/components/ui/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

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
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(startItem + itemsPerPage - 1, totalItems);

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center">
      {/* Info about shown items */}
      <div className="text-sm text-gray-500 mb-2 sm:mb-0">
        Hiển thị {totalItems > 0 ? startItem : 0} đến {endItem} trong tổng số {totalItems} hợp đồng
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>

        {pagination.map((page, index) => {
          if (page === "ellipsis") {
            return (
              <Button
                key={`ellipsis-${index}`}
                variant="ghost"
                size="sm"
                className="h-8 w-8 text-sm"
                disabled
              >
                ...
              </Button>
            );
          }

          return (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              className="h-8 w-8 text-sm"
              onClick={() => onPageChange(page as number)}
            >
              {page}
            </Button>
          );
        })}

        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
