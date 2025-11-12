import { toast } from "@/hooks/use-toast";

/**
 * Enhanced fetch wrapper with maintenance mode detection and auto-retry
 *
 * Features:
 * - Detects 503 maintenance responses
 * - Shows user-friendly toast notifications
 * - Auto-retries after suggested delay
 * - Handles common API errors gracefully
 */

interface FetchOptions extends RequestInit {
  /** Don't show error toasts (for silent requests) */
  silent?: boolean;
  /** Custom error handler */
  onError?: (error: any) => void;
  /** Max retries for maintenance mode (default: 2) */
  maxRetries?: number;
}

interface MaintenanceResponse {
  error: string;
  message: string;
  retry_after?: number;
  status: 'maintenance';
}

/**
 * Sleep helper for retry delays
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enhanced fetch with maintenance mode handling
 */
export async function apiFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    silent = false,
    onError,
    maxRetries = 2,
    ...fetchOptions
  } = options;

  let lastError: any = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, fetchOptions);

      // Handle maintenance mode (503)
      if (response.status === 503) {
        const data = await response.json().catch(() => ({})) as Partial<MaintenanceResponse>;

        // Check if this is a maintenance response
        if (data.status === 'maintenance') {
          const retryAfter = (data.retry_after || 30) * 1000; // Convert to ms

          if (attempt < maxRetries) {
            // Show maintenance toast with countdown
            if (!silent) {
              toast({
                title: "🔧 System Maintenance",
                description: data.message || "We're deploying an update. Retrying automatically...",
                variant: "default",
              });
            }

            // Wait for suggested retry time
            await sleep(retryAfter);
            attempt++;
            continue; // Retry the request
          } else {
            // Max retries reached
            if (!silent) {
              toast({
                title: "⏸️ Maintenance in Progress",
                description: "The system is still updating. Please try again in a few moments.",
                variant: "destructive",
              });
            }

            const error = new Error(data.message || 'System is in maintenance mode');
            if (onError) onError(error);
            throw error;
          }
        }
      }

      // Handle other error responses
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle specific error codes
        switch (response.status) {
          case 401:
            if (!silent) {
              toast({
                title: "🔒 Authentication Required",
                description: errorData.error || "Please log in to continue",
                variant: "destructive",
              });
            }
            break;

          case 402:
            if (!silent) {
              toast({
                title: "💳 Insufficient Credits",
                description: errorData.error || "You don't have enough credits for this operation",
                variant: "destructive",
              });
            }
            break;

          case 403:
            if (!silent) {
              toast({
                title: "🚫 Access Denied",
                description: errorData.error || "You don't have permission to perform this action",
                variant: "destructive",
              });
            }
            break;

          case 404:
            if (!silent) {
              toast({
                title: "❓ Not Found",
                description: errorData.error || "The requested resource was not found",
                variant: "destructive",
              });
            }
            break;

          case 409:
            // Conflict (e.g., operation already in progress)
            if (!silent) {
              toast({
                title: "⚠️ Operation in Progress",
                description: errorData.error || "This operation is already running",
                variant: "default",
              });
            }
            break;

          case 429:
            // Rate limited
            const retryAfter = errorData.retry_after || 60;
            if (!silent) {
              toast({
                title: "⏱️ Rate Limit Exceeded",
                description: `Please wait ${retryAfter} seconds before trying again`,
                variant: "destructive",
              });
            }
            break;

          default:
            // Generic error
            if (!silent) {
              toast({
                title: "❌ Error",
                description: errorData.error || `Request failed with status ${response.status}`,
                variant: "destructive",
              });
            }
        }

        const error = new Error(errorData.error || `HTTP ${response.status}`);
        if (onError) onError(error);
        throw error;
      }

      // Success - parse and return response
      const data = await response.json();
      return data as T;

    } catch (error: any) {
      lastError = error;

      // If it's a fetch/network error and we haven't maxed retries, try again
      if (
        attempt < maxRetries &&
        (error.name === 'TypeError' || error.message?.includes('fetch'))
      ) {
        if (!silent) {
          toast({
            title: "🔄 Connection Issue",
            description: "Retrying request...",
            variant: "default",
          });
        }
        await sleep(2000); // Wait 2 seconds before retry
        attempt++;
        continue;
      }

      // Non-retryable error or max retries reached
      if (!silent && !error.message?.includes('HTTP')) {
        toast({
          title: "❌ Request Failed",
          description: error.message || "An unexpected error occurred",
          variant: "destructive",
        });
      }

      if (onError) onError(error);
      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Request failed after retries');
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T = any>(url: string, options?: FetchOptions) =>
    apiFetch<T>(url, { ...options, method: 'GET' }),

  post: <T = any>(url: string, body?: any, options?: FetchOptions) =>
    apiFetch<T>(url, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any, options?: FetchOptions) =>
    apiFetch<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(url: string, options?: FetchOptions) =>
    apiFetch<T>(url, { ...options, method: 'DELETE' }),
};

/**
 * Helper to add authorization header from Supabase session
 */
export function withAuth(token: string, options: FetchOptions = {}): FetchOptions {
  return {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  };
}
