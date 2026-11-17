import type { ReactNode } from 'react';
import { EmptyState, ErrorState } from './states';
import { LoadingSkeleton } from './skeleton';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: { message?: string; requestId?: string } | null;
  onRetry?: () => void;
  empty: { title: string; description?: ReactNode; action?: ReactNode };
}

/** Accessible table with built-in loading, empty and error states. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  isLoading,
  error,
  onRetry,
  empty,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingSkeleton label={`Loading ${caption}`} />;
  if (error)
    return (
      <ErrorState
        {...(error.requestId ? { requestId: error.requestId } : {})}
        {...(onRetry ? { onRetry } : {})}
      />
    );
  if (!rows?.length) return <EmptyState {...empty} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-muted text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-border">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.className ?? ''}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
