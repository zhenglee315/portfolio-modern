import { act, fireEvent, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessDeniedCowScene } from '@/pages/access-denied/AccessDeniedPage';
import { loader } from '@/routes/access-denied';

const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;
let reduced = false;
let finePointer = true;
let drawingSize = 1254;
let originalPaused: string | undefined;
const requestFrame = vi.fn((callback: FrameRequestCallback) => {
  const id = ++nextFrame;
  frames.set(id, callback);
  return id;
});
const cancelFrame = vi.fn((id: number) => frames.delete(id));

beforeEach(() => {
  frames.clear();
  nextFrame = 0;
  reduced = false;
  finePointer = true;
  drawingSize = 1254;
  originalPaused = document.documentElement.dataset.motionPaused;
  delete document.documentElement.dataset.motionPaused;
  requestFrame.mockClear();
  cancelFrame.mockClear();
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') ? reduced : finePointer;
    },
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: drawingSize,
    bottom: drawingSize,
    width: drawingSize,
    height: drawingSize,
    toJSON: () => ({}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalPaused === undefined) delete document.documentElement.dataset.motionPaused;
  else document.documentElement.dataset.motionPaused = originalPaused;
});

function scene(
  motion = true,
  width = 1254,
  preferences: Partial<ComponentProps<typeof AccessDeniedCowScene>> = {},
) {
  drawingSize = width;
  const view = render(
    <AccessDeniedCowScene
      label="Angry cow holding a forbidden sign"
      motion={motion}
      {...preferences}
    />,
  );
  const graphic = view.getByRole('img');
  const pupils = [...graphic.querySelectorAll('[data-denied-cow-pupil]')];
  return { view, graphic, pupils };
}

function move(x: number, y: number, pointerType = 'mouse') {
  const event = new MouseEvent('pointermove', { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(window, event);
}

function paint() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(performance.now())));
}

const originalParts = [
  'rig-cowBodyComplete',
  'rig-cowHeadComplete',
  'rig-cowMouthNeutral',
  'rig-cowArmLeftThinking',
  'prop-desk',
  'prop-laptop',
  'prop-mug',
  'prop-steam',
  'prop-plantPot',
  'prop-plantLeaves',
  'prop-books',
  'prop-globeFrame',
  'prop-globeMap',
  'prop-openBook',
] as const;

describe('standalone access-denied cow scene', () => {
  it('assembles the original rig and every desk prop with independent clipped SVG pupils', () => {
    const { graphic, pupils } = scene();
    expect(graphic).toHaveAttribute('aria-label', 'Angry cow holding a forbidden sign');
    expect(graphic.querySelectorAll('image')).toHaveLength(0);
    expect(graphic.querySelectorAll('clipPath')).toHaveLength(2);
    expect(pupils).toHaveLength(2);
    expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
    const uses = [...graphic.querySelectorAll('use')];
    for (const id of originalParts) {
      expect(uses.filter((use) => use.getAttribute('href')?.endsWith(`#${id}`))).toHaveLength(1);
    }
    expect(graphic.querySelector('[data-cow-part="cow-arm-right"]')).toHaveAttribute(
      'data-cow-arm-pose',
      'mouth-covering',
    );
    expect(graphic.querySelector('[data-cow-part="cow-arm-right"]')).not.toHaveAttribute(
      'transform',
    );
    expect(graphic.querySelector('[data-cow-part="cow-arm-left"]')).toHaveAttribute(
      'data-cow-arm-pose',
      'no-entry',
    );
    expect(graphic.querySelectorAll('[data-cow-part="cow-arm-left"]')).toHaveLength(1);
    expect(graphic.querySelectorAll('[data-cow-part="cow-arm-right"]')).toHaveLength(1);
    expect(graphic.querySelectorAll('[data-cow-part="cow-eyes"]')).toHaveLength(1);
    expect(graphic.querySelectorAll('[data-globe-frame]')).toHaveLength(120);
    expect(graphic.querySelectorAll('[data-cow-part="typing-sweat"]')).toHaveLength(1);
    expect(graphic.querySelectorAll('[data-cow-part="laptop-typing-light"]')).toHaveLength(1);
    expect(graphic.querySelector('[data-decoration]')).toBeTruthy();
    expect(
      graphic.querySelectorAll(
        '[data-cow-eye-state], [data-cow-part="typing-arms"], [data-cow-body-pose="typing"], ' +
          '[data-cow-part="thinking-orbit"]',
      ),
    ).toHaveLength(0);
    expect(uses.some((use) => /#rig-cowEyes/.test(use.getAttribute('href') ?? ''))).toBe(false);
  });

  it('batches pointer events and retains the same pupil direction at responsive sizes', () => {
    const full = scene();
    move(1100, 800);
    const scheduledCount = requestFrame.mock.calls.length;
    move(1254, 940);
    expect(scheduledCount).toBeGreaterThan(0);
    expect(requestFrame).toHaveBeenCalledTimes(scheduledCount);
    paint();
    const transforms = full.pupils.map((pupil) => pupil.getAttribute('transform'));
    expect(transforms.every((value) => value !== 'translate(0 0)')).toBe(true);
    full.view.unmount();
    const half = scene(true, 627);
    move(627, 470);
    paint();
    expect(half.pupils.map((pupil) => pupil.getAttribute('transform'))).toEqual(transforms);
    fireEvent(window, new Event('pointerleave'));
    expect(half.pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
  });

  it('disables pupil tracking while preserving the cow mouse motion', () => {
    const { graphic, pupils } = scene(true, 1254, { eyeTracking: false });
    const workspace = graphic.querySelector<HTMLElement>('[data-cow-scene]')!;
    move(1100, 800);
    paint();
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0);
    expect(workspace).toHaveAttribute('data-cow-motion', 'active');
    expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
  });

  it('disables cow mouse motion while keeping pupils directed toward the pointer', () => {
    const { graphic, pupils } = scene(true, 1254, { parallax: false });
    const workspace = graphic.querySelector<HTMLElement>('[data-cow-scene]')!;
    move(1100, 800);
    paint();
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    expect(workspace).toHaveAttribute('data-cow-motion', 'active');
    expect(pupils.every((pupil) => pupil.getAttribute('transform') !== 'translate(0 0)')).toBe(
      true,
    );
  });

  it('pauses only globe rotation while leaving eye tracking and cow mouse motion active', () => {
    const { graphic, pupils } = scene(true, 1254, { globeRotation: false });
    const workspace = graphic.querySelector<HTMLElement>('[data-cow-scene]')!;
    expect(workspace).toHaveAttribute('data-cow-globe-motion', 'paused');
    expect(workspace).toHaveAttribute('data-cow-motion', 'active');
    move(1100, 800);
    paint();
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0);
    expect(pupils.every((pupil) => pupil.getAttribute('transform') !== 'translate(0 0)')).toBe(
      true,
    );
  });

  it('pauses only leaf motion while retaining globe rotation, pupils and cow mouse motion', () => {
    const { graphic, pupils } = scene(true, 1254, { leafMotion: false });
    const workspace = graphic.querySelector<HTMLElement>('[data-cow-scene]')!;
    expect(workspace).toHaveAttribute('data-cow-leaf-motion', 'paused');
    expect(workspace).toHaveAttribute('data-cow-globe-motion', 'active');
    expect(workspace).toHaveAttribute('data-cow-motion', 'active');
    move(1100, 800);
    paint();
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0);
    expect(pupils.every((pupil) => pupil.getAttribute('transform') !== 'translate(0 0)')).toBe(
      true,
    );
  });

  it('centers both mouse-driven layers during overall pause and resumes selected preferences', () => {
    const { view, graphic, pupils } = scene();
    const workspace = graphic.querySelector<HTMLElement>('[data-cow-scene]')!;
    move(1100, 800);
    paint();
    view.rerender(
      <AccessDeniedCowScene
        label="Angry cow holding a forbidden sign"
        motion={false}
        globeRotation={false}
      />,
    );
    expect(workspace).toHaveAttribute('data-cow-motion', 'paused');
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBe(0);
    expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
    move(1100, 800);
    expect(frames.size).toBe(0);
    view.rerender(
      <AccessDeniedCowScene label="Angry cow holding a forbidden sign" globeRotation={false} />,
    );
    expect(workspace).toHaveAttribute('data-cow-motion', 'active');
    expect(workspace).toHaveAttribute('data-cow-globe-motion', 'paused');
    move(1100, 800);
    paint();
    expect(Number(workspace.style.getPropertyValue('--cow-pointer-x'))).toBeGreaterThan(0);
    expect(pupils.every((pupil) => pupil.getAttribute('transform') !== 'translate(0 0)')).toBe(
      true,
    );
  });

  it.each(['reduced', 'touch', 'coarse', 'paused', 'disabled'] as const)(
    'keeps the pupils centered for %s motion policies',
    (policy) => {
      reduced = policy === 'reduced';
      finePointer = policy !== 'coarse';
      if (policy === 'paused') document.documentElement.dataset.motionPaused = 'true';
      const { pupils } = scene(policy !== 'disabled');
      move(1100, 800, policy === 'touch' ? 'touch' : 'mouse');
      expect(requestFrame).not.toHaveBeenCalled();
      expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
        true,
      );
    },
  );

  it('centers active pupils when the document is hidden or background motion is paused', async () => {
    const { pupils } = scene();
    move(1100, 800);
    paint();
    expect(pupils.every((pupil) => pupil.getAttribute('transform') !== 'translate(0 0)')).toBe(
      true,
    );
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    move(1100, 800);
    paint();
    await act(async () => {
      document.documentElement.dataset.motionPaused = 'true';
    });
    expect(pupils.every((pupil) => pupil.getAttribute('transform') === 'translate(0 0)')).toBe(
      true,
    );
    expect(frames.size).toBe(0);
  });

  it('removes listeners and cancels queued pointer work on unmount', () => {
    const { view } = scene();
    move(1100, 800);
    const scheduledCount = requestFrame.mock.calls.length;
    expect(scheduledCount).toBeGreaterThan(0);
    view.unmount();
    expect(frames.size).toBe(0);
    move(1100, 800);
    expect(requestFrame).toHaveBeenCalledTimes(scheduledCount);
  });

  it('isolates eye clipping identifiers when multiple scenes coexist', () => {
    const view = render(
      <>
        <AccessDeniedCowScene label="First cow" />
        <AccessDeniedCowScene label="Second cow" />
      </>,
    );
    const ids = [...view.container.querySelectorAll('clipPath')].map((clip) => clip.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it('returns only language data with a 403 status and performs no API reads', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = loader({ params: { locale: 'zh-Hant' } } as Parameters<typeof loader>[0]);
    expect(result).toMatchObject({ data: { locale: 'zh-Hant' }, init: { status: 403 } });
    expect(fetch).not.toHaveBeenCalled();
  });
});
