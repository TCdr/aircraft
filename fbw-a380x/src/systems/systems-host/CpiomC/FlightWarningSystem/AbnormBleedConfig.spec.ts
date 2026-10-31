// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it } from 'vitest';
import {
  AbnormBleedConfigInputs,
  abnormBleedConfigItems,
  abnormBleedConfigLimitations,
  inoperativeBleeds,
  isAbnormBleedConfig,
} from './AbnormBleedConfig';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { FwcAuralWarning } from './FwsCore';
import { createFws, FwsFixture, runFwsCycle } from './FwsSpecFixture';

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

describe('AIR ABNORM BLEED CONFIG', () => {
  const eng2ShutDown = { ...normal, engineShutDown: [false, true, false, false] };
  const eng1ShutDown = { ...normal, engineShutDown: [true, false, false, false] };

  it('needs a bleed lost and an ENG SHUT DOWN or ENG FIRE', () => {
    expect(isAbnormBleedConfig(normal)).toBe(false);
    expect(isAbnormBleedConfig({ ...normal, bleedPbAuto: [false, true, true, true] })).toBe(false);
    expect(isAbnormBleedConfig(eng2ShutDown)).toBe(true);
    expect(isAbnormBleedConfig({ ...normal, engineFire: [false, false, true, false] })).toBe(true);
    expect(inoperativeBleeds(eng2ShutDown)).toEqual([false, true, false, false]);
  });

  it('after ENG SHUT DOWN with the XBLEED closed: XBLEED ... OPEN', () => {
    expect(shownLines(eng2ShutDown)).toEqual([0, 1]);
  });

  it('XBLEED open, one bleed lost: IF MAX THR RQRD: AIR FLOW LO, FWD CARGO TEMP REGUL OFF', () => {
    expect(shownLines({ ...eng2ShutDown, xbleedOpen: true })).toEqual([1, 2, 3, 4]);
    expect(abnormBleedConfigItems({ ...eng2ShutDown, xbleedOpen: true, airFlowLo: true }).checked[3]).toBe(true);
  });

  it('XBLEED open, two bleeds lost: PACK 1(2) OFF of the side with the lost bleeds', () => {
    const twoRight = { ...normal, engineShutDown: [false, false, true, false], bleedPbAuto: [true, true, true, false] };
    // bleed 4 lost: the IF XBLEED STILL CLOSED condition shows, not met (no line under it)
    expect(shownLines({ ...twoRight, xbleedOpen: true })).toEqual([1, 6, 7]);
  });

  it('bleed 1 lost, XBLEED still closed: WING A-ICE OFF, ENGs A-ICE AS RQRD, AVOID ICING CONDs', () => {
    expect(shownLines(eng1ShutDown)).toEqual([0, 1, 7, 8, 9, 10]);
    expect(abnormBleedConfigLimitations(eng1ShutDown)).toEqual([]);
    expect(abnormBleedConfigLimitations({ ...eng1ShutDown, wingAntiIceOn: false })).toEqual(['300400001']);
  });

  it('after ENG FIRE with the XBLEED open: XBLEED ... CLOSE; bleed 4: WING A-ICE OFF', () => {
    const eng4Fire = { ...normal, engineFire: [false, false, false, true], xbleedOpen: true };
    expect(shownLines(eng4Fire)).toEqual([11, 12, 13]);
    const eng34Fire = { ...normal, engineFire: [false, false, true, true] };
    expect(shownLines(eng34Fire)).toEqual([12, 13, 15]);
  });

  // AIR ENG 1(2)(3)(4) BLEED FAULT is a trigger; its lines are the ones after ENG SHUT DOWN, except the AIR FLOW lines,
  // which need one bleed inoperative and one engine shut down
  it('after AIR ENG BLEED FAULT: XBLEED ... OPEN, and no AIR FLOW lines with its engine still running', () => {
    const eng3BleedFault = { ...normal, bleedFault: [false, false, true, false] };
    expect(isAbnormBleedConfig(eng3BleedFault)).toBe(true);
    expect(inoperativeBleeds(eng3BleedFault)).toEqual([false, false, true, false]);
    expect(shownLines(eng3BleedFault)).toEqual([0, 1]);
    expect(shownLines({ ...eng3BleedFault, xbleedOpen: true })).toEqual([1]);
    const eng1BleedFault = { ...normal, bleedFault: [true, false, false, false] };
    expect(shownLines(eng1BleedFault)).toEqual([0, 1, 7, 8, 9, 10]);
  });

  describe('in the FWS', () => {
    let fixture: FwsFixture;
    beforeAll(() => {
      fixture = createFws(new Set());
    });

    it('the BLEED FAULT trigger is driven by the AIR ENG BLEED FAULT alerts', () => {
      const { core, simVars } = fixture;
      runFwsCycle(core);
      expect(core.abnormBleedConfig.get()).toBe(false);
      simVars.set('L:A32NX_PNEU_ENG_3_OVERHEAT', 1);
      runFwsCycle(core);
      expect(core.engineBleedFault[2].get()).toBe(true);
      expect(core.abnormBleedConfigInputs.bleedFault).toEqual([false, false, true, false]);
      expect(core.abnormBleedConfig.get()).toBe(true);
    });

    it('the message has the 16 lines and the alert is wired without an aural of its own', () => {
      const { core } = fixture;
      const procedure = EcamAbnormalProcedures['211800056'];
      expect(procedure.items).toHaveLength(abnormBleedConfigItems(normal).show.length);
      expect(procedure.items.some((item) => item.name === 'ENGs A-ICE')).toBe(true);
      const entry = core.abnormalSensed.ewdAbnormalSensed['211800056'];
      expect(entry.simVarIsActive).toBe(core.abnormBleedConfig);
      expect(entry.auralWarning?.get()).toBe(FwcAuralWarning.None);
    });
  });
});
