// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlsBeamGeometry } from './FlsBeam';
import { FlsBeamPublisher } from './FlsBeamPublisher';

const beam: FlsBeamGeometry = {
  anchorLocation: { lat: 43.61, long: 1.36 },
  mapToAnchorDistance: 2.9,
  anchorAltitude: 550,
  course: 330,
  slope: 3,
  ident: 'EP33L',
  anchorAtThreshold: false,
  lateral: true,
};

describe('FLS beam publisher', () => {
  const { SetSimVarValue } = SimVar;
  const { getMagVar } = Facilities;
  let writes: [string, string, unknown][];

  beforeEach(() => {
    writes = [];
    SimVar.SetSimVarValue = (name: string, unit: string, value: unknown) => {
      writes.push([name, unit, value]);
      return Promise.resolve();
    };
    Facilities.getMagVar = () => 2;
  });

  afterEach(() => {
    SimVar.SetSimVarValue = SetSimVarValue;
    Facilities.getMagVar = getMagVar;
  });

  it('writes the beam in descent and approach', () => {
    const publisher = new FlsBeamPublisher();
    publisher.publish(beam, FmgcFlightPhase.Descent);
    expect(writes).toEqual([
      ['L:A32NX_FM_FLS_ANCHOR_LAT', 'number', 43.61],
      ['L:A32NX_FM_FLS_ANCHOR_LON', 'number', 1.36],
      ['L:A32NX_FM_FLS_ANCHOR_ALT', 'number', 550],
      ['L:A32NX_FM_FLS_COURSE', 'number', 330],
      ['L:A32NX_FM_FLS_SLOPE', 'number', 3],
      ['L:A32NX_FM_FLS_LATERAL', 'bool', true],
      ['L:A32NX_FM_FLS_BEAM_VALID', 'bool', true],
    ]);
    writes = [];
    publisher.publish({ ...beam, lateral: false }, FmgcFlightPhase.Approach);
    expect(writes).toContainEqual(['L:A32NX_FM_FLS_LATERAL', 'bool', false]);
    expect(writes).toContainEqual(['L:A32NX_FM_FLS_BEAM_VALID', 'bool', true]);
  });

  it('writes only on a change', () => {
    const publisher = new FlsBeamPublisher();
    publisher.publish(beam, FmgcFlightPhase.Approach);
    writes = [];
    publisher.publish({ ...beam, ident: 'LFBO33L', mapToAnchorDistance: 3 }, FmgcFlightPhase.Approach);
    publisher.publish(null, FmgcFlightPhase.Approach);
    publisher.publish(null, FmgcFlightPhase.Cruise);
    expect(writes).toEqual([
      ['L:A32NX_FM_FLS_BEAM_VALID', 'bool', false],
      ['L:A32NX_FM_FLS_LATERAL', 'bool', false],
    ]);
  });

  it('is invalid without a beam or outside descent and approach', () => {
    for (const phase of [
      FmgcFlightPhase.Preflight,
      FmgcFlightPhase.Climb,
      FmgcFlightPhase.Cruise,
      FmgcFlightPhase.GoAround,
    ]) {
      writes = [];
      new FlsBeamPublisher().publish(beam, phase);
      expect(writes).toEqual([
        ['L:A32NX_FM_FLS_BEAM_VALID', 'bool', false],
        ['L:A32NX_FM_FLS_LATERAL', 'bool', false],
      ]);
    }
    writes = [];
    new FlsBeamPublisher().publish(null, FmgcFlightPhase.Approach);
    expect(writes).toContainEqual(['L:A32NX_FM_FLS_BEAM_VALID', 'bool', false]);
  });

  it('gives the LS course the magnetic FLS course when the F-LOC replaces the localizer', () => {
    const publisher = new FlsBeamPublisher();
    expect(publisher.lsCourse(-1)).toBe(-1);
    publisher.publish(beam, FmgcFlightPhase.Approach);
    expect(publisher.lsCourse(-1)).toBe(328);
    publisher.publish({ ...beam, lateral: false }, FmgcFlightPhase.Approach);
    expect(publisher.lsCourse(147)).toBe(147);
    publisher.publish(beam, FmgcFlightPhase.Cruise);
    expect(publisher.lsCourse(147)).toBe(147);
  });
});
