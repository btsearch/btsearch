import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundaryClass extends Component<ErrorBoundaryProps & { t: (key: string) => string }, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps & { t: (key: string) => string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-background text-foreground">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">{this.props.t("error.title")}</h1>
            <p className="text-muted-foreground">{this.props.t("error.description")}</p>
            {this.state.error && <pre className="p-3 bg-muted rounded-lg text-xs text-left overflow-auto max-h-40">{this.state.error.message}</pre>}
            <div className="flex gap-2 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                {this.props.t("error.tryAgain")}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 transition-colors"
              >
                {this.props.t("error.reload")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const { t } = useTranslation("common");
  return (
    <ErrorBoundaryClass t={t} fallback={fallback}>
      {children}
    </ErrorBoundaryClass>
  );
}
