// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { isSlatFlapControlLost, slatFlapIndication, SlatFlapIndicationInputs } from './SlatFlapIndication';

const normal: SlatFlapIndicationInputs = {
  sfccInvalid: false,
  wingtipBrakesOn: false,
  controlLost: false,
  bothHydraulicSystemsLost: false,
  onGroundEnginesStopped: false,
};

/* A320 FCOM DSC-27-50 FLAPS/SLATS INDICATION ON E/WD (a320_fcom.txt l.41606-41627) */
describe('E/WD S and F legends, slat and flap positions', () => {
  it('are white / green with a valid SFCC, pressurised hydraulics and no wingtip brake', () => {
    expect(slatFlapIndication(normal)).toEqual({ amber: false, locked: false });
  });

  it('turn amber when both relevant hydraulic systems fail', () => {
    expect(slatFlapIndication({ ...normal, bothHydraulicSystemsLost: true }).amber).toBe(true);
  });

  it('stay white with both hydraulic systems unpressurised on ground with both engines stopped', () => {
    expect(slatFlapIndication({ ...normal, bothHydraulicSystemsLost: true, onGroundEnginesStopped: true }).amber).toBe(
      false,
    );
  });

  it('turn amber with the S (F) LOCKED legend when the wingtip brakes are on', () => {
    expect(slatFlapIndication({ ...normal, wingtipBrakesOn: true })).toEqual({ amber: true, locked: true });
  });

  it('turn amber on a slats (flaps) fault, without the LOCKED legend', () => {
    expect(slatFlapIndication({ ...normal, controlLost: true })).toEqual({ amber: true, locked: false });
  });

  it('stay amber without a LOCKED legend when the SFCC data are invalid', () => {
    expect(slatFlapIndication({ ...normal, sfccInvalid: true, wingtipBrakesOn: true })).toEqual({
      amber: true,
      locked: false,
    });
  });
});

describe('E/WD slats (flaps) fault', () => {
  it('is the loss of both SFCC channels only', () => {
    expect(isSlatFlapControlLost(true, true)).toBe(true);
    expect(isSlatFlapControlLost(true, false)).toBe(false);
    expect(isSlatFlapControlLost(false, true)).toBe(false);
  });
});

describe('E/WD slat / flap indication wiring', () => {
  const component = readFileSync(resolve(__dirname, 'Slats.tsx'), 'utf-8');

  it('colours S, F and the positions from the indication, and draws S LOCKED and F LOCKED', () => {
    expect(component).toContain('Amber: this.slatsAmber');
    expect(component).toContain('Amber: this.flapsAmber');
    expect(component).toContain('AmberStroke: this.slatsAmber');
    expect(component).toContain('AmberStroke: this.flapsAmber');
    expect(component).toContain('S LOCKED');
    expect(component).toContain('F LOCKED');
  });

  it('uses the green and blue systems for the slats, the green and yellow systems for the flaps (l.41402)', () => {
    expect(component).toContain('!this.greenHydPressurised && !this.blueHydPressurised');
    expect(component).toContain('!this.greenHydPressurised && !this.yellowHydPressurised');
  });
});
