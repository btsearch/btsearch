import { Component, type ErrorInfo, type ReactNode } from "react";

import { UnexpectedError } from "@/components/app/errorScreens";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (reset: () => void) => ReactNode;
  resetKey?: string | number;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState) {
    if (this.state.hasError && prevState.hasError && prevProps.resetKey !== this.props.resetKey) this.handleReset();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback(this.handleReset);
    return <UnexpectedError error={this.state.error} onRetry={this.handleReset} />;
  }
}
