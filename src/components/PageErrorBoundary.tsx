import React from 'react';

interface Props {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
}

/**
 * Boundary maxalli ah — haddii bog gaar ah uu khaldamo, app-ka oo dhan yaan
 * loo gudbin bogga "This page didn't load".
 */
class PageErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[PageErrorBoundary]', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-lg font-semibold text-foreground">Wax baa qaldamay</h1>
          <p className="text-sm text-muted-foreground">
            Fadlan isku day mar kale — xogtaadu waa badbaado.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry?.();
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Isku day mar kale
            </button>
            <button
              onClick={() => window.history.back()}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
            >
              Dib u noqo
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default PageErrorBoundary;
