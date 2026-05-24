import { useState, useEffect, useRef, useCallback } from "react";

/**
 * A hook that provides debounced search functionality to prevent
 * excessive API calls during rapid typing.
 * 
 * @param searchFn - The async function to call for searching
 * @param delay - Debounce delay in milliseconds (default: 300)
 */
export const useDebouncedSearch = <T>(
  searchFn: (query: string) => Promise<T[]>,
  delay: number = 300
) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounced auto-search when query changes
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't search if query is empty
    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    // Debounce the search
    timeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      setHasSearched(true);
      
      try {
        abortControllerRef.current = new AbortController();
        const data = await searchFn(query.trim());
        setResults(data);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('[useDebouncedSearch] Error:', error);
          setResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [query, delay]);

  // Manual search function (for button click / Enter key)
  const search = useCallback(async () => {
    if (!query.trim()) return;
    
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const data = await searchFn(query.trim());
      setResults(data);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[useDebouncedSearch] Error:', error);
        setResults([]);
      }
    } finally {
      setIsSearching(false);
    }
  }, [query, searchFn]);

  // Clear results
  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setHasSearched(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    setResults,
    isSearching,
    hasSearched,
    search,
    clear
  };
};

export default useDebouncedSearch;

