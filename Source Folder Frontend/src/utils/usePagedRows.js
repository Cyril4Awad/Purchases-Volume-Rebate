import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Client-side paging + search for a table whose rows are all in memory (target items,
 * categories, associated suppliers). Pair with <AdvancedTable hidePager triggerPaging={onSearch}>
 * and <Pagination> from ui/Pagination underneath, like the Sales Volume Rebate reference.
 *
 *   searchText(row) → the text a row is searched by
 */
export default function usePagedRows(rows, searchText, { initialPageSize = 10 } = {}) {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(initialPageSize);
    const [search, setSearch] = useState("");
    const searchTextRef = useRef(searchText);
    searchTextRef.current = searchText;

    const filtered = useMemo(() => {
        const list = rows ?? [];
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((r) => String(searchTextRef.current?.(r) ?? "").toLowerCase().includes(q));
    }, [rows, search]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

    // keep the page in range when rows are added / removed / filtered
    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const pageRows = useMemo(() => {
        const start = (Math.min(page, pageCount) - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageCount, pageSize]);

    const setPageSize = useCallback((size) => {
        setPageSizeState(size);
        setPage(1);
    }, []);

    // AdvancedTable triggerPaging signature: (searchValue, filters, options, counter)
    const onSearch = useCallback((searchValue) => {
        setSearch(String(searchValue ?? ""));
        setPage(1);
    }, []);

    return {
        pageRows,
        total: filtered.length,
        page: Math.min(page, pageCount),
        pageSize,
        setPage,
        setPageSize,
        onSearch,
    };
}
