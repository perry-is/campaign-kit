import { Component, type ErrorInfo, type ReactNode } from "react";

/** If a screen crashes, show what happened and a way out, instead of a blank or frozen app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void window.ckDesktop?.logError(`${error.stack ?? error.message}\n${info.componentStack ?? ""}`);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="lock-screen">
        <div className="lock-card" style={{ textAlign: "left" }}>
          <h2>Something went wrong on this screen</h2>
          <p className="muted small">Your saved work is safe. Reloading usually fixes it. The details were written to the app's log.</p>
          <pre className="sent-prompt">{this.state.error.message}</pre>
          <button className="btn primary" onClick={() => location.reload()}>Reload the app</button>
        </div>
      </div>
    );
  }
}
