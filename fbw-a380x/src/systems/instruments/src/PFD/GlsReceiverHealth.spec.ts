// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { GlsFlagMonitor } from '@flybywiresim/pfd';
import { isGlsReceiverInoperative } from './GlsReceiverHealth';

describe('A380X PFD GLS receiver health', () => {
  const healthy = { glsFailed: false, stationFailed: false, mmrPowered: true };

  it('is operative with a powered MMR and no failure', () => {
    expect(isGlsReceiverInoperative(healthy)).toBe(false);
  });

  it('is inoperative with a failed GLS function or a failed ground station', () => {
    expect(isGlsReceiverInoperative({ ...healthy, glsFailed: true })).toBe(true);
    expect(isGlsReceiverInoperative({ ...healthy, stationFailed: true })).toBe(true);
  });

  it('is inoperative when the MMR has no power', () => {
    expect(isGlsReceiverInoperative({ ...healthy, mmrPowered: false })).toBe(true);
  });

  it('raises the GLS flag at once for an MMR that lost its power before it received the station', () => {
    const monitor = new GlsFlagMonitor();
    const flagShown = monitor.update(
      {
        lsButton: true,
        channel: 20001,
        approachModeArmedOrEngaged: false,
        landModesEngaged: false,
        locValid: false,
        gsValid: false,
        glsFailed: isGlsReceiverInoperative({ ...healthy, mmrPowered: false }),
        onGround: true,
      },
      100,
    );
    expect(flagShown).toBe(true);
  });
});
