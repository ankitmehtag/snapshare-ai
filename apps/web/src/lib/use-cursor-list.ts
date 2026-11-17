import { useInfiniteQuery } from '@tanstack/react-query';
import type { Paginated } from '@snapshare/types';
import { apiFetch, nextCursor, pageQuery } from './api';

/** Infinite, cursor-paginated list (photos, events, guests…). */
export function useCursorList<T>(key: readonly unknown[], path: string, limit = 50) {
  const query = useInfiniteQuery({
    queryKey: [...key, { limit }],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiFetch<Paginated<T>>(`${path}${pageQuery(pageParam, limit)}`, { signal }),
    getNextPageParam: nextCursor,
  });
  const items = query.data?.pages.flatMap((p) => p.data);
  return { ...query, items };
}
