import { Component, type ErrorInfo, type ReactNode } from 'react';

import { reportRenderError } from '@/lib/monitoring';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

// Our own boundary rather than Sentry.ErrorBoundary, which would pull @sentry/react into the main
// bundle and defeat loading it lazily.
export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportRenderError(error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
