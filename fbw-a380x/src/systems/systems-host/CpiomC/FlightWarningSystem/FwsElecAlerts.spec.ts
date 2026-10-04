// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  ElecAlertLogic,
  ElecEmerConfigProcedureState,
  ElecNetworkInputs,
  feedTanks1And4BelowEmerOutrXfrThreshold,
  OffThenOnSensor,
  readElecNetworkInputs,
} from './FwsElecAlerts';

/** A healthy network in flight: four engines running, every busbar powered, all switches in their normal position */
function normalFlight(): ElecNetworkInputs {
  return {
    acBusPowered: [true, true, true, true],
    acEssBusPowered: true,
    dcBusPowered: [true, true],
    dcEssBusPowered: true,
    acEssFedByAc4: false,
    tr2FedByExtPwr: false,
    trPotentialNormal: [true, true, true, true],
    engGenPbOn: [true, true, true, true],
    engGenPotentialNormal: [true, true, true, true],
    driveConnected: [true, true, true, true],
    engineRunning: [true, true, true, true],
    engineFirePbReleased: [false, false, false, false],
    apuAvailable: false,
    apuGenPotentialNormal: [false, false],
    busTiePbAuto: true,
  };
}

function anyFlag(flags: ReturnType<ElecAlertLogic['update']>): boolean {
  return Object.values(flags).some((v) => (Array.isArray(v) ? v.some((b) => b) : v));
}

describe('ElecAlertLogic (A380 FCOM PRO-ABN-ECAM-10-24)', () => {
  it('raises nothing on a healthy network', () => {
    expect(anyFlag(new ElecAlertLogic().update(normalFlight()))).toBe(false);
  });

  it('raises only ELEC EMER CONFIG when all four AC busbars are lost, not the single busbar faults', () => {
    const i = normalFlight();
    i.acBusPowered = [false, false, false, false];
    i.acEssBusPowered = false;
    i.dcBusPowered = [false, false];
    const flags = new ElecAlertLogic().update(i);
    expect(flags.emerConfig).toBe(true);
    expect(flags.acBusFault).toEqual([false, false, false, false]);
    expect(flags.acEssBusFault).toBe(false);
    expect(flags.dcBusFault).toEqual([false, false]);
  });

  it('raises no busbar fault on the ground on batteries only (aircraft not powered yet)', () => {
    const i = normalFlight();
    i.acBusPowered = [false, false, false, false];
    i.acEssBusPowered = false;
    i.dcBusPowered = [false, false];
    i.engineRunning = [false, false, false, false];
    const flags = new ElecAlertLogic().update(i);
    expect(flags.acBusFault).toEqual([false, false, false, false]);
    expect(flags.dcBusFault).toEqual([false, false]);
    expect(flags.dcEssBusFault).toBe(false);
    expect(flags.genOff).toEqual([false, false, false, false]);
  });

  it.each([0, 1, 2, 3])('raises ELEC AC BUS %i+1 FAULT when only that busbar is lost', (bus) => {
    const i = normalFlight();
    i.acBusPowered[bus] = false;
    const flags = new ElecAlertLogic().update(i);
    expect(flags.acBusFault.map((f, idx) => f === (idx === bus))).toEqual([true, true, true, true]);
    expect(flags.emerConfig).toBe(false);
  });

  it('does not call TR 1 failed when its AC 2 supply is lost (ELEC AC BUS 2 FAULT covers it)', () => {
    const i = normalFlight();
    i.acBusPowered[1] = false;
    i.trPotentialNormal[0] = false;
    const flags = new ElecAlertLogic().update(i);
    expect(flags.acBusFault[1]).toBe(true);
    expect(flags.trFault[0]).toBe(false);
  });

  it('raises the AC ESS, DC 1, DC 2 and DC ESS busbar faults', () => {
    const i = normalFlight();
    i.acEssBusPowered = false;
    i.dcBusPowered = [false, true];
    i.dcEssBusPowered = false;
    i.trPotentialNormal[2] = false; // TR ESS without supply: not a TR fault
    const flags = new ElecAlertLogic().update(i);
    expect(flags.acEssBusFault).toBe(true);
    expect(flags.dcBusFault).toEqual([true, false]);
    expect(flags.dcEssBusFault).toBe(true);
    expect(flags.trFault[2]).toBe(false);
  });

  it.each([
    [0, 'TR 1'],
    [1, 'TR 2'],
    [2, 'TR ESS'],
  ])('raises ELEC TR FAULT for a supplied TR without output (%i = %s)', (tr) => {
    const i = normalFlight();
    i.trPotentialNormal[tr] = false;
    const flags = new ElecAlertLogic().update(i);
    expect(flags.trFault.map((f, idx) => f === (idx === tr))).toEqual([true, true, true]);
    expect(flags.apuTrFault).toBe(false);
  });

  it('raises ELEC TR 2 FAULT in ground servicing (TR 2 on external power, AC busbars off)', () => {
    const i = normalFlight();
    i.acBusPowered = [false, false, false, false];
    i.acEssBusPowered = false;
    i.engineRunning = [false, false, false, false];
    i.tr2FedByExtPwr = true;
    i.trPotentialNormal = [false, false, false, false];
    const flags = new ElecAlertLogic().update(i);
    expect(flags.trFault).toEqual([false, true, false]);
    expect(flags.apuTrFault).toBe(false);
  });

  it('raises ELEC APU TR FAULT when the APU TR gives no output with AC 4 powered', () => {
    const i = normalFlight();
    i.trPotentialNormal[3] = false;
    expect(new ElecAlertLogic().update(i).apuTrFault).toBe(true);
  });

  it('keeps ELEC GEN 1 FAULT after the crew sets GEN 1 OFF, without ELEC GEN 1 OFF, until the engine stops', () => {
    const logic = new ElecAlertLogic();
    const i = normalFlight();
    i.engGenPotentialNormal[0] = false;
    let flags = logic.update(i);
    expect(flags.genFault).toEqual([true, false, false, false]);

    // Procedure action GEN 1 ... OFF (FCOM l.142349)
    i.engGenPbOn[0] = false;
    flags = logic.update(i);
    expect(flags.genFault[0]).toBe(true);
    expect(flags.genOff[0]).toBe(false);

    i.engineRunning[0] = false;
    flags = logic.update(i);
    expect(flags.genFault[0]).toBe(false);
    expect(flags.genOff[0]).toBe(false);
  });

  it('clears ELEC GEN FAULT when the generator works again', () => {
    const logic = new ElecAlertLogic();
    const i = normalFlight();
    i.engGenPotentialNormal[2] = false;
    expect(logic.update(i).genFault[2]).toBe(true);
    i.engGenPotentialNormal[2] = true;
    expect(logic.update(i).genFault[2]).toBe(false);
  });

  it('does not raise ELEC GEN FAULT while the engine starts or after the ENG FIRE pb is released', () => {
    const i = normalFlight();
    i.engineRunning[1] = false;
    i.engGenPotentialNormal[1] = false;
    expect(new ElecAlertLogic().update(i).genFault[1]).toBe(false);

    const j = normalFlight();
    j.engineFirePbReleased[3] = true;
    j.engGenPotentialNormal[3] = false;
    expect(new ElecAlertLogic().update(j).genFault[3]).toBe(false);
  });

  it('raises ELEC GEN 2 OFF for a GEN pb-sw OFF with the engine running only', () => {
    const i = normalFlight();
    i.engGenPbOn[1] = false;
    i.engGenPotentialNormal[1] = false;
    expect(new ElecAlertLogic().update(i).genOff).toEqual([false, true, false, false]);
    expect(new ElecAlertLogic().update(i).genFault[1]).toBe(false);

    i.engineRunning[1] = false;
    expect(new ElecAlertLogic().update(i).genOff[1]).toBe(false);
  });

  it('raises ELEC DRIVE 4 DISCONNECTED, and neither GEN 4 FAULT nor GEN 4 OFF, for a released drive', () => {
    const i = normalFlight();
    i.driveConnected[3] = false;
    i.engGenPotentialNormal[3] = false;
    let flags = new ElecAlertLogic().update(i);
    expect(flags.driveDisconnected).toEqual([false, false, false, true]);
    expect(flags.genFault[3]).toBe(false);
    i.engGenPbOn[3] = false; // DRIVE DISCONNECTED: crew sets GEN 4 OFF
    flags = new ElecAlertLogic().update(i);
    expect(flags.genOff[3]).toBe(false);
  });

  it('raises ELEC APU GEN A(B) FAULT only with the APU available', () => {
    const i = normalFlight();
    i.apuAvailable = true;
    i.apuGenPotentialNormal = [true, false];
    expect(new ElecAlertLogic().update(i).apuGenFault).toEqual([false, true]);
    i.apuAvailable = false;
    i.apuGenPotentialNormal = [false, false];
    expect(new ElecAlertLogic().update(i).apuGenFault).toEqual([false, false]);
  });

  it('raises ELEC AC ESS BUS ALTN when AC 4 supplies the AC ESS busbar, ELEC BUS TIE OFF for the pb-sw OFF', () => {
    const i = normalFlight();
    i.acEssFedByAc4 = true;
    i.busTiePbAuto = false;
    const flags = new ElecAlertLogic().update(i);
    expect(flags.acEssBusAltn).toBe(true);
    expect(flags.busTieOff).toBe(true);
  });
});

describe('readElecNetworkInputs', () => {
  it('turns the Bool numbers into booleans and reads engine state ON (1) only as running', () => {
    const values: Record<string, number> = {
      'L:A32NX_ELEC_AC_1_BUS_IS_POWERED': 1,
      'L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED': 1,
      'L:A32NX_ELEC_TR_3_POTENTIAL_NORMAL': 1,
      'L:A32NX_ENGINE_STATE:1': 1,
      'L:A32NX_ENGINE_STATE:2': 2,
      'L:A32NX_OVHD_ELEC_BUS_TIE_PB_IS_AUTO': 1,
      'L:A32NX_ELEC_CONTACTOR_3XC2_IS_CLOSED': 1,
    };
    const i = readElecNetworkInputs((name) => values[name] ?? 0);
    expect(i.acBusPowered).toEqual([true, false, false, false]);
    expect(i.dcEssBusPowered).toBe(true);
    expect(i.trPotentialNormal).toEqual([false, false, true, false]);
    expect(i.engineRunning).toEqual([true, false, false, false]);
    expect(i.busTiePbAuto).toBe(true);
    expect(i.acEssFedByAc4).toBe(true);
  });
});

describe('OffThenOnSensor (procedure lines "... OFF THEN ON")', () => {
  it('completes only after OFF and then ON', () => {
    const s = new OffThenOnSensor();
    expect(s.update(false, true)).toBe(false); // ON from the start: nothing done yet
    expect(s.update(true, false)).toBe(false);
    expect(s.update(false, false)).toBe(false); // partly on again
    expect(s.update(false, true)).toBe(true);
    expect(s.update(true, false)).toBe(true); // stays completed
    s.reset();
    expect(s.isCompleted).toBe(false);
  });
});

describe('ElecEmerConfigProcedureState (FCOM l.141646 to l.141818)', () => {
  it('latches the FL 230 branch when the alert triggers', () => {
    const s = new ElecEmerConfigProcedureState();
    s.update(true, 22_000, false, true, false);
    expect(s.triggeredAtOrBelowFl230).toBe(true);
    s.update(true, 25_000, false, true, false); // climbing later does not change the branch
    expect(s.triggeredAtOrBelowFl230).toBe(true);

    const t = new ElecEmerConfigProcedureState();
    t.update(true, 35_000, false, true, false);
    expect(t.triggeredAtOrBelowFl230).toBe(false);
    const u = new ElecEmerConfigProcedureState();
    u.update(true, null, false, true, false); // altitude not valid
    expect(u.triggeredAtOrBelowFl230).toBe(false);
  });

  it('senses the first GENs reset, then the second one only with the BUS TIE OFF', () => {
    const s = new ElecEmerConfigProcedureState();
    s.update(true, 30_000, false, true, false);
    s.update(true, 30_000, true, false, false);
    s.update(true, 30_000, false, true, false);
    expect(s.firstGensReset.isCompleted).toBe(true);
    expect(s.secondGensReset.isCompleted).toBe(false);

    s.update(true, 30_000, true, false, false); // OFF again without BUS TIE OFF: does not count
    s.update(true, 30_000, false, true, true);
    expect(s.secondGensReset.isCompleted).toBe(false);

    s.update(true, 30_000, true, false, true);
    s.update(true, 30_000, false, true, true);
    expect(s.secondGensReset.isCompleted).toBe(true);
  });

  it('starts again from scratch at the next trigger', () => {
    const s = new ElecEmerConfigProcedureState();
    s.update(true, 30_000, true, false, false);
    s.update(true, 30_000, false, true, false);
    s.update(false, 30_000, false, true, false);
    s.update(true, 10_000, false, true, false);
    expect(s.firstGensReset.isCompleted).toBe(false);
    expect(s.triggeredAtOrBelowFl230).toBe(true);
  });
});

describe('feedTanks1And4BelowEmerOutrXfrThreshold (42 000 lb / 19 000 kg)', () => {
  it.each([
    [18_000, 18_500, true],
    [18_000, 19_000, false],
    [25_000, 10_000, false],
  ])('feed tank 1 %i kg, feed tank 4 %i kg -> %s', (t1, t4, expected) => {
    expect(feedTanks1And4BelowEmerOutrXfrThreshold(t1, t4)).toBe(expected);
  });
});

describe('readElecNetworkInputs', () => {
  it('reads the AC ESS busbar from the ESS_SHED variable, not from the AC EMER one', () => {
    const vars: Record<string, number> = {
      'L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED': 0, // AC ESS lost (flyPad failure 24105 "AC ESS")
      'L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED': 1, // AC EMER powered
    };
    expect(readElecNetworkInputs((name) => vars[name] ?? 1).acEssBusPowered).toBe(false);
    vars['L:A32NX_ELEC_AC_ESS_SHED_BUS_IS_POWERED'] = 1;
    vars['L:A32NX_ELEC_AC_ESS_BUS_IS_POWERED'] = 0; // only AC EMER lost (failure 24104 "AC EMER")
    expect(readElecNetworkInputs((name) => vars[name] ?? 1).acEssBusPowered).toBe(true);
  });

  it('reads the GEN pb-sw from the sim engine alternator switch (the A380X writes no GEN pb L:var)', () => {
    const vars: Record<string, number> = {
      'A:GENERAL ENG MASTER ALTERNATOR:1': 1,
      'A:GENERAL ENG MASTER ALTERNATOR:2': 1,
      'A:GENERAL ENG MASTER ALTERNATOR:3': 0,
      'A:GENERAL ENG MASTER ALTERNATOR:4': 1,
    };
    expect(readElecNetworkInputs((name) => vars[name] ?? 0).engGenPbOn).toEqual([true, true, false, true]);
  });
});
