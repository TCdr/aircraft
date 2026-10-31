// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus, KeyEventManager } from '@microsoft/msfs-sdk';
import { PilotSeat, PilotSeatEvents } from '@flybywiresim/fbw-sdk';
import { AudioManagementUnit } from './AudioManagementUnit';
import { SimAudioManager } from './SimAudioManager';
import { LOUDSPEAKER_INITIAL_VOLUME_PERCENT, loudspeakerComVolume, loudspeakerVolumeVar } from './LoudspeakerVolume';

const glareshieldXml = resolve(
  __dirname,
  '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/glareshield.xml',
);

describe('A380X loudspeaker volume control knobs', () => {
  it('fully anticlockwise: "The two onside loudspeakers are OFF."', () => {
    expect(loudspeakerComVolume(80, 0)).toBe(0);
  });

  it('"The volume is adjusted by turning the knob."', () => {
    expect(loudspeakerComVolume(80, 50)).toBe(40);
    expect(loudspeakerComVolume(80, 100)).toBe(80);
    expect(loudspeakerComVolume(80, 150)).toBe(80);
    expect(loudspeakerComVolume(80, -10)).toBe(0);
  });

  it('one knob per side, starting at the RMP volume', () => {
    expect(loudspeakerVolumeVar(1)).toBe('L:A380X_LOUDSPEAKER_1_VOLUME');
    expect(loudspeakerVolumeVar(2)).toBe('L:A380X_LOUDSPEAKER_2_VOLUME');
    expect(LOUDSPEAKER_INITIAL_VOLUME_PERCENT).toBe(100);
  });
});

describe('SimAudioManager loudspeaker volume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** An AMU with the given COM volume on the RMP, receiving and transmitting on VHF 1 */
  const fakeAmu = (comVolume: number) =>
    ({
      isHealthy: { get: () => true },
      getActiveNavAudio: () => null,
      isNavOutputOn: () => false,
      isNavVoiceFiltered: () => false,
      getNavVolume: () => 0,
      isComReceiveOn: (index: number) => index === 0,
      getSelectedComTransmitter: () => 0,
      getComVolume: () => comVolume,
    }) as unknown as AudioManagementUnit;

  /** The last volume the sim COM1 volume was set to by the audio manager, with the knobs and the pilot seat as given */
  const com1VolumeSet = async (knobs: Record<number, number>, pilotSeat: PilotSeat): Promise<number | undefined> => {
    const volumes: number[] = [];
    vi.spyOn(KeyEventManager, 'getManager').mockResolvedValue({
      triggerKey: (key: string, _bypass: boolean, value: number) => {
        if (key === 'COM1_VOLUME_SET') {
          volumes.push(value);
        }
        return Promise.resolve();
      },
    } as unknown as KeyEventManager);
    const simVars = new Map<string, number>();
    vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => simVars.get(name) ?? 0);
    vi.spyOn(SimVar, 'SetSimVarValue').mockImplementation((name: string, _unit: string, value: number) => {
      simVars.set(name, value);
      return Promise.resolve();
    });
    const bus = new EventBus();
    // the AMU 1 volume is 80 %, the AMU 2 volume 60 %
    const manager = new SimAudioManager(bus, fakeAmu(80), fakeAmu(60));
    manager.init();
    await Promise.resolve();
    bus.getPublisher<PilotSeatEvents>().pub('pilot_seat', pilotSeat, false, false);
    for (const [side, percent] of Object.entries(knobs)) {
      simVars.set(loudspeakerVolumeVar(Number(side)), percent);
    }
    manager.onUpdate();
    return volumes[volumes.length - 1];
  };

  it('starts the knobs at 100 %, so that the RMP volume is heard unchanged', async () => {
    expect(await com1VolumeSet({}, PilotSeat.Left)).toBe(80);
  });

  it('scales the COM volume of the active AMU by the CAPT knob, and by the F/O knob with the F/O seat', async () => {
    expect(await com1VolumeSet({ 1: 50, 2: 100 }, PilotSeat.Left)).toBe(40);
    expect(await com1VolumeSet({ 1: 100, 2: 50 }, PilotSeat.Right)).toBe(30);
  });

  it('turns the COM voice off with the knob fully anticlockwise', async () => {
    expect(await com1VolumeSet({ 1: 0 }, PilotSeat.Left)).toBe(0);
  });
});

describe('A380X loudspeaker knobs in the cockpit model', () => {
  it('the glareshield knobs turn and drive the volume L:vars', () => {
    const glareshield = readFileSync(glareshieldXml, 'utf-8');
    for (const [node, side] of [
      ['KNOB_GLARESHIELD_CS_SPEAKER', 1],
      ['KNOB_GLARESHIELD_FO_SPEAKER', 2],
    ]) {
      const component = glareshield.slice(glareshield.indexOf(`<Component ID="${node}_VOLUME" Node="${node}">`));
      expect(component.length).toBeLessThan(glareshield.length);
      expect(component).toContain('FBW_Continuous_Knob_Finite_From_Simvar');
      expect(component).toContain(`<ANIM_SIMVAR>L:A380X_LOUDSPEAKER_${side}_VOLUME</ANIM_SIMVAR>`);
    }
  });
});
