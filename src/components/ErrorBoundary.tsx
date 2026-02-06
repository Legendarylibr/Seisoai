/**
 * Shared ErrorBoundary component
 * Prevents rendering errors from crashing the entire app
 * Uses Win95 styling consistent with the rest of the application
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import logger from '../utils/logger';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackText?: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('ErrorBoundary caught error', {
      error: error.message,
      componentStack: errorInfo.componentStack?.substring(0, 500)
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="h-full flex flex-col items-center justify-center p-4 lg:p-8"
          style={{
            background: 'var(--win95-bg)',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <div
            className="p-4 lg:p-6 text-center max-w-sm"
            style={{
              background: 'var(--win95-bg)',
              boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), inset 2px 2px 0 var(--win95-bg-light), inset -2px -2px 0 var(--win95-bg-dark)'
            }}
          >
            <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)' }}>
              {this.props.fallbackText || 'Something went wrong'}
            </p>
            <p className="text-[10px] mb-3" style={{ color: 'var(--win95-text-disabled)' }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-1.5 text-[11px] font-bold"
              style={{
                background: 'var(--win95-button-face)',
                boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
