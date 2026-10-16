// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { LOUDSPEAKER_INITIAL_VOLUME_PERCENT, loudspeakerComVolume, loudspeakerVolumeVar } from './LoudspeakerVolume';

const glareshieldXml = resolve(
  __dirname,
  '../../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire/Part_Interior_Cockpit/model/behaviour/glareshield.xml',
);

/* A380 FCOM DSC-23-20 LOUDSPEAKER VOLUME CONTROL PANEL (a380_fcom.txt l.49203-49222) */
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

  it('scales the COM receive volumes of the active AMU side only (not the FWS and SURV sounds)', () => {
    const simAudioManager = readFileSync(resolve(__dirname, './SimAudioManager.ts'), 'utf-8');
    expect(simAudioManager).toContain('loudspeakerVolumeVar(this.activeAmuIndex)');
    expect(simAudioManager).toContain('loudspeakerComVolume(activeAmu.getComVolume(index), loudspeakerVolume)');
  });

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
