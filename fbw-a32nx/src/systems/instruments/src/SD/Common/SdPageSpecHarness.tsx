// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { vi } from 'vitest';

// The React instrument framework finds its root element (which receives the `update` events) when its module loads:
// the root has to exist before the first page is imported, so a spec imports this harness before the pages.
const reactRoot = document.createElement('div');
const reactMount = document.createElement('div');
reactMount.id = 'MSFS_REACT_MOUNT';
reactRoot.appendChild(reactMount);
document.body.appendChild(reactRoot);

/** The SimVars a page reads, by name (with the "L:" prefix of local variables). Unlisted variables read as 0. */
export type SimVarValues = Record<string, number>;

export interface RenderedSdPage {
  container: HTMLDivElement;
  /** Renders again after the test changed the values of `simVars`; the pages re-read their SimVars on the next update. */
  update(elapsedMilliseconds?: number): void;
  unmount(): void;
}

/**
 * Renders an SD page (or part of it) the way the sim does, with SimVars from `simVars` instead of the simulator.
 * The returned page reads `simVars` live: a test changes a value and calls `update`, which advances the clock and sends
 * the instrument `update` event that makes every useSimVar read again.
 */
export function renderSdPage(element: React.ReactElement, simVars: SimVarValues = {}): RenderedSdPage {
  const originalGetSimVarValue = SimVar.GetSimVarValue;
  SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
  vi.useFakeTimers({ toFake: ['Date'] });

  const container = document.createElement('div');
  act(() => {
    ReactDOM.render(element, container);
  });

  return {
    container,
    update: (elapsedMilliseconds = 1000) => {
      act(() => {
        vi.setSystemTime(Date.now() + elapsedMilliseconds);
        reactMount.parentElement?.dispatchEvent(new Event('update'));
      });
    },
    unmount: () => {
      ReactDOM.unmountComponentAtNode(container);
      vi.useRealTimers();
      SimVar.GetSimVarValue = originalGetSimVarValue;
    },
  };
}

/** The text elements of a rendered page that are not hidden with the "Hidden" class, by their text. */
export function visibleTexts(page: RenderedSdPage, text: string): Element[] {
  return Array.from(page.container.querySelectorAll('text')).filter(
    (element) => element.textContent === text && !element.classList.contains('Hidden'),
  );
}
