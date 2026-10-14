// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The cockpit door locking system (CDLS) lights: the COCKPIT DOOR FAULT light of the pedestal (ModelBehaviorDefs
// A32NX/Airbus.xml template A32NX_PUSH_DOORPANEL_OPEN) and the CKPT DOOR CONT status lights of the overhead panel
// (A320_NEO_INTERIOR.xml component CKPT_DOOR_CONT), run with RpnTestInterpreter.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn, RpnVariables } from './RpnTestInterpreter';

const PACKAGE = join(__dirname, '..', 'base', 'flybywire-aircraft-a320-neo');
const airbus = readFileSync(join(PACKAGE, 'ModelBehaviorDefs', 'A32NX', 'Airbus.xml'), 'utf8');
const interior = readFileSync(
  join(PACKAGE, 'SimObjects', 'AirPlanes', 'FlyByWire_A320_NEO', 'model', 'A320_NEO_INTERIOR.xml'),
  'utf8',
);

/** A parameter of a block */
function parameter(block: string, tag: string): string {
  const value = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)?.[1];
  if (value === undefined) {
    throw new Error(`${tag} not found`);
  }
  return value;
}

/** The FAULT light code of the pedestal COCKPIT DOOR indicator, with the parameters of its use in the interior */
function pedestalFaultLight(): string {
  const template = /<Template Name="A32NX_PUSH_DOORPANEL_OPEN">([\s\S]*?)<\/Template>/.exec(airbus)?.[1] ?? '';
  const panel = /<Component ID="DOOR_PANEL">([\s\S]*?)<\/Component>/.exec(interior)?.[1] ?? '';
  return parameter(template, 'SEQ2_EMISSIVE_CODE')
    .replace('#SEQ2_POWERED#', parameter(panel, 'SEQ2_POWERED'))
    .replace('#EMISSIVE_DIM#', parameter(template, 'EMISSIVE_DIM'));
}

/** The status light code of an overhead CKPT DOOR CONT node */
function overheadLight(node: string): string {
  const panel = /<Component ID="CKPT_DOOR_CONT">([\s\S]*?)<\/Component>/.exec(interior)?.[1] ?? '';
  const light = new RegExp(`<NODE_ID>${node}</NODE_ID>((?:(?!</UseTemplate>)[\\s\\S])*)</UseTemplate>`).exec(
    panel,
  )?.[1];
  if (!light) {
    throw new Error(`${node} not found`);
  }
  return parameter(light, 'EMISSIVE_CODE');
}

const lit = (code: string, state: RpnVariables): boolean => (runRpn(code, state).value ?? 0) > 0;

/** Powered cockpit, annunciator light switch at BRT, door closed, no CDLS failure */
const NORMAL: RpnVariables = {
  'L:A32NX_OVHD_INTLT_ANN': 1,
  'L:A32NX_ELEC_AC_2_BUS_IS_POWERED': 1,
  'L:A32NX_ELEC_DC_2_BUS_IS_POWERED': 1,
  'L:A32NX_COCKPIT_DOOR_LOCKED': 1,
};

/*
 * A320 FCOM DSC-52-40-20 (a320_fcom.txt l.61654-61687): pedestal "FAULT: This light comes on when a system failure has
 * been identified (Example: Latch, pressure sensors, control unit)"; overhead "Strikes' status lights ... On: The
 * corresponding (upper, mid, or lower) locking latch is faulty", "Pressure sensor status lights ... On: The corresponding
 * (1 or 2) pressure sensor is faulty". Before, they only came on with the annunciator light test.
 */
describe('COCKPIT DOOR FAULT light (pedestal)', () => {
  it('is off without a CDLS failure, on in the annunciator light test', () => {
    expect(lit(pedestalFaultLight(), NORMAL)).toBe(false);
    expect(lit(pedestalFaultLight(), { ...NORMAL, 'L:A32NX_OVHD_INTLT_ANN': 0 })).toBe(true);
  });

  it('comes on with a CDLS failure (latch, pressure sensor or control unit)', () => {
    expect(lit(pedestalFaultLight(), { ...NORMAL, 'L:A32NX_CDLS_FAULT': 1 })).toBe(true);
  });

  it('stays dark without AC 2 power', () => {
    expect(
      lit(pedestalFaultLight(), { ...NORMAL, 'L:A32NX_CDLS_FAULT': 1, 'L:A32NX_ELEC_AC_2_BUS_IS_POWERED': 0 }),
    ).toBe(false);
  });
});

describe('CKPT DOOR CONT status lights (overhead)', () => {
  it.each([
    ['PUSH_OVHD_CKPTDOOR_TOP', 'L:A32NX_CDLS_UPPER_LATCH_FAULT'],
    ['PUSH_OVHD_CKPTDOOR_MID', 'L:A32NX_CDLS_MID_LATCH_FAULT'],
    ['PUSH_OVHD_CKPTDOOR_BOT', 'L:A32NX_CDLS_LOWER_LATCH_FAULT'],
    ['PUSH_OVHD_CKPTDOOR_CHAN1', 'L:A32NX_CDLS_PRESSURE_SENSOR_1_FAULT'],
    ['PUSH_OVHD_CKPTDOOR_CHAN2', 'L:A32NX_CDLS_PRESSURE_SENSOR_2_FAULT'],
  ])('%s comes on with %s only, and in the light test', (node, fault) => {
    const code = overheadLight(node);
    expect(lit(code, NORMAL)).toBe(false);
    expect(lit(code, { ...NORMAL, [fault]: 1 })).toBe(true);
    expect(lit(code, { ...NORMAL, 'L:A32NX_OVHD_INTLT_ANN': 0 })).toBe(true);
    expect(lit(code, { ...NORMAL, 'L:A32NX_CDLS_FAULT': 1 })).toBe(false);
  });
});
