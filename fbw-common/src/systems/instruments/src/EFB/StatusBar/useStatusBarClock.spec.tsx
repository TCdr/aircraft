// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStatusBarClock } from './useStatusBarClock';

// The update events go to the parent of this element (read when defaults.ts loads, so it exists before the imports)
const mount = vi.hoisted(() => {
  const element = document.createElement('div');
  element.id = 'MSFS_REACT_MOUNT';
  const root = document.createElement('div');
  root.appendChild(element);
  document.body.appendChild(root);
  return { root };
});

const FRAME_MS = 17;

describe('useStatusBarClock', () => {
  let container: HTMLDivElement;
  let renderCount: number;
  let seconds: number;

  const Probe = () => {
    renderCount++;
    const clock = useStatusBarClock();
    return <p>{clock.zuluSeconds}</p>;
  };

  const runFrames = (frames: number) => {
    for (let frame = 0; frame < frames; frame++) {
      vi.advanceTimersByTime(FRAME_MS);
      // The sim time advances on every frame
      seconds += FRAME_MS / 1000;
      act(() => {
        mount.root.dispatchEvent(new Event('update'));
      });
    }
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    seconds = 40_000;
    renderCount = 0;
    SimVar.GetSimVarValue = vi.fn((name: string) => (name.includes('TIME') ? seconds : 1));
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      render(<Probe />, container);
    });
  });

  afterEach(() => {
    unmountComponentAtNode(container);
    container.remove();
    vi.useRealTimers();
  });

  it('does not render on every frame while the seconds keep changing', () => {
    const rendersAfterMount = renderCount;

    runFrames(120); // about 2 s

    expect(renderCount - rendersAfterMount).toBeLessThanOrEqual(3);
  });

  it('still follows the clock about once per second', () => {
    runFrames(120);

    expect(renderCount).toBeGreaterThan(1);
    expect(container.textContent).not.toBe('40000');
  });
});
