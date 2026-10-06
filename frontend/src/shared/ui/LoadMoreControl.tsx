type Props = {
  busy: boolean;
  label: string;
  busyLabel: string;
  error?: string;
  onLoad: () => void;
};

/** Share page continuation feedback without owning domain fetching or record state. */
export function LoadMoreControl({ busy, label, busyLabel, error, onLoad }: Props) {
  return (
    <div className="load-more-control">
      {error && <p role="alert">{error}</p>}
      <button type="button" className="text-link" aria-busy={busy} disabled={busy} onClick={onLoad}>
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}
