import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * 🔄 AdminLiveTable — Smart Live Data Table
 * 
 * Features:
 * - New rows slide in smoothly with animation
 * - Scroll-safe: won't jump or reset focus when admin is scrolling/editing
 * - "X new items" banner when admin is scrolled down
 * - Deduplication by ID
 */

interface AdminLiveTableProps<T extends Record<string, any>> {
  data: T[];
  renderRow: (item: T, index: number) => React.ReactNode;
  renderHeader?: () => React.ReactNode;
  idField?: string;
  className?: string;
  emptyMessage?: string;
  /** Keys that changed since last render — used to highlight new rows */
  highlightNewIds?: Set<string>;
  /** Max height before scrolling */
  maxHeight?: string;
}

export function AdminLiveTable<T extends Record<string, any>>({
  data,
  renderRow,
  renderHeader,
  idField = 'id',
  className,
  emptyMessage = 'No data found',
  highlightNewIds,
  maxHeight = '70vh',
}: AdminLiveTableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const prevDataLenRef = useRef(data.length);
  const isUserScrollingRef = useRef(false);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrolledDown = el.scrollTop > 80;
    setIsScrolledDown(scrolledDown);
    isUserScrollingRef.current = scrolledDown;
  }, []);

  // Detect new items added while scrolled
  useEffect(() => {
    const newCount = data.length - prevDataLenRef.current;
    if (newCount > 0 && isUserScrollingRef.current) {
      setPendingCount(prev => prev + newCount);
    }
    prevDataLenRef.current = data.length;
  }, [data.length]);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    setPendingCount(0);
  }, []);

  return (
    <div className="relative">
      {/* New items banner */}
      <AnimatePresence>
        {pendingCount > 0 && isScrolledDown && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-2 left-1/2 -translate-x-1/2 z-50"
          >
            <Button
              size="sm"
              onClick={scrollToTop}
              className="bg-primary text-primary-foreground shadow-lg rounded-full px-4 gap-2 hover:scale-105 transition-transform"
            >
              <ArrowUp className="w-3.5 h-3.5" />
              {pendingCount} new {pendingCount === 1 ? 'item' : 'items'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn('overflow-auto', className)}
        style={{ maxHeight }}
      >
        {renderHeader?.()}

        {data.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {data.map((item, index) => {
              const itemId = String(item[idField] ?? index);
              const isNew = highlightNewIds?.has(itemId);

              return (
                <motion.div
                  key={itemId}
                  initial={{ opacity: 0, height: 0, y: -8 }}
                  animate={{
                    opacity: 1,
                    height: 'auto',
                    y: 0,
                    backgroundColor: isNew
                      ? ['hsl(var(--primary) / 0.08)', 'hsl(var(--background))']
                      : undefined,
                  }}
                  exit={{ opacity: 0, height: 0, y: -8 }}
                  transition={{
                    duration: 0.3,
                    ease: 'easeOut',
                    backgroundColor: { duration: 2, delay: 0.3 },
                  }}
                  layout="position"
                >
                  {renderRow(item, index)}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/**
 * 🎯 useNewItemTracker — Tracks newly added IDs for highlight animation
 */
export function useNewItemTracker<T extends Record<string, any>>(
  data: T[],
  idField: string = 'id'
) {
  const prevIdsRef = useRef(new Set<string>());
  const [newIds, setNewIds] = useState(new Set<string>());

  useEffect(() => {
    const currentIds = new Set(data.map(item => String(item[idField])));
    const freshIds = new Set<string>();

    currentIds.forEach(id => {
      if (!prevIdsRef.current.has(id) && !id.startsWith('temp-')) {
        freshIds.add(id);
      }
    });

    if (freshIds.size > 0) {
      setNewIds(freshIds);
      // Clear highlights after 3s
      const timer = setTimeout(() => setNewIds(new Set()), 3000);
      prevIdsRef.current = currentIds;
      return () => clearTimeout(timer);
    }

    prevIdsRef.current = currentIds;
  }, [data, idField]);

  return newIds;
}

export default AdminLiveTable;
