import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  /** Remounts the boundary (clears the error) when this value changes — pass the route path. */
  resetKey?: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors and lazy-chunk load failures within the routed page area
 * so a single broken page shows a retry panel instead of a blank screen.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    // Clear the error when navigating to a different route.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Route render error:", error, info);
  }

  render() {
    if (this.state.error) {
      const isChunkError = /Loading chunk|dynamically imported module|Failed to fetch/i.test(
        this.state.error.message,
      );

      return (
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold text-foreground">
              {isChunkError ? "This page failed to load" : "Something went wrong"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {isChunkError
                ? "A part of the app couldn't be downloaded. This usually happens after a new version is deployed — reloading will fix it."
                : "An unexpected error occurred while rendering this page."}
            </p>
            <div className="mt-6 flex justify-center gap-2">
              <Button onClick={() => window.location.reload()}>
                <RotateCcw size={14} className="mr-2" /> Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
