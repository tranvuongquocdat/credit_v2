import React, { ReactNode } from 'react';

export interface Column {
  key: string;
  label: string;
  className?: string;
  render?: (value: any, row: any) => ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  emptyMessage: string;
  className?: string;
}

export function DataTable({ 
  columns, 
  data, 
  emptyMessage,
  className = ''
}: DataTableProps) {
  return (
    <div className={`border rounded-md overflow-hidden ${className}`}>
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(column => (
              <th 
                key={column.key} 
                className={column.className || "px-4 py-3 text-left text-sm font-medium text-gray-700"}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4 text-sm text-gray-500 text-center">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                {columns.map(column => (
                  <td 
                    key={column.key} 
                    className={column.className || "px-4 py-3 text-sm text-gray-700"}
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
