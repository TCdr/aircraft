// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { FadecChannelFailures, FadecPowerInputs, fadecChannelPower, isFadecPowered } from './A32NX_FADEC';

describe('FADEC power and engine data', () => {
  const running: FadecPowerInputs = {
    firePbPushed: false,
    n2Percent: 80,
    alternatorFailed: false,
    inFlight: false,
    engModeSelNorm: true,
    fadecGroundPowerOn: false,
    fadecTimerRunning: false,
    channelABusPowered: true,
    channelBBusPowered: true,
  };
  const noChannelLost: FadecChannelFailures = { channelALost: false, channelBLost: false };
  const powered = (inputs: FadecPowerInputs, failures = noChannelLost) =>
    isFadecPowered(fadecChannelPower(inputs), failures);
  const bothChannels = { channelA: true, channelB: true };
  const noChannel = { channelA: false, channelB: false };

  it('is powered while the engine runs', () => {
    expect(powered(running)).toBe(true);
  });

  /* ENG FADEC FAULT: with both channels lost the engine indications are lost */
  it('sends no engine data with both FADEC channels lost, even with the engine running', () => {
    const bothLost = { channelALost: true, channelBLost: true };
    expect(powered(running, bothLost)).toBe(false);
    expect(powered({ ...running, fadecGroundPowerOn: true }, bothLost)).toBe(false);
  });

  it('is unpowered with the FIRE pb pushed, and on the ground after its timer with the engine off', () => {
    expect(powered({ ...running, firePbPushed: true })).toBe(false);
    expect(powered({ ...running, n2Percent: 0 })).toBe(false);
    expect(powered({ ...running, n2Percent: 0, fadecTimerRunning: true })).toBe(true);
    expect(powered({ ...running, n2Percent: 0, engModeSelNorm: false })).toBe(true);
  });

  it('is self-powered by its alternator above 8 % N2, whatever the aircraft buses', () => {
    const unpoweredBuses = { ...running, channelABusPowered: false, channelBBusPowered: false };
    expect(fadecChannelPower({ ...unpoweredBuses, n2Percent: 8.5 })).toEqual(bothChannels);
    expect(fadecChannelPower({ ...unpoweredBuses, n2Percent: 8 })).toEqual(noChannel);
  });

  /* ENG 1(2) FADEC ALTERNATOR: the aircraft network supplies the FADEC */
  it('falls back to the aircraft network when its alternator has failed', () => {
    const alternatorFailed = { ...running, alternatorFailed: true };
    expect(fadecChannelPower({ ...alternatorFailed, inFlight: true })).toEqual(bothChannels);
    expect(fadecChannelPower({ ...alternatorFailed, inFlight: true, channelBBusPowered: false })).toEqual({
      channelA: true,
      channelB: false,
    });
    expect(
      fadecChannelPower({
        ...alternatorFailed,
        inFlight: true,
        channelABusPowered: false,
        channelBBusPowered: false,
      }),
    ).toEqual(noChannel);
  });

  it('keeps the aircraft network supply of a running engine with a failed alternator on the ground', () => {
    expect(fadecChannelPower({ ...running, alternatorFailed: true })).toEqual(bothChannels);
    expect(powered({ ...running, alternatorFailed: true, channelABusPowered: false })).toBe(true);
  });

  it('is always supplied by the aircraft network in flight', () => {
    const windmilling = { ...running, n2Percent: 5, inFlight: true };
    expect(powered(windmilling)).toBe(true);
    expect(powered({ ...windmilling, inFlight: false })).toBe(false);
  });

  /* An unpowered bus during a start on the ground removes its channel; the other channel keeps the FADEC working */
  it('keeps working on one channel when the bus of the other channel is unpowered during a start', () => {
    const groundStart = { ...running, n2Percent: 0, engModeSelNorm: false };
    const channelBBusLost = { ...groundStart, channelBBusPowered: false };
    expect(fadecChannelPower(channelBBusLost)).toEqual({ channelA: true, channelB: false });
    expect(powered(channelBBusLost)).toBe(true);
    expect(powered(channelBBusLost, { channelALost: true, channelBLost: false })).toBe(false);
    expect(powered({ ...groundStart, channelABusPowered: false, channelBBusPowered: false })).toBe(false);
  });
});
