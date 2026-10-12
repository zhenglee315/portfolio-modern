/** Share cancellable viewport observation across demand reads and animated resources. */
export function observeViewport(
  element: Element,
  onChange: (visible: boolean) => void,
  rootMargin = '0px',
) {
  const observer = new IntersectionObserver(
    (entries) => onChange(entries.some((entry) => entry.isIntersecting)),
    { rootMargin },
  );
  observer.observe(element);
  return () => observer.disconnect();
}
