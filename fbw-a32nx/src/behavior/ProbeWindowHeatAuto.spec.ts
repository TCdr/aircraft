// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The MSFS PITOT HEAT and WINDSHIELD DEICE switches driven by the PROBE/WINDOW HEAT logic of the A32NX
// (src/A32NX_Interior_Misc.xml template FBW_Airbus_Probes_Window_Heat), run with RpnTestInterpreter.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn, RpnVariables } from './RpnTestInterpreter';

const misc = readFileSync(join(__dirname, 'src', 'A32NX_Interior_Misc.xml'), 'utf8');

/** The UPDATE_CODE of the probes and window heat template */
function updateCode(): string {
  const template = /<Template Name="FBW_Airbus_Probes_Window_Heat">([\s\S]*?)<\/Template>/.exec(misc)?.[1];
  const code = template && /<UPDATE_CODE>([\s\S]*?)<\/UPDATE_CODE>/.exec(template)?.[1];
  if (!code) {
    throw new Error('FBW_Airbus_Probes_Window_Heat UPDATE_CODE not found');
  }
  return code;
}

/** The key events the code sends */
const events = (state: RpnVariables): string[] =>
  runRpn(updateCode(), state)
    .writes.map((write) => write.target)
    .filter((target) => target.startsWith('K:'));

/** Engines stopped, PROBE/WINDOW HEAT pb AUTO, MSFS heat switches off */
const ENGINES_STOPPED: RpnVariables = { 'A:SIM ON GROUND': 1 };

/*
 * A320 FCOM DSC-30-40-10 (a320_fcom.txt l.44440-44442): "Window heating comes on: automatically when at least one engine
 * is running, or when the aircraft is in flight"; DSC-30-50-10 (l.44524-44526): "The probes are heated: Automatically
 * when at least one engine is running, or when the aircraft is in flight. Manually, when the flight crew switches ON the
 * PROBE/WINDOW HEAT pb." Before, the in flight term was missing (an all engines out glide switched the heat off).
 */
describe('PROBE/WINDOW HEAT automatic heating (MSFS PITOT HEAT, WINDSHIELD DEICE)', () => {
  it('stays off on ground with the engines stopped and the pb AUTO', () => {
    expect(events(ENGINES_STOPPED)).toEqual([]);
  });

  it('comes on with an engine running', () => {
    expect(events({ ...ENGINES_STOPPED, 'A:ENG COMBUSTION:2': 1 })).toEqual([
      'K:PITOT_HEAT_ON',
      'K:WINDSHIELD_DEICE_ON',
    ]);
  });

  it('comes on with the pb ON', () => {
    expect(events({ ...ENGINES_STOPPED, 'L:A32NX_MAN_PITOT_HEAT': 1 })).toEqual([
      'K:PITOT_HEAT_ON',
      'K:WINDSHIELD_DEICE_ON',
    ]);
  });

  it('comes on in flight with both engines stopped, and stays on', () => {
    const inFlight: RpnVariables = { 'A:SIM ON GROUND': 0 };
    expect(events(inFlight)).toEqual(['K:PITOT_HEAT_ON', 'K:WINDSHIELD_DEICE_ON']);
    expect(events({ ...inFlight, 'A:PITOT HEAT': 1, 'A:WINDSHIELD DEICE SWITCH': 1 })).toEqual([]);
  });

  it('goes off on ground once the engines are stopped', () => {
    expect(events({ ...ENGINES_STOPPED, 'A:PITOT HEAT': 1, 'A:WINDSHIELD DEICE SWITCH': 1 })).toEqual([
      'K:PITOT_HEAT_OFF',
      'K:WINDSHIELD_DEICE_OFF',
    ]);
  });
});
