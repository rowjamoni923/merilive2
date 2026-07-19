/**
 * Error Logging Service
 * Automatically captures actionable frontend errors to Supabase for admin monitoring
 */
import { supabase } from "@/integrations/supabase/client";

interface ErrorLogData {
  error_type: 'error' | 'warning' | 'unhandled_rejection' | 'network_error' | 'render_error';
  error_message: string;
  error_stack?: string;
  page_url?: string;
  page_path?: string;
  component_name?: string;
  user_id?: string;
  browser_info?: {
    userAgent: string;
    language: string;
    platform: string;
    screenSize: string;
    timestamp: string;
  };
}

class ErrorLoggingService {
  private static instance: ErrorLoggingService;
  private isInitialized = false;
  private errorQueue: ErrorLogData[] = [];
  private isProcessingQueue = false;
  private recentErrors = new Map<string, number>();
  private minuteWindowStartedAt = Date.now();
  private minuteLogCount = 0;
  private sessionLogCount = 0;
  private readonly dedupeWindowMs = 10 * 60 * 1000;
  private readonly maxLogsPerMinute = 6;
  private readonly maxLogsPerSession = 30;
  private readonly ignoredPatterns = [
    'UNIMPLEMENTED',
    'AbortError: signal is aborted without reason',
    '[FaceDetection] Server API error: 500',
    '[FaceDetection] Ban check error',
    '[NativeSession] Failed to save session',
    '[NativeSession] Failed to restore session',
    '[NativeSession] Failed to clear session',
    'Failed to enable secure mode',
    'Failed to disable secure mode',
    '[Beauty] Initialize failed',
    '[LiveStream] Error fetching recent viewers',
    '❌ LiveKit error: {}',
    '[ErrorLogging] Failed to log errors:',
  ];

  private constructor() {}

  static getInstance(): ErrorLoggingService {
    if (!ErrorLoggingService.instance) {
      ErrorLoggingService.instance = new ErrorLoggingService();
    }
    return ErrorLoggingService.instance;
  }

  /**
   * Initialize global error handlers
   */
  initialize() {
    if (this.isInitialized) return;

    window.addEventListener('error', (event) => {
      this.logError({
        error_type: 'error',
        error_message: this.stringifyError(event.error ?? event.message),
        error_stack: event.error?.stack,
        page_url: window.location.href,
        page_path: window.location.pathname,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      this.logError({
      });
    });

    this.isInitialized = true;
    console.info('[ErrorLogging] Service initialized with throttling');
  }

  /**
   * Get browser information
   */
  private getBrowserInfo() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenSize: `${window.screen.width}x${window.screen.height}`,
      timestamp: new Date().toISOString(),
    };
  }

  private stringifyError(value: unknown) {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private normalizeMessage(message?: string) {
    return (message || 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  private shouldIgnoreError(errorData: ErrorLogData) {
    const message = this.normalizeMessage(errorData.error_message);
    if (!message) return true;

    return this.ignoredPatterns.some((pattern) => message.includes(pattern));
  }

  private isRateLimited(errorData: ErrorLogData) {
    const now = Date.now();

    if (now - this.minuteWindowStartedAt >= 60_000) {
      this.minuteWindowStartedAt = now;
      this.minuteLogCount = 0;
    }

    if (this.sessionLogCount >= this.maxLogsPerSession || this.minuteLogCount >= this.maxLogsPerMinute) {
      return true;
    }

    const key = [
      errorData.error_type,
      errorData.page_path,
      errorData.component_name,
      this.normalizeMessage(errorData.error_message),
    ].join('|');

    const lastSeenAt = this.recentErrors.get(key);
    if (lastSeenAt && now - lastSeenAt < this.dedupeWindowMs) {
      return true;
    }

    this.recentErrors.set(key, now);
    this.minuteLogCount += 1;
    this.sessionLogCount += 1;

    if (this.recentErrors.size > 200) {
      for (const [storedKey, storedAt] of this.recentErrors.entries()) {
        if (now - storedAt > this.dedupeWindowMs) {
          this.recentErrors.delete(storedKey);
        }
      }
    }

    return false;
  }

  /**
   * Get current user ID if available
   */
  private async getCurrentUserId(): Promise<string | undefined> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Log an error to the database
   */
  async logError(errorData: Partial<ErrorLogData>) {
    const userId = await this.getCurrentUserId();

    const fullErrorData: ErrorLogData = {
      component_name: errorData.component_name,
      user_id: userId,
      browser_info: this.getBrowserInfo(),
    };

    if (this.shouldIgnoreError(fullErrorData) || this.isRateLimited(fullErrorData)) {
      return;
    }

    this.errorQueue.push(fullErrorData);
    void this.processQueue();
  }

  /**
   * Process queued errors (debounced + batched)
   */
  private async processQueue() {
    if (this.isProcessingQueue || this.errorQueue.length === 0) return;

    this.isProcessingQueue = true;
    await new Promise((resolve) => setTimeout(resolve, 500));

    const errorsToProcess = [...this.errorQueue];
    this.errorQueue = [];

    try {
      await supabase.from('system_error_logs').insert(
        errorsToProcess.map((errorData) => ({
          user_agent: errorData.browser_info?.userAgent,
        }))
      );
    } catch {
      // Silently fail - don't cause more errors
    }

    this.isProcessingQueue = false;

    if (this.errorQueue.length > 0) {
      void this.processQueue();
    }
  }

  /**
   * Log a component render error
   */
  logRenderError(error: Error, componentName: string) {
    void this.logError({
    });
  }

  /**
   * Log a network error
   */
  logNetworkError(error: Error | string, endpoint?: string) {
    void this.logError({
    });
  }
}

export const errorLoggingService = ErrorLoggingService.getInstance();
export default errorLoggingService;
