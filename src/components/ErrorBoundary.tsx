import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const raw = error instanceof Error ? error.message : String(error);
    let friendly = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        friendly = `${parsed.operationType?.toUpperCase() || 'DATA'} sync error: ${parsed.error}`;
      }
    } catch {
      // Plain error string
    }
    return { hasError: true, errorMessage: friendly };
  }

  componentDidCatch(error: unknown): void {
    console.error('JARVISOS ErrorBoundary caught:', error);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 text-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="font-mono text-sm font-semibold text-cyan-200">
            {this.props.fallbackTitle || 'Module Recovery Mode'}
          </div>
          <p className="text-xs text-slate-400 max-w-md break-words">
            {this.state.errorMessage || 'An unexpected runtime error occurred.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Module
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
