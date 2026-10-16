// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  AbnormBleedConfigInputs,
  abnormBleedConfigItems,
  abnormBleedConfigLimitations,
  inoperativeBleeds,
  isAbnormBleedConfig,
} from './AbnormBleedConfig';

/* The wiring is read from the source text, as FwsAbnormalSensedItems.spec.ts does (EcamMessages import cycle). */
const abnormalSensed = readFileSync(resolve(__dirname, 'FwsAbnormalSensed.ts'), 'utf-8');
const ata21 = readFileSync(
  resolve(__dirname, '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23.ts'),
  'utf-8',
);

const normal: AbnormBleedConfigInputs = {
  engineShutDown: [false, false, false, false],
  engineFire: [false, false, false, false],
  bleedFault: [false, false, false, false],
  bleedPbAuto: [true, true, true, true],
  xbleedOpen: false,
  xbleedSelectorOpen: false,
  xbleedSelectorShut: false,
  airFlowLo: false,
  fwdCargoTempRegulOff: false,
  pack1On: true,
  pack2On: true,
  wingAntiIceOn: true,
};

/** The indexes of the lines shown */
const shownLines = (inputs: AbnormBleedConfigInputs) =>
  abnormBleedConfigItems(inputs)
    .show.map((shown, index) => (shown ? index : -1))
    .filter((index) => index >= 0);

describe('AIR ABNORM BLEED CONFIG (A380 FCOM PRO-ABN-ECAM-10-36, l.167558-167674)', () => {
  const eng2ShutDown = { ...normal, engineShutDown: [false, true, false, false] };
  const eng1ShutDown = { ...normal, engineShutDown: [true, false, false, false] };

  it('needs a bleed lost and an ENG SHUT DOWN or ENG FIRE (l.167564-167568)', () => {
    expect(isAbnormBleedConfig(normal)).toBe(false);
    expect(isAbnormBleedConfig({ ...normal, bleedPbAuto: [false, true, true, true] })).toBe(false);
    expect(isAbnormBleedConfig(eng2ShutDown)).toBe(true);
    expect(isAbnormBleedConfig({ ...normal, engineFire: [false, false, true, false] })).toBe(true);
    expect(inoperativeBleeds(eng2ShutDown)).toEqual([false, true, false, false]);
  });

  it('after ENG SHUT DOWN with the XBLEED closed: XBLEED ... OPEN', () => {
    expect(shownLines(eng2ShutDown)).toEqual([0, 1]);
  });

  it('XBLEED open, one bleed lost: IF MAX THR RQRD: AIR FLOW LO, FWD CARGO TEMP REGUL OFF (l.167592-167601)', () => {
    expect(shownLines({ ...eng2ShutDown, xbleedOpen: true })).toEqual([1, 2, 3, 4]);
    expect(abnormBleedConfigItems({ ...eng2ShutDown, xbleedOpen: true, airFlowLo: true }).checked[3]).toBe(true);
  });

  it('XBLEED open, two bleeds lost: PACK 1(2) OFF of the side with the lost bleeds (l.167603-167605)', () => {
    const twoRight = { ...normal, engineShutDown: [false, false, true, false], bleedPbAuto: [true, true, true, false] };
    // bleed 4 lost: the IF XBLEED STILL CLOSED condition shows, not met (no line under it)
    expect(shownLines({ ...twoRight, xbleedOpen: true })).toEqual([1, 6, 7]);
  });

  it('bleed 1 lost, XBLEED still closed: WING A-ICE OFF, ENGs A-ICE AS RQRD, AVOID ICING CONDs (l.167608-167614)', () => {
    expect(shownLines(eng1ShutDown)).toEqual([0, 1, 7, 8, 9, 10]);
    expect(abnormBleedConfigLimitations(eng1ShutDown)).toEqual([]);
    expect(abnormBleedConfigLimitations({ ...eng1ShutDown, wingAntiIceOn: false })).toEqual(['300400001']);
  });

  it('after ENG FIRE with the XBLEED open: XBLEED ... CLOSE; bleed 4: WING A-ICE OFF (l.167616-167628)', () => {
    const eng4Fire = { ...normal, engineFire: [false, false, false, true], xbleedOpen: true };
    expect(shownLines(eng4Fire)).toEqual([11, 12, 13]);
    const eng34Fire = { ...normal, engineFire: [false, false, true, true] };
    expect(shownLines(eng34Fire)).toEqual([12, 13, 15]);
  });

  // AIR ENG 1(2)(3)(4) BLEED FAULT is a trigger (l.167565); its lines are the ones after ENG SHUT DOWN, except the AIR
  // FLOW lines of "one bleed is inoperative, and one engine is shut down" (l.167592)
  it('after AIR ENG BLEED FAULT: XBLEED ... OPEN, and no AIR FLOW lines with its engine still running', () => {
    const eng3BleedFault = { ...normal, bleedFault: [false, false, true, false] };
    expect(isAbnormBleedConfig(eng3BleedFault)).toBe(true);
    expect(inoperativeBleeds(eng3BleedFault)).toEqual([false, false, true, false]);
    expect(shownLines(eng3BleedFault)).toEqual([0, 1]);
    expect(shownLines({ ...eng3BleedFault, xbleedOpen: true })).toEqual([1]);
    const eng1BleedFault = { ...normal, bleedFault: [true, false, false, false] };
    expect(shownLines(eng1BleedFault)).toEqual([0, 1, 7, 8, 9, 10]);
  });

  it('the BLEED FAULT trigger is wired from the AIR ENG BLEED FAULT alerts', () => {
    const fwsCore = readFileSync(resolve(__dirname, 'FwsCore.ts'), 'utf-8');
    expect(fwsCore).toContain('bleedFault: this.engineBleedFault.map((fault) => fault.get()),');
  });

  it('the message has the 16 lines and the alert is wired', () => {
    const start = ata21.indexOf('  211800056: {');
    const procedure = ata21.slice(start, ata21.indexOf('\n  },', start));
    expect(procedure.match(/name: '/g)).toHaveLength(abnormBleedConfigItems(normal).show.length);
    expect(procedure).toContain("name: 'ENGs A-ICE',");
    const entry = abnormalSensed.slice(abnormalSensed.indexOf('    211800056: {'));
    expect(entry).toContain('simVarIsActive: this.fws.abnormBleedConfig,');
    expect(entry).toContain('auralWarning: Subject.create(FwcAuralWarning.None),');
  });
});
