/**
 * Input Sanitization Utility
 * 
 * Protects against XSS, SQL injection, and other injection attacks.
 * All user inputs should pass through these sanitizers before
 * being stored or rendered.
 * 
 * Usage:
 * import { sanitize } from '@/utils/inputSanitizer';
 * const clean = sanitize.text(userInput);
 * const cleanHtml = sanitize.html(userHtml);
 */

// Dangerous HTML tags and attributes
const DANGEROUS_TAGS = /(<script[^>]*>[\s\S]*?<\/script>|<iframe[^>]*>[\s\S]*?<\/iframe>|<object[^>]*>[\s\S]*?<\/object>|<embed[^>]*>[\s\S]*?<\/embed>|<link[^>]*>|<meta[^>]*>|<base[^>]*>)/gi;
const EVENT_HANDLERS = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_PROTOCOL = /javascript\s*:/gi;
const DATA_PROTOCOL = /data\s*:\s*text\/html/gi;
const EXPRESSION_CSS = /expression\s*\(/gi;
const SQL_INJECTION_PATTERNS = /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b\s)/gi;

/**
 * Strip all HTML tags from input
 */
function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 */
function escapeHtml(input: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#96;',
  };
  return input.replace(/[&<>"'\/`]/g, (char) => map[char] || char);
}

/**
 * Remove dangerous HTML but keep safe formatting tags
 */
function sanitizeHtml(input: string): string {
  let clean = input;
  clean = clean.replace(DANGEROUS_TAGS, '');
  clean = clean.replace(EVENT_HANDLERS, '');
  clean = clean.replace(JAVASCRIPT_PROTOCOL, '');
  clean = clean.replace(DATA_PROTOCOL, '');
  clean = clean.replace(EXPRESSION_CSS, '');
  return clean;
}

/**
 * Sanitize for SQL safety (defense in depth - RLS is primary protection)
 */
function sanitizeSqlInput(input: string): string {
  // Remove potential SQL injection patterns
  return input.replace(/['";\\]/g, '').replace(/--/g, '');
}

/**
 * Sanitize URL - only allow safe protocols
 */
function sanitizeUrl(input: string): string {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  
  // Allow only http, https, mailto, tel protocols
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    // Remove any embedded javascript
    return trimmed.replace(JAVASCRIPT_PROTOCOL, '').replace(DATA_PROTOCOL, '');
  }
  
  // If no protocol, assume https
  if (!lower.includes('://')) {
    return `https://${trimmed}`;
  }
  
  return ''; // Block dangerous protocols
}

/**
 * Sanitize filename
 */
function sanitizeFilename(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255);
}

/**
 * Trim and limit string length
 */
function truncate(input: string, maxLength: number): string {
  return input.trim().substring(0, maxLength);
}

/**
 * Sanitize display name
 */
function sanitizeDisplayName(input: string): string {
  return stripHtml(input)
    .replace(/[<>'"`;\\]/g, '')
    .trim()
    .substring(0, 50);
}

/**
 * Sanitize chat message
 */
function sanitizeMessage(input: string): string {
  let clean = stripHtml(input);
  clean = clean.replace(JAVASCRIPT_PROTOCOL, '');
  clean = clean.trim();
  return clean.substring(0, 2000);
}

/**
 * Sanitize email
 */
function sanitizeEmail(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9@._+-]/g, '')
    .substring(0, 255);
}

/**
 * Sanitize search query
 */
function sanitizeSearchQuery(input: string): string {
  return stripHtml(input)
    .replace(/['"`;\\<>]/g, '')
    .trim()
    .substring(0, 200);
}

/**
 * Sanitize numeric input
 */
function sanitizeNumber(input: string | number, min?: number, max?: number): number {
  const num = typeof input === 'string' ? parseFloat(input) : input;
  if (isNaN(num)) return 0;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

/**
 * Check if input contains potential XSS
 */
function hasXSS(input: string): boolean {
  return (
    DANGEROUS_TAGS.test(input) ||
    EVENT_HANDLERS.test(input) ||
    JAVASCRIPT_PROTOCOL.test(input) ||
    /<script/i.test(input)
  );
}

/**
 * Check if input contains potential SQL injection
 */
function hasSQLInjection(input: string): boolean {
  // Reset regex lastIndex
  SQL_INJECTION_PATTERNS.lastIndex = 0;
  return SQL_INJECTION_PATTERNS.test(input) && /['";]/.test(input);
}

// Main export object
export const sanitize = {
  /** Strip all HTML, escape special chars */
  text: (input: string) => escapeHtml(stripHtml(input.trim())),
  /** Remove dangerous HTML, keep safe tags */
  html: sanitizeHtml,
  /** Escape HTML special characters */
  escape: escapeHtml,
  /** Strip all HTML tags */
  strip: stripHtml,
  /** Sanitize URL */
  url: sanitizeUrl,
  /** Sanitize filename */
  filename: sanitizeFilename,
  /** Sanitize display name (max 50 chars) */
  displayName: sanitizeDisplayName,
  /** Sanitize chat message (max 2000 chars) */
  message: sanitizeMessage,
  /** Sanitize email */
  email: sanitizeEmail,
  /** Sanitize search query */
  search: sanitizeSearchQuery,
  /** Sanitize number with optional min/max */
  number: sanitizeNumber,
  /** Truncate string to max length */
  truncate,
  /** SQL defense in depth */
  sql: sanitizeSqlInput,
};

export const detect = {
  /** Check for XSS patterns */
  xss: hasXSS,
  /** Check for SQL injection patterns */
  sqlInjection: hasSQLInjection,
};

export default sanitize;
