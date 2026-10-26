import { Component, type ReactNode } from 'react';

/**
 * Catches render errors, including a lazy page chunk that fails to load (for example after a
 * new deploy replaced it), and offers a reload instead of a blank screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(this.state.error.message);
    return (
      <div role="alert" className="grid flex-1 place-items-center p-6">
        <div className="max-w-[420px] text-center">
          <h1 className="t-section">{chunk ? 'This page needs a reload' : 'Something went wrong on this page'}</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            {chunk
              ? 'AgentLab was updated since this tab opened, so part of it could not be loaded. Your saved workflows and history are kept in this browser.'
              : `The error was: ${this.state.error.message}. Your saved workflows and history are kept in this browser.`}
          </p>
          <button type="button" className="btn btn-secondary mt-5" onClick={() => window.location.reload()}>
            Reload AgentLab
          </button>
        </div>
      </div>
    );
  }
}
