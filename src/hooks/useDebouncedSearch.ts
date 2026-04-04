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

/**
 * A simplified hook for UID-based user search with exact match priority.
 * This is optimized for the admin panel search patterns.
 */
export const useAdminUserSearch = (delay: number = 300) => {
  return useDebouncedSearch(async (query: string) => {
    const { supabase } = await import("@/integrations/supabase/client");
    
    // First try exact match on app_uid
    const { data: exactMatch, error: exactError } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified, is_blocked')
      .eq('app_uid', query)
      .limit(1);
    
    if (!exactError && exactMatch && exactMatch.length > 0) {
      return exactMatch;
    }
    
    // Try partial match on app_uid
    const { data: uidMatch } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified, is_blocked')
      .ilike('app_uid', `%${query}%`)
      .limit(10);
    
    if (uidMatch && uidMatch.length > 0) {
      return uidMatch;
    }
    
    // Finally try name search
    const { data: nameMatch } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, app_uid, coins, is_host, is_verified, is_blocked')
      .ilike('display_name', `%${query}%`)
      .limit(10);
    
    return nameMatch || [];
  }, delay);
};

export default useDebouncedSearch;
