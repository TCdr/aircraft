// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The CALLS EMER pushbutton lights and the ELT pushbuttons of the overhead panel (A320_NEO_INTERIOR.xml), run with
// RpnTestInterpreter.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runRpn, RpnVariables } from './RpnTestInterpreter';

const INTERIOR_XML = join(
  __dirname,
  '..',
  'base',
  'flybywire-aircraft-a320-neo',
  'SimObjects',
  'AirPlanes',
  'FlyByWire_A320_NEO',
  'model',
  'A320_NEO_INTERIOR.xml',
);
const interior = readFileSync(INTERIOR_XML, 'utf8');

/** The FBW_Anim_Interactions block of a node */
function interactionBlock(node: string): string {
  const block = new RegExp(
    `<UseTemplate Name="FBW_Anim_Interactions">((?:(?!</UseTemplate>)[\\s\\S])*?<NODE_ID>${node}</NODE_ID>(?:(?!</UseTemplate>)[\\s\\S])*)</UseTemplate>`,
  ).exec(interior);
  if (!block) {
    throw new Error(`interaction of ${node} not found`);
  }
  return block[1].replace(/<!--[\s\S]*?-->/g, ' ');
}

function parameter(block: string, tag: string): string | undefined {
  return new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)?.[1];
}

/** Presses and releases a FBW_Push_Held button as the template does (A32NX_Interior_Generics.xml FBW_Push_Held) */
function pressCode(block: string): string {
  return parameter(block, 'LEFT_SINGLE_CODE') ?? `1 (>${parameter(block, 'HOLD_SIMVAR')})`;
}
function releaseCode(block: string): string {
  if (parameter(block, 'LEFT_SINGLE_CODE') !== undefined) {
    return parameter(block, 'LEFT_LEAVE_CODE') ?? '';
  }
  return parameter(block, 'LEFT_LEAVE_CODE') ?? `0 (>${parameter(block, 'HOLD_SIMVAR')})`;
}

/** Runs code and returns the state with its writes */
function after(code: string, state: RpnVariables): RpnVariables {
  const next = { ...state };
  for (const write of runRpn(code, state).writes) {
    next[write.target] = write.value;
  }
  return next;
}

const lit = (code: string, state: RpnVariables): boolean => (runRpn(code, state).value ?? 0) > 0;

/*
 * CALLS EMER pb-sw: an emergency call lights the white ON light and the amber CALL light of the cockpit CALLS panel.
 * Only a call from the cabin to the cockpit flashes the CALL light.
 */
describe('CALLS EMER pushbutton lights', () => {
  const emer = interactionBlock('PUSH_OVHD_CALLS_EMER');
  const seq1 = parameter(emer, 'SEQ1_CODE') ?? '0';
  const seq2 = parameter(emer, 'SEQ2_CODE') ?? '0';

  it('ON and CALL are steady while the emergency call from the cockpit is on', () => {
    for (const time of [100, 100.1, 100.3, 100.5, 100.9, 101.2]) {
      const state = { 'L:A32NX_CALLS_EMER_ON': 1, 'E:ABSOLUTE TIME': time };
      expect(lit(seq1, state)).toBe(true);
      expect(lit(seq2, state)).toBe(true);
    }
  });

  it('both are off without a call', () => {
    expect(lit(seq1, { 'E:ABSOLUTE TIME': 100.5 })).toBe(false);
    expect(lit(seq2, { 'E:ABSOLUTE TIME': 100.5 })).toBe(false);
  });
});

/*
 * ELT: ON makes the emergency locator transmitter send its emergency signal; TEST/RESET starts the autotest, and resets
 * the ELT to stop a transmission. The ON TEST and ELT lights come on amber while the signal is transmitted or during
 * the autotest.
 */
describe('ELT pushbuttons and light', () => {
  const eltOn = interactionBlock('PUSH_OVHD_ELT_ON');
  const eltTest = interactionBlock('PUSH_OVHD_ELT_TEST');
  const lightBlock = /<Component ID="ELT">([\s\S]*?)<\/Component>/.exec(interior)?.[1] ?? '';
  const lightCode = parameter(lightBlock, 'EMISSIVE_CODE') ?? '0';
  /** ELT armed (not transmitting), annunciator light switch at BRT, AC BUS 1 powered */
  const armed: RpnVariables = { 'L:A32NX_OVHD_INTLT_ANN': 1, 'L:A32NX_ELEC_AC_1_BUS_IS_POWERED': 1 };

  it('the light is off while the ELT is armed', () => {
    expect(lit(lightCode, armed)).toBe(false);
  });

  it('the light follows the annunciator light test', () => {
    expect(lit(lightCode, { ...armed, 'L:A32NX_OVHD_INTLT_ANN': 0 })).toBe(true);
  });

  it('ON makes the ELT transmit and lights the light', () => {
    const transmitting = after(releaseCode(eltOn), after(pressCode(eltOn), armed));
    expect(transmitting['L:A32NX_ELT_ON']).toBe(1);
    expect(lit(lightCode, transmitting)).toBe(true);
  });

  it('TEST/RESET stops the transmission; the light is on during the autotest and goes off after it', () => {
    const transmitting = after(pressCode(eltOn), armed);
    const testing = after(pressCode(eltTest), transmitting);
    expect(testing['L:A32NX_ELT_ON']).toBe(0);
    expect(lit(lightCode, testing)).toBe(true);

    const reset = after(releaseCode(eltTest), testing);
    expect(lit(lightCode, reset)).toBe(false);
  });

  it('TEST/RESET from armed runs the autotest: the light is on only during it', () => {
    const testing = after(pressCode(eltTest), armed);
    expect(lit(lightCode, testing)).toBe(true);
    expect(lit(lightCode, after(releaseCode(eltTest), testing))).toBe(false);
  });

  it('the pushbuttons are no longer marked inop', () => {
    expect(eltOn).not.toContain('Inop.');
    expect(eltTest).not.toContain('Inop.');
  });
});
