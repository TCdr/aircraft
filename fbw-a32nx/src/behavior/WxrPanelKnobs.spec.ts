// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The weather radar GAIN and TILT knobs of the A32NX pedestal (A320_NEO_INTERIOR.xml, component WeatherRadar), run with
// RpnTestInterpreter, and the MULTISCAN / GCS switch positions of the flight files.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn } from './RpnTestInterpreter';

const AIRCRAFT = join(
  __dirname,
  '..',
  'base',
  'flybywire-aircraft-a320-neo',
  'SimObjects',
  'AirPlanes',
  'FlyByWire_A320_NEO',
);
const interior = readFileSync(join(AIRCRAFT, 'model', 'A320_NEO_INTERIOR.xml'), 'utf8');

/** One code element of the knob component on this node */
function knobCode(node: string, tag: 'ANIM_CODE' | 'CLOCKWISE_CODE' | 'ANTICLOCKWISE_CODE'): string {
  const component = new RegExp(`<Component ID="${node}" Node="${node}">([\\s\\S]*?)</Component>`).exec(interior);
  if (!component) {
    throw new Error(`knob ${node} not found`);
  }
  const code = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(component[1]);
  if (!code) {
    throw new Error(`${tag} of ${node} not found`);
  }
  return code[1];
}

function turn(node: string, variable: string, tag: 'CLOCKWISE_CODE' | 'ANTICLOCKWISE_CODE', from: number): number {
  const write = runRpn(knobCode(node, tag), { [variable]: from }).writes.find((w) => w.target === variable);
  if (!write) {
    throw new Error(`${node} ${tag} does not set ${variable}`);
  }
  return write.value;
}

function animation(node: string, variable: string, value: number): number | undefined {
  return runRpn(knobCode(node, 'ANIM_CODE'), { [variable]: value }).value;
}

const GAIN = 'L:A32NX_WXR_GAIN_KNOB';
const TILT = 'L:A32NX_WXR_TILT_KNOB';

/*
 * A320 FCOM DSC-34-SURV-30-30 CONTROL PANEL (a320_fcom.txt l.54368-54420): the GAIN knob with CAL as its normal
 * position, the TILT knob for the MULTISCAN MAN mode. Before, both knobs were inert.
 */
describe('A32NX weather radar GAIN knob', () => {
  it('CAL (0) is in the middle of its travel, MIN at one end, MAX at the other', () => {
    expect(animation('KNOB_RADAR_GAIN', GAIN, 0)).toBe(50);
    expect(animation('KNOB_RADAR_GAIN', GAIN, -1)).toBe(0);
    expect(animation('KNOB_RADAR_GAIN', GAIN, 1)).toBe(100);
  });

  it('turns in steps of 0.1 between MIN (-1) and MAX (+1), and comes back exactly to CAL', () => {
    expect(turn('KNOB_RADAR_GAIN', GAIN, 'CLOCKWISE_CODE', 0)).toBe(0.1);
    expect(turn('KNOB_RADAR_GAIN', GAIN, 'CLOCKWISE_CODE', 0.95)).toBe(1);
    expect(turn('KNOB_RADAR_GAIN', GAIN, 'ANTICLOCKWISE_CODE', -0.95)).toBe(-1);
    let knob = 0;
    for (let i = 0; i < 3; i++) {
      knob = turn('KNOB_RADAR_GAIN', GAIN, 'CLOCKWISE_CODE', knob);
    }
    for (let i = 0; i < 3; i++) {
      knob = turn('KNOB_RADAR_GAIN', GAIN, 'ANTICLOCKWISE_CODE', knob);
    }
    expect(knob).toBe(0);
  });
});

describe('A32NX weather radar TILT knob', () => {
  it('zero tilt is in the middle of its travel, -15 and +15 degrees at the ends', () => {
    expect(animation('KNOB_RADAR_TILT', TILT, 0)).toBe(50);
    expect(animation('KNOB_RADAR_TILT', TILT, -15)).toBe(0);
    expect(animation('KNOB_RADAR_TILT', TILT, 15)).toBe(100);
  });

  it('turns in quarters of a degree (l.54789-54790), within -15 .. +15', () => {
    expect(turn('KNOB_RADAR_TILT', TILT, 'CLOCKWISE_CODE', 0)).toBe(0.25);
    expect(turn('KNOB_RADAR_TILT', TILT, 'ANTICLOCKWISE_CODE', 0)).toBe(-0.25);
    expect(turn('KNOB_RADAR_TILT', TILT, 'CLOCKWISE_CODE', 14.9)).toBe(15);
    expect(turn('KNOB_RADAR_TILT', TILT, 'ANTICLOCKWISE_CODE', -14.9)).toBe(-15);
  });
});

describe('A32NX MULTISCAN switch', () => {
  it('is no longer marked inoperative (it drives the ND radar rows)', () => {
    expect(interior).toContain('<ANIMTIP_0>Set Multiscan to AUTO</ANIMTIP_0>');
    expect(interior).not.toContain('Set Multiscans to AUTO (Inop.)');
  });

  it('the flight files start with MULTISCAN and GCS at AUTO, the normal positions', () => {
    for (const flight of ['hangar.flt', 'taxi.flt', 'Climb.flt']) {
      const flt = readFileSync(join(AIRCRAFT, flight), 'utf8');
      expect(flt).toMatch(/A32NX_RADAR_MULTISCAN_AUTO ?= ?1/);
      expect(flt).toMatch(/A32NX_RADAR_GCS_AUTO ?= ?1/);
    }
  });
});
