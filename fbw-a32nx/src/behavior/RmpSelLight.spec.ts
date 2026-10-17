// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The SEL lights of the RMPs (A32NX_Interior_RMP.xml, template FBW_RMP_COMMS_MODE_SELECTION_Template): the rnp code is
// compiled as build.js does, then the RPN is run by RpnTestInterpreter. Kept outside src/ because build.js copies every
// file of src/.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { compileRnp, runRpn, RpnVariables } from './RpnTestInterpreter';

const RMP_BEHAVIOR_XML = join(__dirname, 'src', 'A32NX_Interior_RMP.xml');

type Side = 'L' | 'R';

/** The RPN of the EMISSIVE_CODE of the SEL light component SEQ1 or SEQ2, for one RMP */
function selLightRpn(component: 'SEQ1' | 'SEQ2', side: Side): string {
  const xml = readFileSync(RMP_BEHAVIOR_XML, 'utf8');
  const block = new RegExp(
    `<Component ID="PUSH_RADIO#SIDE#_SEL_${component}"[\\s\\S]*?<EMISSIVE_CODE type="rnp" return="number">([\\s\\S]*?)</EMISSIVE_CODE>`,
  ).exec(xml);
  if (!block) {
    throw new Error(`SEL ${component} EMISSIVE_CODE not found`);
  }
  return compileRnp(block[1])
    .replace(/#SIDE#/g, side)
    .replace(/#INDICATORS_POWERED#/g, '1')
    .replace(/#ID#/g, side === 'L' ? '1' : '2');
}

/** Both RMPs on, powered, annunciator light switch at BRT (1), each RMP on the given mode (1 VHF1, 2 VHF2, 3 VHF3) */
function cockpit(leftMode: number, rightMode: number, extra: RpnVariables = {}): RpnVariables {
  return {
    'L:A32NX_RMP_L_TOGGLE_SWITCH': 1,
    'L:A32NX_RMP_R_TOGGLE_SWITCH': 1,
    'L:A32NX_RMP_L_SELECTED_MODE': leftMode,
    'L:A32NX_RMP_R_SELECTED_MODE': rightMode,
    'L:A32NX_OVHD_INTLT_ANN': 1,
    'L:A32NX_ELEC_DC_2_BUS_IS_POWERED': 1,
    ...extra,
  };
}

/** Whether the SEL light of the RMP of `side` is on (both light components agree) */
function selOn(side: Side, variables: RpnVariables): boolean {
  const seq1 = (runRpn(selLightRpn('SEQ1', side), variables).value ?? 0) > 0;
  const seq2 = (runRpn(selLightRpn('SEQ2', side), variables).value ?? 0) > 0;
  expect(seq2).toBe(seq1);
  return seq1;
}

/*
 * SEL indicator: comes on amber on both RMPs when a transceiver normally associated with one RMP is tuned by the other.
 * With 2 RMPs: VHF1 (VHF3, HF1) tuned by RMP2, or VHF2 (HF2) tuned by RMP1.
 */
describe('RMP SEL light', () => {
  it('is off in the normal configuration (RMP1 on VHF1, RMP2 on VHF2)', () => {
    expect(selOn('L', cockpit(1, 2))).toBe(false);
    expect(selOn('R', cockpit(1, 2))).toBe(false);
  });

  it('comes on on both RMPs when RMP2 tunes VHF1', () => {
    expect(selOn('L', cockpit(1, 1))).toBe(true);
    expect(selOn('R', cockpit(1, 1))).toBe(true);
  });

  it('comes on on both RMPs when RMP1 tunes VHF2', () => {
    expect(selOn('L', cockpit(2, 2))).toBe(true);
    expect(selOn('R', cockpit(2, 2))).toBe(true);
  });

  it('comes on on both RMPs when RMP2 tunes VHF3, not when RMP1 does', () => {
    expect(selOn('L', cockpit(1, 3))).toBe(true);
    expect(selOn('R', cockpit(1, 3))).toBe(true);
    expect(selOn('L', cockpit(3, 2))).toBe(false);
    expect(selOn('R', cockpit(3, 2))).toBe(false);
  });

  it('an RMP that is off or failed tunes nothing, and its own SEL light is dark', () => {
    // RMP2 on VHF1 but switched off: no off-side tuning
    expect(selOn('L', cockpit(1, 1, { 'L:A32NX_RMP_R_TOGGLE_SWITCH': 0 }))).toBe(false);
    expect(selOn('L', cockpit(1, 1, { 'L:A32NX_RMP_R_FAILED': 1 }))).toBe(false);
    // RMP1 on VHF2 and RMP2 off: RMP1 lights its SEL, RMP2 stays dark
    expect(selOn('L', cockpit(2, 2, { 'L:A32NX_RMP_R_TOGGLE_SWITCH': 0 }))).toBe(true);
    expect(selOn('R', cockpit(2, 2, { 'L:A32NX_RMP_R_TOGGLE_SWITCH': 0 }))).toBe(false);
  });

  it('comes on with the annunciator light TEST', () => {
    expect(selOn('L', cockpit(1, 2, { 'L:A32NX_OVHD_INTLT_ANN': 0 }))).toBe(true);
  });
});
