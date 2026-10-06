import { SectionState } from './SectionState';

type Props = {
  pending: boolean;
  failed: boolean;
  empty?: boolean;
  hasData: boolean;
  fetching: boolean;
  copy: { loading: string; empty: string; error: string; retry: string };
  onRetry: () => void;
};

/** Present independent request state, retaining stale content in the owning component. */
export function QueryStatus({ pending, failed, empty, hasData, fetching, copy, onRetry }: Props) {
  if (pending && !hasData) return <SectionState busy message={copy.loading} />;
  if (failed)
    return (
      <SectionState
        message={copy.error}
        busy={fetching}
        retryLabel={copy.retry}
        onRetry={onRetry}
      />
    );
  if (empty) return <SectionState message={copy.empty} />;
  return null;
}
