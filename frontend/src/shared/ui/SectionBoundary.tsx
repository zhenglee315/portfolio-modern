import { Component, type ContextType, type ReactNode } from 'react';
import { SectionState } from './SectionState';
import { NotificationContext } from './NotificationProvider';

type Props = {
  children: ReactNode;
  message: string;
  retryLabel: string;
  resetKey: string;
  fallback?: ReactNode;
  silent?: boolean;
  reloadOnRetry?: boolean;
};
type State = { failed: boolean; resetKey: string };

/** Contain render and lazy-chunk failures within one independently usable section. */
export class SectionBoundary extends Component<Props, State> {
  static contextType = NotificationContext;
  declare context: ContextType<typeof NotificationContext>;
  state: State = { failed: false, resetKey: this.props.resetKey };
  /** Announce a caught failure using safe shared copy while preserving local recovery controls. */
  componentDidCatch() {
    this.context?.notify({ kind: 'bug', id: `render:${this.props.resetKey}` });
  }
  /** Capture render failures without disclosing implementation details. */
  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }
  /** Recover when the owning route or stable data identity changes. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }
  /** Render a local recovery control while preserving sibling sections. */
  render() {
    if (this.state.failed && this.props.silent) return this.props.fallback ?? null;
    return this.state.failed ? (
      <SectionState
        message={this.props.message}
        retryLabel={this.props.retryLabel}
        onRetry={() =>
          this.props.reloadOnRetry ? window.location.reload() : this.setState({ failed: false })
        }
      >
        {this.props.fallback}
      </SectionState>
    ) : (
      this.props.children
    );
  }
}
