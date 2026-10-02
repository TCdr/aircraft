// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';

/** Puts a VCockpit gauge element with the given panel.cfg URL in the DOM, as the sim does */
function setGaugeUrl(url: string): void {
  document.body.innerHTML = `<vcockpit-panel><efb-gauge url="${url}"></efb-gauge></vcockpit-panel>`;
}

/** Loads a fresh copy of the module: it caches the tablet index once known */
async function loadModule() {
  vi.resetModules();
  return import('./efbIndex');
}

describe('efbIndex', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is the captain tablet and does not cache it while the gauge element is missing', async () => {
    const m = await loadModule();
    expect(m.efbIndex()).toBe(1);

    // the gauge element appears later: the first officer's index must still be picked up
    setGaugeUrl('/Pages/VCockpit/Instruments/FlyPad/efb.html?Index=2');
    expect(m.efbIndex()).toBe(2);
  });

  it('reads Index=2 from the gauge URL', async () => {
    setGaugeUrl('efb.html?Index=2');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(2);
    expect(m.isCaptainEfb()).toBe(false);
  });

  it('reads Index=2 after another parameter', async () => {
    setGaugeUrl('efb.html?foo=1&Index=2');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(2);
  });

  it('does not take Index=20 for tablet 2', async () => {
    setGaugeUrl('efb.html?Index=20');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(1);
    expect(m.isCaptainEfb()).toBe(true);
  });

  it('does not take another parameter ending in Index=2 for tablet 2', async () => {
    setGaugeUrl('efb.html?SubIndex=2');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(1);
  });

  it('is the captain tablet for a URL without an index', async () => {
    setGaugeUrl('efb.html');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(1);
  });

  it('caches the index once known', async () => {
    setGaugeUrl('efb.html?Index=2');
    const m = await loadModule();
    expect(m.efbIndex()).toBe(2);

    setGaugeUrl('efb.html');
    expect(m.efbIndex()).toBe(2);
  });
});

describe('per-tablet names', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the captain names on tablet 1', async () => {
    setGaugeUrl('efb.html');
    const m = await loadModule();
    expect(m.efbSimVar('L:A32NX_EFB_BRIGHTNESS')).toBe('L:A32NX_EFB_BRIGHTNESS');
    expect(m.efbSetting('EFB_BRIGHTNESS')).toBe('EFB_BRIGHTNESS');
    expect(m.efbEvent('A32NX_EFB_POWER')).toBe('A32NX_EFB_POWER');
  });

  it('adds _2 after EFB on tablet 2', async () => {
    setGaugeUrl('efb.html?Index=2');
    const m = await loadModule();
    expect(m.efbSimVar('L:A32NX_EFB_BRIGHTNESS')).toBe('L:A32NX_EFB_2_BRIGHTNESS');
    expect(m.efbSetting('EFB_BRIGHTNESS')).toBe('EFB_2_BRIGHTNESS');
    expect(m.efbEvent('A32NX_EFB_POWER')).toBe('A32NX_EFB_2_POWER');
  });

  it('only renames names that start with the EFB prefix', async () => {
    setGaugeUrl('efb.html?Index=2');
    const m = await loadModule();
    expect(m.efbSimVar('L:A32NX_OTHER_EFB_X')).toBe('L:A32NX_OTHER_EFB_X');
    expect(m.efbSetting('A32NX_EFB_X')).toBe('A32NX_EFB_X');
  });
});
