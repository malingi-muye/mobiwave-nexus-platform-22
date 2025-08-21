/**
 * @deprecated This hook is deprecated and will be removed in a future version.
 * Please use useEnhancedErrorHandler instead for all error handling functionality.
 */

import { toast } from 'sonner';

interface ErrorContext {
  operation: string;
  details?: any;
  shouldRetry?: boolean;
  retryFn?: () => Promise<any>;
}

export const useErrorHandler = () => {
  const handleError = (error: any, context: ErrorContext) => {
    console.error(`Error in ${context.operation}:`, error, context.details);
    
    // Extract meaningful error message
    let message = 'An unexpected error occurred';
    
    if (error?.message) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }
    
    // Show appropriate toast based on error type
    if (message.toLowerCase().includes('network') || 
        message.toLowerCase().includes('fetch') ||
        message.toLowerCase().includes('connection')) {
      toast.error('Network error. Please check your internet connection.');
    } else if (message.toLowerCase().includes('unauthorized') ||
               message.toLowerCase().includes('authentication')) {
      toast.error('Authentication failed. Please check your credentials.');
    } else if (message.toLowerCase().includes('rate limit')) {
      toast.error('Too many requests. Please wait before trying again.');
    } else {
      toast.error(`${context.operation} failed: ${message}`);
    }
  };

  const handleRetry = async <T>(operation: () => Promise<T>, maxRetries: number = 2): Promise<T> => {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry for CORS/network errors as they're unlikely to resolve quickly
        if (error?.message?.includes('Failed to send a request to the Edge Function') ||
            error?.message?.includes('CORS') ||
            error?.message?.includes('fetch')) {
          throw error;
        }

        if (attempt < maxRetries) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError;
  };

  return {
    handleError,
    handleRetry
  };
};
