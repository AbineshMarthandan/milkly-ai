import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { IconButton } from '../common/Button';
import { EmptyState, ErrorState, TableSkeleton } from '../common/Feedback';
import { Input, Select } from '../forms/Field';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'right' | 'center';
    /** Tailwind classes for header + cells, e.g. a width. */
    className?: string;
    /** Hide on small screens. */
    hideOnMobile?: boolean;
  }
}

export interface DataTableProps<T> {
  data: readonly T[];
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Built-in text search across all columns. Pass `false` to hide. */
  searchPlaceholder?: string | false;
  /** Extra filters rendered next to the search box. */
  toolbar?: ReactNode;
  initialSorting?: SortingState;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  getRowId?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  footer?: ReactNode;
}

const PAGE_SIZES = [10, 25, 50, 100];

/** Case-insensitive search over the row's string/number cell values. */
const globalSearch: FilterFn<unknown> = (row, _columnId, filterValue: string) => {
  const needle = filterValue.trim().toLowerCase();
  if (!needle) return true;
  return row.getAllCells().some((cell) => {
    const value = cell.getValue();
    return (typeof value === 'string' || typeof value === 'number') && String(value).toLowerCase().includes(needle);
  });
};

export function DataTable<T>({
  data,
  columns,
  loading,
  error,
  onRetry,
  searchPlaceholder = 'Search…',
  toolbar,
  initialSorting = [],
  pageSize = 25,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  getRowId,
  rowClassName,
  onRowClick,
  footer,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table manages its own memoisation.
  const table = useReactTable({
    data: data as T[],
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: (value: string) => {
      setGlobalFilter(value);
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    globalFilterFn: globalSearch as FilterFn<T>,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  const rows = table.getRowModel().rows;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(1, table.getPageCount());
  const start = filteredCount === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const end = Math.min(filteredCount, (pagination.pageIndex + 1) * pagination.pageSize);

  const alignClass = (align?: 'left' | 'right' | 'center') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <div className="flex flex-col">
      {(searchPlaceholder !== false || toolbar) && (
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:flex-wrap sm:items-center">
          {searchPlaceholder !== false && (
            <Input
              type="search"
              value={globalFilter}
              onChange={(event) => table.setGlobalFilter(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              leading={<Search className="size-4" />}
              className="sm:w-64"
            />
          )}
          {toolbar}
        </div>
      )}

      {loading ? (
        <TableSkeleton columns={Math.min(columns.length, 6)} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : filteredCount === 0 ? (
        <EmptyState
          title={globalFilter ? 'No matching records' : emptyTitle}
          description={globalFilter ? 'Try a different search term or clear the filters.' : emptyDescription}
          action={globalFilter ? undefined : emptyAction}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50/80">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const sorted = header.column.getIsSorted();
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                        className={cn(
                          'px-4 py-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-500 uppercase',
                          alignClass(meta?.align),
                          meta?.hideOnMobile && 'hidden md:table-cell',
                          meta?.className,
                        )}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cn('inline-flex items-center gap-1 hover:text-slate-800', meta?.align === 'right' && 'flex-row-reverse')}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? (
                              <ArrowUp className="size-3.5" />
                            ) : sorted === 'desc' ? (
                              <ArrowDown className="size-3.5" />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn('transition-colors hover:bg-slate-50/70', onRowClick && 'cursor-pointer', rowClassName?.(row.original))}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'px-4 py-2.5 text-slate-700',
                          alignClass(meta?.align),
                          meta?.align === 'right' && 'tabular',
                          meta?.hideOnMobile && 'hidden md:table-cell',
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {footer}

      {!loading && !error && filteredCount > 0 && (
        <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <span className="font-medium text-slate-700">{start}</span>–<span className="font-medium text-slate-700">{end}</span> of{' '}
            <span className="font-medium text-slate-700">{filteredCount}</span>
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              Rows
              <Select
                value={pagination.pageSize}
                onChange={(event) => setPagination({ pageIndex: 0, pageSize: Number(event.target.value) })}
                className="h-7 w-auto py-0 text-xs"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
            <span>
              Page {pagination.pageIndex + 1} of {pageCount}
            </span>
            <IconButton label="Previous page" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <IconButton label="Next page" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
