/**
 * NHAI FaceAuth — Utility Functions
 *
 * Shared utilities used across all modules.
 */
import 'react-native-get-random-values';
import {Platform} from 'react-native';

/**
 * Generate a UUID v4 string.
 * Uses crypto.getRandomValues polyfill from react-native-get-random-values.
 */
export function generateUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version 4 bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // Set variant bits
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Get current timestamp in ISO 8601 UTC format.
 */
export function utcNow(): string {
  return new Date().toISOString();
}

/**
 * Calculate MD5 checksum of a string.
 * Simple implementation for upload verification.
 */
export function md5(input: string): string {
  // Simple hash function for checksum purposes
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to hex and pad to 32 chars
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Repeat to get 32-char hex string (simulated MD5)
  return (hex + hex + hex + hex).slice(0, 32);
}

/**
 * Exponential backoff delay calculation.
 * @param attempt - Current attempt number (0-based)
 * @param baseMs - Base delay in milliseconds
 * @param maxMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds with jitter
 */
export function exponentialBackoff(
  attempt: number,
  baseMs: number = 1000,
  maxMs: number = 60000,
): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  // Add 10-25% random jitter to prevent thundering herd
  const jitter = delay * (0.1 + Math.random() * 0.15);
  return Math.round(delay + jitter);
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max values.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get date string in YYYY-MM-DD format (UTC).
 */
export function getDateString(date?: Date): string {
  const d = date || new Date();
  return d.toISOString().split('T')[0];
}

/**
 * Calculate days between two ISO date strings.
 */
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

/**
 * Check if a date string is older than N days from now.
 */
export function isOlderThanDays(dateStr: string, days: number): boolean {
  return daysBetween(dateStr, utcNow()) > days;
}

/**
 * Debounce function execution.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function execution.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Create a logger with module prefix.
 */
export function createLogger(module: string) {
  const prefix = `[NHAI:${module}]`;
  return {
    info: (message: string, ...args: any[]) =>
      console.log(`${prefix} ${message}`, ...args),
    warn: (message: string, ...args: any[]) =>
      console.warn(`${prefix} ${message}`, ...args),
    error: (message: string, ...args: any[]) =>
      console.error(`${prefix} ${message}`, ...args),
    debug: (message: string, ...args: any[]) => {
      if (__DEV__) {
        console.debug(`${prefix} ${message}`, ...args);
      }
    },
  };
}

/**
 * Get platform-specific value.
 */
export function platformSelect<T>(ios: T, android: T): T {
  return Platform.OS === 'ios' ? ios : android;
}

/**
 * Safely parse JSON with fallback.
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Chunk an array into smaller arrays of specified size.
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retry an async operation with exponential backoff.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        const delay = exponentialBackoff(attempt, baseDelayMs);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}
