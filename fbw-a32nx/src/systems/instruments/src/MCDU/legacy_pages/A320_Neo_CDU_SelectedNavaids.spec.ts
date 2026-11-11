// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CDUSelectedNavaids } from './A320_Neo_CDU_SelectedNavaids';

const GLS = { channel: 31434, rpi: 'G25P', course: 249, slope: -3, definition: null };

function createScreen(options: { fmTuningActive?: boolean; manual?: boolean; gls?: object } = {}) {
  const { fmTuningActive = true, manual = false } = options;
  const gls = 'gls' in options ? options.gls : GLS;
  return {
    clearDisplay: vi.fn(),
    page: { SelectedNavaids: 'SelectedNavaids', Current: '' },
    requestUpdate: vi.fn(),
    navigation: { isGpsDeselected: () => false },
    getSelectedNavaids: () => [],
    deselectedNavaids: [] as string[],
    isFmTuningActive: () => fmTuningActive,
    getMmrTuningData: () => ({ gls, manual }),
    onLeftInput: [],
    onRightInput: [],
    rightInputDelay: [],
    setTemplate: vi.fn(),
  } as any;
}

describe('the SELECTED NAVAIDS page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const rows = (screen: ReturnType<typeof createScreen>) => screen.setTemplate.mock.calls[0][0] as string[][];

  it('shows the GLS on the row of the ILS', () => {
    const screen = createScreen();

    CDUSelectedNavaids.ShowPage(screen);

    expect(rows(screen)[7][0]).toBe('\xa0GLS\xa0\xa0\xa0\xa0\xa0\xa0AUTO');
    expect(rows(screen)[8][0]).toBe('{cyan}\xa0G25P\xa0\xa0{end}{small}{green}31434{end}{end}');
  });

  it('says MAN for a GLS the crew entered', () => {
    const screen = createScreen({ manual: true });

    CDUSelectedNavaids.ShowPage(screen);

    expect(rows(screen)[7][0]).toBe('\xa0GLS\xa0\xa0\xa0\xa0\xa0\xa0MAN');
  });

  it('shows no GLS row without a GLS', () => {
    const screen = createScreen({ gls: undefined });

    CDUSelectedNavaids.ShowPage(screen);

    expect(rows(screen)[7]).toEqual(['']);
    expect(rows(screen)[8]).toEqual(['']);
  });

  it('says RMP for a GLS tuned on the RMP', () => {
    const screen = createScreen({ fmTuningActive: false, manual: true });

    CDUSelectedNavaids.ShowPage(screen);

    expect(rows(screen)[7][0]).toBe(' GLS      RMP');
    expect(rows(screen)[8][0]).toBe('{cyan} G25P  {end}{small}{green}31434{end}{end}');
  });

  it('shows no GLS row while the RMP tunes the radios to something else', () => {
    const screen = createScreen({ fmTuningActive: false, gls: undefined });

    CDUSelectedNavaids.ShowPage(screen);

    expect(rows(screen)[7]).toEqual(['']);
    expect(rows(screen)[8]).toEqual(['']);
  });
});
