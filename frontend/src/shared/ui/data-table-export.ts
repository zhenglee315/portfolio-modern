import styles from './DataTable.module.css';
/** Download one generated document without opening an application or retaining its Blob URL. */
export function downloadTable(blob: Blob, filename: string) {
  const objectUrls = URL;
  const url = objectUrls.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => objectUrls.revokeObjectURL(url), 1000);
  }
}

/** Print escaped standalone markup in a temporary frame through the browser's native dialog. */
export function printTable(html: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.className = styles.printFrame ?? '';
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    const remove = () => {
      frame.remove();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      remove();
      reject(new DOMException('Export aborted', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    frame.onload = () => {
      frame.onload = null;
      if (signal.aborted) return cancel();
      const target = frame.contentWindow;
      if (!target) {
        remove();
        reject(new Error('Print frame unavailable'));
        return;
      }
      target.addEventListener('afterprint', remove, { once: true });
      try {
        target.focus();
        target.print();
        resolve();
      } catch (error) {
        remove();
        reject(error);
      }
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
