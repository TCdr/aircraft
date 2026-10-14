// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The BFO key light of the RMPs (A32NX_Interior_RMP.xml, template FBW_RMP_BFO_BUTTON_AND_LED): the rnp code is
// compiled as build.js does, then the RPN is run by RpnTestInterpreter. Kept outside src/ because build.js copies every
// file of src/.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { translate, Type } from '@flybywiresim/rnp';
import { runRpn, RpnVariables } from './RpnTestInterpreter';

const RMP_BEHAVIOR_XML = join(__dirname, 'src', 'A32NX_Interior_RMP.xml');

type Side = 'L' | 'R';

/**
 * The RPN of the EMISSIVE_CODE of the BFO key light, for one RMP.
 * @param side the RMP
 * @returns the RPN
 */
function bfoLightRpn(side: Side): string {
  const xml = readFileSync(RMP_BEHAVIOR_XML, 'utf8');
  const block = new RegExp(
    '<Template Name="FBW_RMP_BFO_BUTTON_AND_LED">[\\s\\S]*?<EMISSIVE_CODE type="rnp" return="number">([\\s\\S]*?)</EMISSIVE_CODE>',
  ).exec(xml);
  if (!block) {
    throw new Error('BFO light EMISSIVE_CODE not found');
  }
  // (the XML parser of build.js reads CRLF as LF, rnp only takes LF)
  const { messages, output } = translate(block[1].replace(/\r/g, '').replace(/&lt;/g, '<'), {
    specifier: '(inline)',
    returnType: Type.NUMBER,
  });
  const errors = messages.filter((m) => m.level === 'error');
  if (errors.length > 0) {
    throw new Error(`rnp: ${errors.map((m) => `${m.message} ${m.detail}`).join('; ')}`);
  }
  return output
    .replace(/#SIDE#/g, side)
    .replace(/#INDICATORS_POWERED#/g, '1')
    .replace(/#ID#/g, side === 'L' ? '1' : '2');
}

/**
 * Both RMPs on and powered, annunciator light switch at BRT (1).
 * @param extra other variables
 * @returns the cockpit variables
 */
function cockpit(extra: RpnVariables = {}): RpnVariables {
  return {
    'L:A32NX_RMP_L_TOGGLE_SWITCH': 1,
    'L:A32NX_RMP_R_TOGGLE_SWITCH': 1,
    'L:A32NX_OVHD_INTLT_ANN': 1,
    'L:A32NX_ELEC_DC_2_BUS_IS_POWERED': 1,
    ...extra,
  };
}

/**
 * Whether the BFO key light of an RMP is on.
 * @param side the RMP
 * @param variables the cockpit variables
 * @returns whether it is on
 */
function bfoLightOn(side: Side, variables: RpnVariables): boolean {
  return (runRpn(bfoLightRpn(side), variables).value ?? 0) > 0;
}

describe('RMP BFO key light (A320 FCOM DSC-34-NAV-30-30 (9))', () => {
  it('is off while the BFO of its ADF is off', () => {
    expect(bfoLightOn('L', cockpit())).toBe(false);
    expect(bfoLightOn('R', cockpit())).toBe(false);
  });

  it('comes on on RMP 1 with the BFO of ADF 1, on RMP 2 with the BFO of ADF 2', () => {
    expect(bfoLightOn('L', cockpit({ 'L:A32NX_ADF_1_BFO_ON': 1 }))).toBe(true);
    expect(bfoLightOn('R', cockpit({ 'L:A32NX_ADF_1_BFO_ON': 1 }))).toBe(false);
    expect(bfoLightOn('R', cockpit({ 'L:A32NX_ADF_2_BFO_ON': 1 }))).toBe(true);
  });

  it('is dark on an RMP that is off or failed', () => {
    expect(bfoLightOn('L', cockpit({ 'L:A32NX_ADF_1_BFO_ON': 1, 'L:A32NX_RMP_L_TOGGLE_SWITCH': 0 }))).toBe(false);
    expect(bfoLightOn('L', cockpit({ 'L:A32NX_ADF_1_BFO_ON': 1, 'L:A32NX_RMP_L_FAILED': 1 }))).toBe(false);
  });

  it('comes on with the annunciator light TEST', () => {
    expect(bfoLightOn('L', cockpit({ 'L:A32NX_OVHD_INTLT_ANN': 0 }))).toBe(true);
  });
});
