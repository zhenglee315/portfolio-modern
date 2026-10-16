import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import Dropdown from 'react-bootstrap/Dropdown';
import { contentSizedMenuPosition } from '../lib/menu-position';
import { ChoiceChip } from './ChoiceChip';
import { Icon } from './Icon';
import styles from './SearchableSelect.module.css';

export type SelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
  reason?: string;
};
export type SelectPage = { items: SelectOption[]; page: number; pages: number };
export type SelectSource =
  | { options: readonly SelectOption[] }
  | {
      load: (search: string, page: number, signal: AbortSignal) => Promise<SelectPage>;
    };
export type SelectCopy = {
  search: string;
  empty: string;
  loading: string;
  error: string;
  retry: string;
  more: string;
};

/** Controlled single selection with cancellable paged search. No API, translation or persistence coupling.
 * The menu stays within the viewport and inside a containing modal's focus boundary.
 * @author ZhengLee 2026.10.16
 */
export function SearchableSelect({
  value,
  selected,
  source,
  label,
  copy,
  colored = false,
  disabled = false,
  onChange,
  onCancel,
}: {
  value: string | number | null;
  selected?: SelectOption;
  source: SelectSource;
  label: string;
  copy: SelectCopy;
  colored?: boolean;
  disabled?: boolean;
  onChange: (value: string | number, option: SelectOption) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<Element>();
  const [theme, setTheme] = useState<string>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<SelectOption>();
  const [response, setResponse] = useState<{
    source: SelectSource;
    key: string;
    result: SelectPage;
    failed: boolean;
  }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const key = JSON.stringify([query, page, retry]);
  const pending = 'load' in source && (response?.source !== source || response?.key !== key);
  const busy = pending || query !== search;
  const failed = !pending && response?.failed;
  const result: SelectPage =
    'options' in source
      ? {
          items: source.options.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
          ),
          page: 1,
          pages: 1,
        }
      : response?.source === source && (page > 1 || response.key === key)
        ? response.result
        : { items: [], page: 1, pages: 0 };
  const current = [selected, picked, ...result.items].find(
    (item) => item && Object.is(item.value, value),
  );
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, open]);
  useEffect(() => {
    if (!open || !('load' in source)) return;
    const controller = new AbortController();
    void source.load(query, page, controller.signal).then(
      (next) => {
        if (controller.signal.aborted) return;
        setResponse((previous) => ({
          source,
          key,
          failed: false,
          result: {
            ...next,
            items:
              page === 1
                ? next.items
                : [
                    ...(previous?.source === source ? previous.result.items : []),
                    ...next.items.filter(
                      (item) => !previous?.result.items.some((old) => old.value === item.value),
                    ),
                  ],
          },
        }));
      },
      () => {
        if (!controller.signal.aborted)
          setResponse((previous) => ({
            source,
            key,
            failed: true,
            result:
              page > 1 && previous?.source === source
                ? previous.result
                : { items: [], page: 1, pages: 0 },
          }));
      },
    );
    return () => controller.abort();
  }, [source, query, page, key, open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const keyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) {
      if (event.key === 'Escape') event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      onCancel?.();
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const options = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ??
        []),
    ];
    if (!options.length) return;
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      index < 0
        ? event.key === 'ArrowDown'
          ? 0
          : options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  };
  return (
    <Dropdown
      show={open && !disabled}
      onToggle={(next) => {
        setOpen(next);
        if (next) {
          setPortal(trigger.current?.closest('.modal') ?? document.body);
          setTheme(
            trigger.current?.closest('[data-bs-theme]')?.getAttribute('data-bs-theme') ?? undefined,
          );
          setSearch('');
          setQuery('');
          setPage(1);
          setRetry((previous) => previous + 1);
        }
      }}
      className={styles.root}
    >
      <Dropdown.Toggle
        ref={trigger}
        id={`${id}-trigger`}
        variant="outline-secondary"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        className={styles.trigger}
      >
        {current ? (
          colored ? (
            <ChoiceChip label={current.label} />
          ) : (
            current.label
          )
        ) : value === null ? (
          copy.empty
        ) : (
          String(value)
        )}
      </Dropdown.Toggle>
      {open &&
        !disabled &&
        portal &&
        createPortal(
          <Dropdown.Menu
            ref={menu}
            data-bs-theme={theme}
            className={styles.menu}
            popperConfig={contentSizedMenuPosition}
            onKeyDown={keyboard}
            aria-labelledby={`${id}-trigger`}
          >
            <input
              ref={input}
              type="search"
              size={1}
              className="form-control form-control-sm"
              aria-label={`${label}: ${copy.search}`}
              placeholder={copy.search}
              value={search}
              maxLength={200}
              onChange={(event) => {
                setSearch(event.target.value);
                input.current?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
            <div role="listbox" aria-label={label} aria-busy={busy} className={styles.options}>
              {result.items.map((item) => (
                <button
                  key={`${typeof item.value}/${item.value}`}
                  type="button"
                  role="option"
                  aria-selected={Object.is(item.value, value)}
                  disabled={busy || item.disabled}
                  title={item.reason}
                  className={styles.option}
                  onClick={() => {
                    setPicked(item);
                    onChange(item.value, item);
                    close();
                  }}
                >
                  <span>
                    {colored ? <ChoiceChip label={item.label} /> : item.label}
                    {item.reason && <small>{item.reason}</small>}
                  </span>
                  {Object.is(item.value, value) && <Icon name="check" />}
                </button>
              ))}
            </div>
            {busy && <p role="status">{copy.loading}</p>}
            {failed && (
              <div role="alert">
                {copy.error}{' '}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setRetry((v) => v + 1)}
                >
                  {copy.retry}
                </button>
              </div>
            )}
            {!busy && !failed && !result.items.length && <p>{copy.empty}</p>}
            {!busy && !failed && result.page < result.pages && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setPage(result.page + 1)}
              >
                {copy.more}
              </button>
            )}
          </Dropdown.Menu>,
          portal,
        )}
    </Dropdown>
  );
}
