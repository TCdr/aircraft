// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FeatureType } from '@flybywiresim/fbw-sdk';
import { describe, expect, it } from 'vitest';
import { Position } from 'geojson';
import { OancPositionComputer } from './OancPositionComputer';

/** A taxiway element feature that counts how often the computer looks at its geometry */
function taxiway(ident: string, minX: number, maxX: number) {
  const counter = { geometryReads: 0 };
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [minX, 0],
        [maxX, 0],
        [maxX, 10],
        [minX, 10],
        [minX, 0],
      ],
    ],
  };
  const feature = {
    properties: { feattype: FeatureType.TaxiwayElement, idlin: ident },
    get geometry() {
      counter.geometryReads++;
      return geometry;
    },
  };
  return { feature, counter };
}

function createMap() {
  const a = taxiway('A', 0, 10);
  const b = taxiway('B', 20, 30);
  return { data: { features: [a.feature, b.feature] }, scans: () => a.counter.geometryReads };
}

function createComputer(map: { data: unknown } | undefined, ppos: { value: Position }) {
  const oanc = { data: map?.data, projectedPpos: { get: () => ppos.value } };
  return { oanc, computer: new OancPositionComputer(oanc as never) };
}

describe('OancPositionComputer', () => {
  it('names the taxiway the aircraft is on', () => {
    const { computer } = createComputer(createMap(), { value: [5, 5] });

    expect(computer.computePosition()).toBe('A');
  });

  it('does not scan the map again for an unchanged position', () => {
    const map = createMap();
    const { computer } = createComputer(map, { value: [25, 5] });

    expect(computer.computePosition()).toBe('B');
    const scansAfterFirst = map.scans();
    expect(computer.computePosition()).toBe('B');
    expect(computer.computePosition()).toBe('B');

    expect(map.scans()).toBe(scansAfterFirst);
  });

  it('remembers that no feature was found', () => {
    const map = createMap();
    const { computer } = createComputer(map, { value: [15, 5] });

    expect(computer.computePosition()).toBeUndefined();
    const scansAfterFirst = map.scans();
    expect(computer.computePosition()).toBeUndefined();

    expect(map.scans()).toBe(scansAfterFirst);
  });

  it('scans again after the aircraft moved', () => {
    const map = createMap();
    const ppos = { value: [5, 5] as Position };
    const { computer } = createComputer(map, ppos);
    expect(computer.computePosition()).toBe('A');
    const scansAfterFirst = map.scans();

    ppos.value = [25, 5];

    expect(computer.computePosition()).toBe('B');
    expect(map.scans()).toBeGreaterThan(scansAfterFirst);
  });

  it('scans again after a new map was loaded', () => {
    const ppos = { value: [5, 5] as Position };
    const { oanc, computer } = createComputer(createMap(), ppos);
    expect(computer.computePosition()).toBe('A');

    const other = taxiway('Z', 0, 10);
    oanc.data = { features: [other.feature] };

    expect(computer.computePosition()).toBe('Z');
  });

  it('answers nothing without a map, and scans again once one is loaded', () => {
    const ppos = { value: [5, 5] as Position };
    const map = createMap();
    const { oanc, computer } = createComputer(map, ppos);
    expect(computer.computePosition()).toBe('A');

    oanc.data = undefined;
    expect(computer.computePosition()).toBeUndefined();

    oanc.data = map.data;
    expect(computer.computePosition()).toBe('A');
  });
});
