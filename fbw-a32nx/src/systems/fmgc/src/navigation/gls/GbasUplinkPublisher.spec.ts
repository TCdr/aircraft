// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimVarString } from '@flybywiresim/fbw-sdk';
import { GlsApproachData } from './GlsApproachData';
import { GbasUplinkPublisher } from './GbasUplinkPublisher';

const frankfurt25C: GlsApproachData = {
  channel: 31434,
  rpi: 'G25P',
  course: 246,
  slope: -3,
  definition: {
    channel: 31434,
    rpi: 'G25P',
    thresholdLocation: { lat: 50.0285, long: 8.5361 },
    thresholdElevation: 328,
    runwayLength: 4000,
    courseTrue: 249.2,
    gpa: 3,
    tch: 50,
  },
};

const unknownChannel: GlsApproachData = {
  channel: 20002,
  rpi: null,
  course: null,
  slope: null,
  definition: null,
};

describe('GBAS uplink publisher', () => {
  const { SetSimVarValue } = SimVar;
  let writes: [string, string, unknown][];

  beforeEach(() => {
    writes = [];
    SimVar.SetSimVarValue = (name: string, unit: string, value: unknown) => {
      writes.push([name, unit, value]);
      return Promise.resolve();
    };
  });

  afterEach(() => {
    SimVar.SetSimVarValue = SetSimVarValue;
  });

  it('writes the channel of each MMR and the approach path data of the GLS', () => {
    new GbasUplinkPublisher().publish(frankfurt25C, frankfurt25C);

    expect(writes).toEqual([
      ['L:A32NX_MMR_1_GLS_CHANNEL', 'number', 31434],
      ['L:A32NX_MMR_2_GLS_CHANNEL', 'number', 31434],
      ['L:A32NX_GBAS_VALID', 'bool', false],
      ['L:A32NX_GBAS_CHANNEL', 'number', 31434],
      ['L:A32NX_GBAS_LTP_LAT', 'number', 50.0285],
      ['L:A32NX_GBAS_LTP_LON', 'number', 8.5361],
      ['L:A32NX_GBAS_LTP_ALT', 'number', 328],
      ['L:A32NX_GBAS_LENGTH', 'number', 4000],
      ['L:A32NX_GBAS_COURSE', 'number', 249.2],
      ['L:A32NX_GBAS_GPA', 'number', 3],
      ['L:A32NX_GBAS_TCH', 'number', 50],
      ['L:A32NX_GBAS_IDENT', 'number', SimVarString.pack('G25P', 4)[0]],
      ['L:A32NX_GBAS_VALID', 'bool', true],
    ]);
  });

  it('takes the uplink invalid while one procedure replaces another, so that no mix of the two is ever valid', () => {
    const frankfurt25CSteep: GlsApproachData = {
      channel: 28968,
      rpi: 'G25M',
      course: 246,
      slope: -3.2,
      definition: { ...frankfurt25C.definition!, channel: 28968, rpi: 'G25M', gpa: 3.2 },
    };
    const publisher = new GbasUplinkPublisher();
    publisher.publish(frankfurt25C, frankfurt25C);
    writes.length = 0;

    publisher.publish(frankfurt25CSteep, frankfurt25CSteep);

    const uplinkWrites = writes.filter(([name]) => name.startsWith('L:A32NX_GBAS_'));
    expect(uplinkWrites[0]).toEqual(['L:A32NX_GBAS_VALID', 'bool', false]);
    expect(uplinkWrites[uplinkWrites.length - 1]).toEqual(['L:A32NX_GBAS_VALID', 'bool', true]);
    expect(uplinkWrites.filter(([name]) => name === 'L:A32NX_GBAS_VALID')).toHaveLength(2);
    expect(uplinkWrites).toContainEqual(['L:A32NX_GBAS_GPA', 'number', 3.2]);
  });

  it('packs the identifier so that it reads back', () => {
    new GbasUplinkPublisher().publish(frankfurt25C, undefined);

    const identWrite = writes.find(([name]) => name === 'L:A32NX_GBAS_IDENT');
    expect(SimVarString.unpack([identWrite![2] as number])).toBe('G25P');
  });

  it('writes nothing again while nothing changes', () => {
    const publisher = new GbasUplinkPublisher();
    publisher.publish(frankfurt25C, frankfurt25C);
    writes.length = 0;

    publisher.publish(frankfurt25C, frankfurt25C);

    expect(writes).toEqual([]);
  });

  it('starts with an invalid uplink and both MMRs in ILS mode', () => {
    const publisher = new GbasUplinkPublisher();

    publisher.publish(undefined, undefined);

    expect(writes).toEqual([
      ['L:A32NX_MMR_1_GLS_CHANNEL', 'number', 0],
      ['L:A32NX_MMR_2_GLS_CHANNEL', 'number', 0],
      ['L:A32NX_GBAS_VALID', 'bool', false],
    ]);
  });

  it('invalidates the uplink when the GLS goes away, and writes the channel back to ILS mode', () => {
    const publisher = new GbasUplinkPublisher();
    publisher.publish(frankfurt25C, undefined);
    writes.length = 0;

    publisher.publish(undefined, undefined);

    expect(writes).toEqual([
      ['L:A32NX_MMR_1_GLS_CHANNEL', 'number', 0],
      ['L:A32NX_GBAS_VALID', 'bool', false],
    ]);
  });

  it('uplinks the data of the other MMR, and no data for a channel that nothing serves', () => {
    const publisher = new GbasUplinkPublisher();

    publisher.publish(unknownChannel, frankfurt25C);
    expect(writes).toContainEqual(['L:A32NX_GBAS_CHANNEL', 'number', 31434]);

    writes.length = 0;
    publisher.publish(unknownChannel, unknownChannel);
    expect(writes).toEqual([
      ['L:A32NX_MMR_2_GLS_CHANNEL', 'number', 20002],
      ['L:A32NX_GBAS_VALID', 'bool', false],
    ]);
  });
});
