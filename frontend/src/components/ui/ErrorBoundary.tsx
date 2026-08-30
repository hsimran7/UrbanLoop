import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-8 my-6 rounded-2xl border border-rose-900/50 bg-rose-950/20 text-rose-200 space-y-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">⚠️</span>
            <h2 className="text-lg font-bold text-rose-300">Page Render Failure</h2>
          </div>
          <p className="text-xs text-rose-400 font-mono bg-rose-950/50 p-3 rounded-lg border border-rose-900/30 overflow-x-auto">
            {this.state.error?.message || 'An unexpected error occurred while rendering this page component.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition shadow-lg shadow-rose-950/50"
          >
            Reload Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
