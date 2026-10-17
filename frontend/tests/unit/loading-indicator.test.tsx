import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoadingIndicator } from '@/shared/ui/LoadingIndicator';

describe('shared loading indicator', () => {
  it('announces localized text once while keeping the animated SVG decorative', () => {
    const view = render(<LoadingIndicator label="載入中" />);
    const status = view.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status.querySelector('.visually-hidden')).toHaveTextContent('載入中');
    expect(status.querySelectorAll('.visually-hidden')).toHaveLength(1);
    const graphic = status.querySelector('svg');
    expect(graphic).toHaveAttribute('aria-hidden', 'true');
    expect(graphic).toHaveAttribute('focusable', 'false');
    expect(graphic).toHaveAttribute('data-decoration', '');
    expect(status).not.toHaveAttribute('data-decoration');
    expect(graphic?.querySelector('text')).toHaveTextContent('載入中');
  });

  it('renders a clockwise twelve-segment ring and three individually phased dots', () => {
    const view = render(<LoadingIndicator label="Loading" />);
    const graphic = view.container.querySelector('svg')!;
    const beams = [...graphic.querySelectorAll('rect[fill]')];
    expect(beams).toHaveLength(12);
    expect(beams.map((beam) => beam.parentElement?.getAttribute('transform'))).toEqual(
      Array.from({ length: 12 }, (_, index) => `rotate(${index * 30} 56 56)`),
    );
    expect(beams.every((beam) => beam.getAttribute('rx') === '2.5')).toBe(true);
    expect(new Set(beams.map((beam) => (beam as SVGElement).style.animationDelay)).size).toBe(12);
    const dots = [...graphic.querySelectorAll('circle')];
    expect(dots).toHaveLength(3);
    expect(new Set(dots.map((dot) => dot.style.animationDelay)).size).toBe(3);
  });

  it('isolates gradient references when multiple owners render loading states', () => {
    const view = render(
      <>
        <LoadingIndicator label="Loading sites" />
        <LoadingIndicator label="Loading users" />
      </>,
    );
    const graphics = [...view.container.querySelectorAll('svg')];
    const ids = graphics.map((graphic) => graphic.querySelector('linearGradient')!.id);
    expect(new Set(ids).size).toBe(2);
    for (const [index, graphic] of graphics.entries()) {
      expect(
        [...graphic.querySelectorAll('rect[fill]')].every(
          (beam) => beam.getAttribute('fill') === `url(#${ids[index]})`,
        ),
      ).toBe(true);
    }
  });

  it('accepts owner layout and safe sizes without starting data reads', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const view = render(
        <LoadingIndicator label="<b>Loading</b>" size={84} className="owner-loading" />,
      );
      expect(view.getByRole('status')).toHaveClass('owner-loading');
      expect(view.getByRole('status')).toHaveStyle({ width: '84px' });
      expect(view.container.querySelector('b')).toBeNull();
      expect(view.container.querySelector('text')).toHaveTextContent('<b>Loading</b>');
      expect(view.container.querySelector('text')).toHaveAttribute('textLength', '65');
      expect(fetch).not.toHaveBeenCalled();
      view.rerender(<LoadingIndicator label="Loading" size={Number.NaN} />);
      expect(view.getByRole('status')).toHaveStyle({ width: '112px' });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
