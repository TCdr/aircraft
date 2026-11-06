// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDisplayIndex } from './PfdDisplayIndex';

/** A page with a panel holding the given gauges, as the sim builds it from panel.cfg */
function createPanelWith(...gaugeUrls: string[]): HTMLElement[] {
  const panel = document.createElement('vcockpit-panel');
  document.body.appendChild(panel);
  return gaugeUrls.map((url) => {
    const gauge = document.createElement('a380x-pfd');
    gauge.setAttribute('url', url);
    panel.appendChild(gauge);
    return gauge;
  });
}

describe('getDisplayIndex', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is 1 for the CAPT PFD and 2 for the F/O PFD', () => {
    createPanelWith('A380X/PFD/pfd.html?Index=1&duID=0');
    expect(getDisplayIndex()).toBe(1);

    document.body.innerHTML = '';
    createPanelWith('A380X/PFD/pfd.html?Index=2&duID=3');
    expect(getDisplayIndex()).toBe(2);
  });

  it('is 1 and 2 for a PFD drawn on an ND DU', () => {
    createPanelWith('A380X/ND/nd.html?Index=1&duID=1', 'A380X/PFD/pfd-hosted.html?Index=1&hostDu=1&duID=0');
    expect(getDisplayIndex()).toBe(1);

    document.body.innerHTML = '';
    createPanelWith('A380X/ND/nd.html?Index=2&duID=4', 'A380X/PFD/pfd-hosted.html?Index=2&hostDu=4&duID=3');
    expect(getDisplayIndex()).toBe(2);
  });

  it('does not search the page again once it knows the side', () => {
    createPanelWith('A380X/PFD/pfd.html?Index=1&duID=0');
    expect(getDisplayIndex()).toBe(1);

    const search = vi.spyOn(document, 'querySelectorAll');
    expect(getDisplayIndex()).toBe(1);
    expect(getDisplayIndex()).toBe(1);

    expect(search).not.toHaveBeenCalled();
  });

  it('does not rely on Node.isConnected, which the sim engine may not have', () => {
    const [gauge] = createPanelWith('A380X/PFD/pfd.html?Index=1&duID=0');
    Object.defineProperty(gauge, 'isConnected', { value: undefined });
    expect(getDisplayIndex()).toBe(1);

    const search = vi.spyOn(document, 'querySelectorAll');
    expect(getDisplayIndex()).toBe(1);

    expect(search).not.toHaveBeenCalled();
  });

  it('searches again while there is no PFD gauge URL', () => {
    expect(getDisplayIndex()).toBe(0);
    const [gauge] = createPanelWith('');
    expect(getDisplayIndex()).toBe(0);

    gauge.setAttribute('url', 'A380X/PFD/pfd.html?Index=2&duID=3');
    expect(getDisplayIndex()).toBe(2);
  });
});
