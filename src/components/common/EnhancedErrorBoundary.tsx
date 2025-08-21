/**
 * Enhanced Error Boundary with recovery mechanisms
 * Provides graceful error handling and user-friendly error states
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  RefreshCw, 
  Bug, 
  Home, 
  Mail,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { log } from '@/lib/production-logger';

export interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
  errorBoundaryStack?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
  showDetails: boolean;
  isRecovering: boolean;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  enableRetry?: boolean;
  maxRetries?: number;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
  isolate?: boolean;
}

export class EnhancedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;
  private previousResetKeys: Array<string | number> = [];

  constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      showDetails: false,
      isRecovering: false
    };

    this.previousResetKeys = props.resetKeys || [];
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      isRecovering: false
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props;
    
    // Log error details
    log.error('Error boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
      retryCount: this.state.retryCount
    });

    // Update state with error info
    this.setState({
      errorInfo
    });

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        log.error('Error in custom error handler', { error: handlerError });
      }
    }

    // Report to external monitoring service
    this.reportError(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;

    // Auto-reset on props change if enabled
    if (resetOnPropsChange && hasError && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
      return;
    }

    // Reset on resetKeys change
    if (resetKeys && hasError) {
      const hasResetKeyChanged = resetKeys.some((key, index) => 
        this.previousResetKeys[index] !== key
      );

      if (hasResetKeyChanged) {
        this.previousResetKeys = resetKeys;
        this.resetErrorBoundary();
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  private async reportError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      // Send to monitoring service (implement your preferred service)
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          errorId: this.state.errorId,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (reportError) {
      log.error('Failed to report error to monitoring service', { error: reportError });
    }
  }

  private resetErrorBoundary = (): void => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      log.warn('Max retries exceeded for error boundary');
      return;
    }

    this.setState({
      isRecovering: true
    });

    // Add delay before reset to prevent rapid retry loops
    this.resetTimeoutId = window.setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: retryCount + 1,
        showDetails: false,
        isRecovering: false
      });

      log.info('Error boundary reset', { retryCount: retryCount + 1 });
    }, 1000);
  };

  private toggleDetails = (): void => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  private handleReportIssue = (): void => {
    const { error, errorId } = this.state;
    const subject = `Error Report - ${errorId}`;
    const body = `Error ID: ${errorId}\nError: ${error?.message}\nURL: ${window.location.href}\nTimestamp: ${new Date().toISOString()}`;
    
    window.open(`mailto:support@mobiwave.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  render() {
    const { hasError, error, errorInfo, errorId, retryCount, showDetails, isRecovering } = this.state;
    const { children, fallback, enableRetry = true, maxRetries = 3, isolate = false } = this.props;

    if (hasError) {
      // Show custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Determine error severity and UI
      const isRecoverable = enableRetry && retryCount < maxRetries;
      const errorType = this.categorizeError(error);

      return (
        <div className={`error-boundary ${isolate ? 'error-boundary-isolated' : ''}`}>
          <Card className="max-w-2xl mx-auto my-8 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-800">
                <AlertTriangle className="w-5 h-5" />
                Something went wrong
              </CardTitle>
              <CardDescription className="text-red-700">
                {errorType.userMessage}
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Error ID for support */}
              <Alert>
                <Bug className="w-4 h-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>Error ID: <code className="bg-gray-200 px-1 rounded text-sm">{errorId}</code></span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={this.handleReportIssue}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Mail className="w-4 h-4 mr-1" />
                      Report Issue
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {isRecoverable && (
                  <Button
                    onClick={this.resetErrorBoundary}
                    disabled={isRecovering}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                    {isRecovering ? 'Recovering...' : 'Try Again'}
                    {retryCount > 0 && ` (${retryCount}/${maxRetries})`}
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="flex items-center gap-2"
                >
                  <Home className="w-4 h-4" />
                  Go Home
                </Button>

                <Button
                  variant="ghost"
                  onClick={this.toggleDetails}
                  className="flex items-center gap-2"
                >
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showDetails ? 'Hide' : 'Show'} Details
                </Button>
              </div>

              {/* Technical details (collapsible) */}
              {showDetails && (
                <div className="mt-4 p-4 bg-gray-100 rounded-lg">
                  <h4 className="font-semibold mb-2">Technical Details</h4>
                  <div className="space-y-2 text-sm font-mono">
                    <div>
                      <strong>Error:</strong> {error?.message}
                    </div>
                    {error?.stack && (
                      <div>
                        <strong>Stack Trace:</strong>
                        <pre className="mt-1 p-2 bg-white rounded overflow-x-auto text-xs">
                          {error.stack}
                        </pre>
                      </div>
                    )}
                    {errorInfo?.componentStack && (
                      <div>
                        <strong>Component Stack:</strong>
                        <pre className="mt-1 p-2 bg-white rounded overflow-x-auto text-xs">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recovery suggestions */}
              {errorType.suggestions.length > 0 && (
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold mb-2 text-blue-800">Suggested Actions:</h4>
                  <ul className="list-disc list-inside space-y-1 text-blue-700 text-sm">
                    {errorType.suggestions.map((suggestion, index) => (
                      <li key={index}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }

  private categorizeError(error: Error | null) {
    if (!error) {
      return {
        userMessage: 'An unknown error occurred',
        suggestions: ['Try refreshing the page']
      };
    }

    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('cors')) {
      return {
        userMessage: 'Network connection issue detected',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'Contact support if the problem persists'
        ]
      };
    }

    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('token')) {
      return {
        userMessage: 'Authentication issue detected',
        suggestions: [
          'Try logging out and logging back in',
          'Clear your browser cache',
          'Contact support if you continue having access issues'
        ]
      };
    }

    // Chunk loading errors (common in SPAs)
    if (message.includes('chunk') || message.includes('loading')) {
      return {
        userMessage: 'Application loading issue detected',
        suggestions: [
          'Refresh the page to reload the application',
          'Clear your browser cache',
          'Try using an incognito/private browser window'
        ]
      };
    }

    // Generic error
    return {
      userMessage: 'An unexpected error occurred in the application',
      suggestions: [
        'Try refreshing the page',
        'Clear your browser cache',
        'Try using a different browser',
        'Contact support with the error ID above'
      ]
    };
  }
}

// Convenience wrapper component
interface ErrorBoundaryWrapperProps {
  children: ReactNode;
  name?: string;
}

export const ErrorBoundaryWrapper: React.FC<ErrorBoundaryWrapperProps> = ({ 
  children, 
  name = 'Component' 
}) => (
  <EnhancedErrorBoundary
    onError={(error, errorInfo) => {
      log.error(`Error in ${name}`, {
        error: error.message,
        componentStack: errorInfo.componentStack
      });
    }}
    enableRetry={true}
    maxRetries={2}
    isolate={true}
  >
    {children}
  </EnhancedErrorBoundary>
);

export default EnhancedErrorBoundary;
