// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { GPUManagement, shouldConnectOnSimExtPowerChange, shouldDisconnectOnSimExtPowerChange } from './GPUManagement';

describe('shouldConnectOnSimExtPowerChange', () => {
  it('connects when the sim external power becomes available (GSX 4 GPU, sim GPU or jetway), without the door', () => {
    expect(shouldConnectOnSimExtPowerChange(false, true, false, 0)).toBe(true);
  });

  it('does nothing when the FBW external power is already available', () => {
    expect(shouldConnectOnSimExtPowerChange(false, true, true, 0)).toBe(false);
  });

  it('keeps the flyPad GPU button disconnection while the sim external power stays available', () => {
    // power was and is available: no change, the crew disconnected it on purpose
    expect(shouldConnectOnSimExtPowerChange(true, true, false, 0)).toBe(false);
  });

  it('does not connect when the sim external power goes away or stays away', () => {
    expect(shouldConnectOnSimExtPowerChange(true, false, false, 0)).toBe(false);
    expect(shouldConnectOnSimExtPowerChange(false, false, false, 0)).toBe(false);
  });

  it('does not connect while the aircraft moves (above 0.3 kt, where the GPU is disconnected)', () => {
    expect(shouldConnectOnSimExtPowerChange(false, true, false, 0.3)).toBe(true);
    expect(shouldConnectOnSimExtPowerChange(false, true, false, 0.31)).toBe(false);
  });
});

describe('shouldDisconnectOnSimExtPowerChange', () => {
  it('disconnects when the sim external power goes away (GSX GPU removed, jetway retracted, sim GPU off)', () => {
    expect(shouldDisconnectOnSimExtPowerChange(true, false, true, true)).toBe(true);
  });

  it('keeps an external power that was not connected from the sim power', () => {
    expect(shouldDisconnectOnSimExtPowerChange(true, false, true, false)).toBe(false);
  });

  it('does nothing while the sim power stays, comes back, or the FBW power is already off', () => {
    expect(shouldDisconnectOnSimExtPowerChange(true, true, true, true)).toBe(false);
    expect(shouldDisconnectOnSimExtPowerChange(false, true, true, true)).toBe(false);
    expect(shouldDisconnectOnSimExtPowerChange(false, false, true, true)).toBe(false);
    expect(shouldDisconnectOnSimExtPowerChange(true, false, false, true)).toBe(false);
  });
});

describe('GPUManagement sim external power change', () => {
  /** The state onSimExtPowerChanged reads, without the sim (the class needs the game state to be built) */
  function fakeGpuManagement(simWasAvailable: boolean, simIsAvailable: boolean, connectedBySimPower: boolean) {
    return {
      simExtPowerWasAvailable: simWasAvailable,
      extPowerConnectedBySimPower: connectedBySimPower,
      anyMSFSGPUAvail: () => simIsAvailable,
      anyGPUAvail: () => true,
      groundVelocity: { get: () => 0 },
      setEXTpower: vi.fn(),
    };
  }

  const onSimExtPowerChanged = (GPUManagement.prototype as any).onSimExtPowerChanged as (this: unknown) => void;

  it('disconnects the external power the sim power connected when the sim power goes away', () => {
    const gpu = fakeGpuManagement(true, false, true);
    onSimExtPowerChanged.call(gpu);
    expect(gpu.setEXTpower).toHaveBeenCalledWith(false);
  });

  it('keeps the external power the crew connected without the sim power', () => {
    const gpu = fakeGpuManagement(true, false, false);
    onSimExtPowerChanged.call(gpu);
    expect(gpu.setEXTpower).not.toHaveBeenCalled();
  });
});
