// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import {
  EcamAbnormalProcedures,
  EcamInfos,
  EcamInopSys,
  EcamLimitations,
  EcamMemos,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';
import { SdPages } from '@shared/EcamSystemPages';
import {
  BLEED_LEAK_ALERT_KEYS,
  BLEED_LEAK_ALERT_PHASE_INHIBITION,
  BLEED_TEMP_LO_CONFIRMATION_S,
  BleedLeakAlertInputs,
  BleedLeakAlerts,
  LEAK_DETECTION_ZONES,
  apuBleedLeakInopSys,
  apuBleedLeakItems,
  bleedLeakAbnormalItems,
  bleedTempLoItems,
  engineBleedNotClosedItems,
  hotAirLeakInfo,
  hotAirLeakInopSys,
  hotAirLeakItems,
  leakDetFaultInopSys,
  leakDetFaultItems,
  packLeakInopSys,
  packLeakItems,
  readBleedLeakAlertInputs,
  xbleedFaultInfo,
  xbleedFaultInopSys,
  xbleedFaultItems,
} from './FwsBleedLeakAlerts';

const FRAME_MS = 100;

/** The ECAM message tables an INOP SYS, INFO, LIMITATION or MEMO code is looked up in */
const ecamTables: { [code: string]: unknown }[] = [EcamInopSys, EcamInfos, EcamLimitations, EcamMemos];

/** Four engines running in flight, all bleeds, packs and hot-air valves normal */
const normal: BleedLeakAlertInputs = {
  pylonLeak: [false, false, false, false],
  wingLeak: [false, false, false, false],
  apuLeak: false,
  packLeak: [false, false],
  hotAirLeak: [false, false],
  fwdCargoDuctLeak: false,
  leakDetectionLost: LEAK_DETECTION_ZONES.map(() => false),
  bleedValveOpen: [true, true, true, true],
  bleedValveDisagree: [false, false, false, false],
  bleedPbAuto: [true, true, true, true],
  starterValveOpen: [false, false, false, false],
  hpValveNotOpen: [false, false, false, false],
  bleedTemperature: [200, 200, 200, 200],
  xbleedAbnormalPosition: [false, false, false],
  xbleedAutoControlLost: [false, false, false],
  xbleedManualControlLost: [false, false, false],
  xbleedSelectorOpen: false,
  xbleedSelectorAuto: true,
  apuBleedValveOpen: false,
  apuBleedPbOn: false,
  packValveOpen: [true, true, true, true],
  packPbOn: [true, true],
  hotAirValveOpen: [true, true],
  hotAirPbOn: [true, true],
  engineRunning: [true, true, true, true],
  wingAntiIceOn: false,
  onGround: false,
};

function run(alerts: BleedLeakAlerts, inputs: BleedLeakAlertInputs, seconds: number): BleedLeakAlerts {
  for (let t = 0; t < seconds * 1000; t += FRAME_MS) {
    alerts.update(inputs, FRAME_MS);
  }
  return alerts;
}

function activeKeys(alerts: BleedLeakAlerts): number[] {
  const items = bleedLeakAbnormalItems(alerts);
  return Object.keys(items)
    .map(Number)
    .filter((key) => items[key].simVarIsActive.get());
}

describe('FwsBleedLeakAlerts triggers', () => {
  it('raises nothing in normal operation', () => {
    expect(activeKeys(run(new BleedLeakAlerts(), normal, 120))).toEqual([]);
  });

  it('AIR APU BLEED LEAK, PACK 1(2) LEAK, HOT AIR 1(2) LEAK, FWD CARGO DUCT LEAK follow the zone leaks', () => {
    const alerts = run(
      new BleedLeakAlerts(),
      { ...normal, apuLeak: true, packLeak: [false, true], hotAirLeak: [true, false], fwdCargoDuctLeak: true },
      1,
    );
    expect(activeKeys(alerts).sort()).toEqual(
      [
        BLEED_LEAK_ALERT_KEYS.apuBleedLeak,
        BLEED_LEAK_ALERT_KEYS.packLeak[1],
        BLEED_LEAK_ALERT_KEYS.hotAirLeak[0],
        BLEED_LEAK_ALERT_KEYS.fwdCargoDuctLeak,
      ].sort(),
    );
  });

  it('AIR BLEED LEAK: an engine or wing duct leak with the XBLEED selector at OPEN only', () => {
    const leak = { ...normal, wingLeak: [false, false, true, false] };
    expect(activeKeys(run(new BleedLeakAlerts(), leak, 1))).toEqual([]);
    expect(activeKeys(run(new BleedLeakAlerts(), { ...leak, xbleedSelectorOpen: true }, 1))).toEqual([
      BLEED_LEAK_ALERT_KEYS.bleedLeak,
    ]);
    expect(
      activeKeys(
        run(new BleedLeakAlerts(), { ...normal, pylonLeak: [true, false, false, false], xbleedSelectorOpen: true }, 1),
      ),
    ).toEqual([BLEED_LEAK_ALERT_KEYS.bleedLeak]);
  });

  it('AIR LEAK DET FAULT: any duct with its leak detection lost', () => {
    const lost = LEAK_DETECTION_ZONES.map((zone) => zone === 'AFT_CARGO');
    expect(activeKeys(run(new BleedLeakAlerts(), { ...normal, leakDetectionLost: lost }, 1))).toEqual([
      BLEED_LEAK_ALERT_KEYS.leakDetFault,
    ]);
  });

  it('AIR ENG n HP VLV NOT OPEN follows the CPIOM-A monitoring of the HP valve', () => {
    expect(
      activeKeys(run(new BleedLeakAlerts(), { ...normal, hpValveNotOpen: [false, false, true, false] }, 1)),
    ).toEqual([BLEED_LEAK_ALERT_KEYS.hpValveNotOpen[2]]);
  });

  it('AIR XBLEED FAULT: an abnormal position, the automatic or the manual control lost', () => {
    for (const fault of [
      { xbleedAbnormalPosition: [false, true, false] },
      { xbleedAutoControlLost: [false, false, true] },
      { xbleedManualControlLost: [true, true, true] },
    ]) {
      expect(activeKeys(run(new BleedLeakAlerts(), { ...normal, ...fault }, 1))).toEqual([
        BLEED_LEAK_ALERT_KEYS.xbleedFault,
      ]);
    }
  });
});

describe('AIR ENG n BLEED NOT CLOSED', () => {
  const stuckOpenDuringApuBleed: BleedLeakAlertInputs = {
    ...normal,
    onGround: true,
    engineRunning: [false, false, false, false],
    bleedValveOpen: [false, true, false, false],
    bleedValveDisagree: [false, true, false, false],
    apuBleedPbOn: true,
    apuBleedValveOpen: true,
  };

  it('the bleed valve open against its command during the APU bleed supply', () => {
    const alerts = run(new BleedLeakAlerts(), stuckOpenDuringApuBleed, 1);
    expect(activeKeys(alerts)).toEqual([BLEED_LEAK_ALERT_KEYS.engineBleedNotClosed[1]]);
  });

  it('the bleed valve open against its command during the engine start', () => {
    const alerts = run(
      new BleedLeakAlerts(),
      { ...stuckOpenDuringApuBleed, apuBleedPbOn: false, starterValveOpen: [false, true, false, false] },
      1,
    );
    expect(activeKeys(alerts)).toEqual([BLEED_LEAK_ALERT_KEYS.engineBleedNotClosed[1]]);
  });

  it('no alert for a disagreement outside the APU bleed supply and the engine start', () => {
    const alerts = run(new BleedLeakAlerts(), { ...stuckOpenDuringApuBleed, apuBleedPbOn: false }, 1);
    expect(activeKeys(alerts)).toEqual([]);
  });

  it('stays with the ENG BLEED pb-sw OFF once the start is over, until the bleed is set back ON', () => {
    const alerts = run(new BleedLeakAlerts(), stuckOpenDuringApuBleed, 1);
    const pbOff = { ...stuckOpenDuringApuBleed, bleedPbAuto: [true, false, true, true] };
    run(alerts, pbOff, 1);
    expect(engineBleedNotClosedItems(alerts.inputs, 1)).toEqual({
      show: [true, true, true],
      checked: [true, false, false],
    });

    const startedApuOff = { ...pbOff, engineRunning: [false, true, false, false], apuBleedPbOn: false };
    run(alerts, startedApuOff, 5);
    expect(activeKeys(alerts)).toEqual([BLEED_LEAK_ALERT_KEYS.engineBleedNotClosed[1]]);

    run(alerts, { ...startedApuOff, bleedPbAuto: [true, true, true, true] }, 1);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('AIR ENG BLEED TEMP LO ON BLEED n', () => {
  const coldBleed2: BleedLeakAlertInputs = { ...normal, wingAntiIceOn: true, bleedTemperature: [200, 140, 200, 200] };

  it('in flight with the WING A-ICE pb ON, a bleed below 150 °C for more than 60 s', () => {
    const alerts = run(new BleedLeakAlerts(), coldBleed2, BLEED_TEMP_LO_CONFIRMATION_S - 1);
    expect(activeKeys(alerts)).toEqual([]);
    run(alerts, coldBleed2, 2);
    expect(activeKeys(alerts)).toEqual([BLEED_LEAK_ALERT_KEYS.bleedTempLo[1]]);
  });

  it('not with the WING A-ICE pb OFF, on ground, or with the bleed valve closed', () => {
    for (const inputs of [
      { ...coldBleed2, wingAntiIceOn: false },
      { ...coldBleed2, onGround: true },
      { ...coldBleed2, bleedValveOpen: [true, false, true, true] },
    ]) {
      expect(activeKeys(run(new BleedLeakAlerts(), inputs, 70))).toEqual([]);
    }
  });

  it('one bleed LO TEMP: ENG n BLEED OFF; more than one: WING A-ICE OFF and AVOID ICING CONDs', () => {
    const one = run(new BleedLeakAlerts(), coldBleed2, 70);
    expect(bleedTempLoItems(one.inputs, 1, one.bleedsTempLo()).show).toEqual([true, true, true, false, false, false]);
    expect(bleedLeakAbnormalItems(one)[BLEED_LEAK_ALERT_KEYS.bleedTempLo[1]].limitationsAllPhases?.([])).toEqual([]);

    const two = run(new BleedLeakAlerts(), { ...coldBleed2, bleedTemperature: [200, 140, 145, 200] }, 70);
    expect(two.bleedsTempLo()).toBe(2);
    expect(bleedTempLoItems(two.inputs, 1, two.bleedsTempLo()).show).toEqual([true, true, false, true, true, true]);
    expect(bleedLeakAbnormalItems(two)[BLEED_LEAK_ALERT_KEYS.bleedTempLo[1]].limitationsPfd?.([])).toEqual([
      '300400001',
    ]);
  });

  it('stays once the crew sets the bleed OFF, with its STATUS, until the bleed is back ON', () => {
    const alerts = run(new BleedLeakAlerts(), coldBleed2, 70);
    const bleedOff = {
      ...coldBleed2,
      bleedPbAuto: [true, false, true, true],
      bleedValveOpen: [true, false, true, true],
    };
    run(alerts, bleedOff, 5);
    expect(activeKeys(alerts)).toEqual([BLEED_LEAK_ALERT_KEYS.bleedTempLo[1]]);
    expect(bleedTempLoItems(alerts.inputs, 1, alerts.bleedsTempLo()).checked[2]).toBe(true);
    expect(bleedLeakAbnormalItems(alerts)[BLEED_LEAK_ALERT_KEYS.bleedTempLo[1]].inopSysAllPhases?.([])).toEqual([
      '260300003',
    ]);

    run(alerts, { ...bleedOff, bleedPbAuto: [true, true, true, true], bleedTemperature: [200, 200, 200, 200] }, 1);
    expect(activeKeys(alerts)).toEqual([]);
  });

  it('stays once the crew sets WING A-ICE OFF with several bleeds LO TEMP, with AVOID ICING CONDs, until landing', () => {
    const several = { ...coldBleed2, bleedTemperature: [200, 140, 145, 200] };
    const alerts = run(new BleedLeakAlerts(), several, 70);
    const wingAntiIceOff = { ...several, wingAntiIceOn: false };
    run(alerts, wingAntiIceOff, 5);
    expect(activeKeys(alerts).sort()).toEqual(
      [BLEED_LEAK_ALERT_KEYS.bleedTempLo[1], BLEED_LEAK_ALERT_KEYS.bleedTempLo[2]].sort(),
    );
    const entry = bleedLeakAbnormalItems(alerts)[BLEED_LEAK_ALERT_KEYS.bleedTempLo[2]];
    expect(entry.whichItemsChecked()[3]).toBe(true);
    expect(entry.inopSysAllPhases?.([])).toEqual(['300300001']);
    expect(entry.limitationsAllPhases?.([])).toEqual(['300400001']);

    run(alerts, { ...wingAntiIceOff, onGround: true }, 1);
    expect(activeKeys(alerts)).toEqual([]);
  });
});

describe('FwsBleedLeakAlerts procedure lines and STATUS', () => {
  it('AIR APU BLEED LEAK on ground before any engine start: the KEEP OFF lines, no INOP SYS', () => {
    const beforeStart = {
      ...normal,
      onGround: true,
      engineRunning: [false, false, false, false],
      bleedValveOpen: [false, false, false, false],
      apuLeak: true,
      apuBleedPbOn: true,
    };
    // the APU bleed valve closed automatically: no APU BLEED OFF line, the leak isolated
    expect(apuBleedLeakItems(beforeStart).show).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(apuBleedLeakInopSys(beforeStart)).toEqual([]);
  });

  it('AIR APU BLEED LEAK with the APU bleed valve not closed in flight: APU BLEED OFF, ENG 1 BLEED/STARTER INOP', () => {
    const notClosed = { ...normal, apuLeak: true, apuBleedPbOn: true, apuBleedValveOpen: true };
    expect(apuBleedLeakItems(notClosed).show[4]).toBe(true);
    expect(apuBleedLeakItems(notClosed).show[10]).toBe(false);
    expect(apuBleedLeakInopSys(notClosed)).toEqual(['260300002', '260300006', '800300001', '300300001']);
    expect(apuBleedLeakInopSys({ ...normal, apuLeak: true })).toEqual(['260300006']);
  });

  it('AIR PACK 1(2) LEAK: PACK OFF while a pack valve is open, isolated once both are closed', () => {
    const open = { ...normal, packLeak: [true, false] };
    expect(packLeakItems(open, 0)).toEqual({
      show: [true, false, false, false, false],
      checked: [false, true, false, false, false],
    });
    expect(packLeakInopSys(open, 0)).toEqual(['260300002', '800300001', '260300006', '210300009']);

    const isolated = { ...open, packValveOpen: [false, false, true, true] };
    expect(packLeakItems(isolated, 0).show).toEqual([false, false, false, false, true]);
    expect(packLeakInopSys(isolated, 0)).toEqual(['210300009']);
    expect(packLeakInopSys({ ...normal, packValveOpen: [true, true, true, false] }, 1)).toEqual(['210300010']);
  });

  it('AIR HOT AIR 1(2) LEAK and FWD CARGO DUCT LEAK: the temperature regulation INOP SYS and INFO', () => {
    const valve1Closed = { ...normal, hotAirValveOpen: [false, true] };
    expect(hotAirLeakItems(valve1Closed, 0).show).toEqual([false, true]);
    expect(hotAirLeakInopSys(valve1Closed, 0)).toEqual(['210300020', '210300018']);
    expect(hotAirLeakInfo(valve1Closed)).toEqual(['210200001', '210200003']);

    const valve2Closed = { ...normal, hotAirValveOpen: [true, false] };
    expect(hotAirLeakInopSys(valve2Closed, 1)).toEqual(['210300020', '210300019']);
    expect(hotAirLeakInfo(valve2Closed)).toEqual(['210200001']);

    expect(hotAirLeakInopSys({ ...normal, hotAirValveOpen: [false, false] }, 0)).toEqual(['210300023']);
    expect(hotAirLeakInopSys(normal, 1)).toEqual(['210300010']);
    expect(hotAirLeakItems({ ...normal, hotAirPbOn: [false, true] }, 0)).toEqual({
      show: [true, false],
      checked: [true, false],
    });
  });

  it('AIR LEAK DET FAULT: the line and INOP SYS of each duct, AIR LEAK DET for all of them', () => {
    const lost = LEAK_DETECTION_ZONES.map((zone) => zone === 'L_INR_WING' || zone === 'HOT_AIR_2');
    const some = { ...normal, leakDetectionLost: lost };
    expect(leakDetFaultItems(some).show).toEqual(lost);
    expect(leakDetFaultInopSys(some)).toEqual(['360300006', '360300013']);

    const all = { ...normal, leakDetectionLost: LEAK_DETECTION_ZONES.map(() => true) };
    expect(leakDetFaultItems(all).show.some((shown) => shown)).toBe(false);
    expect(leakDetFaultInopSys(all)).toEqual(['360300016']);
  });

  it('AIR XBLEED FAULT: MAN CTL ONLY, XBLEED AUTO, the failed valves', () => {
    const autoLost = { ...normal, xbleedAutoControlLost: [false, true, true] };
    expect(xbleedFaultItems(autoLost).show).toEqual([true, false]);
    expect(xbleedFaultInopSys(autoLost)).toEqual(['260300009', '260300008']);
    expect(xbleedFaultInfo(autoLost)).toEqual(['360200005']);

    const manualLost = { ...normal, xbleedManualControlLost: [true, true, true], xbleedSelectorAuto: false };
    expect(xbleedFaultItems(manualLost)).toEqual({ show: [false, true], checked: [false, false] });
    expect(xbleedFaultInfo(manualLost)).toEqual(['360200006']);

    expect(xbleedFaultInopSys({ ...normal, xbleedAbnormalPosition: [true, false, false] })).toEqual(['360300017']);
    expect(xbleedFaultInopSys({ ...normal, xbleedAbnormalPosition: [true, true, true] })).toEqual(['360300020']);
  });
});

describe('FwsBleedLeakAlerts entries', () => {
  const items = bleedLeakAbnormalItems(new BleedLeakAlerts());
  const keys = BLEED_LEAK_ALERT_KEYS;

  it('levels, flight phase inhibitions and SD page of the FCOM', () => {
    const level = (key: number) => items[key].failure;
    expect(level(keys.bleedLeak)).toBe(3);
    expect(items[keys.bleedLeak].flightPhaseInhib).toEqual([5, 6, 10]);
    for (const key of [...keys.hpValveNotOpen, keys.leakDetFault]) {
      expect(level(key)).toBe(1);
      expect(items[key].flightPhaseInhib).toEqual(BLEED_LEAK_ALERT_PHASE_INHIBITION.crewAwareness);
    }
    for (const key of [
      keys.apuBleedLeak,
      ...keys.engineBleedNotClosed,
      keys.fwdCargoDuctLeak,
      ...keys.hotAirLeak,
      ...keys.packLeak,
      keys.xbleedFault,
    ]) {
      expect(level(key)).toBe(2);
      expect(items[key].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    }
    for (const key of keys.bleedTempLo) {
      expect(level(key)).toBe(2);
      expect(items[key].flightPhaseInhib).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 11, 12]);
    }
    expect(Object.values(items).every((item) => item.sysPage === SdPages.Bleed)).toBe(true);
  });

  it('HP VLV NOT OPEN gives the INFO NO BLEED n AT LO ENG PWR', () => {
    expect(items[keys.hpValveNotOpen[3]].info?.([])).toEqual(['360200004']);
  });

  it('every alert key has its procedure, with as many lines as the alert shows', () => {
    const lineCount: [number, number][] = [
      [keys.apuBleedLeak, apuBleedLeakItems(normal).show.length],
      [keys.bleedLeak, items[keys.bleedLeak].whichItemsToShow().length],
      [keys.leakDetFault, leakDetFaultItems(normal).show.length],
      [keys.xbleedFault, xbleedFaultItems(normal).show.length],
    ];
    for (const [key, count] of lineCount) {
      expect(EcamAbnormalProcedures[key], `${key}`).toBeDefined();
      expect(EcamAbnormalProcedures[key].items.length, `${key}`).toBe(count);
    }
    const titleOf = (key: number) => EcamAbnormalProcedures[key].title;
    expect(titleOf(keys.engineBleedNotClosed[0])).toContain('ENG 1 BLEED NOT CLOSED');
    expect(titleOf(keys.bleedTempLo[3])).toContain('ENG BLEED TEMP LO ON BLEED 4');
    expect(titleOf(keys.fwdCargoDuctLeak)).toContain('FWD CARGO DUCT LEAK');
    expect(titleOf(keys.hotAirLeak[1])).toContain('HOT AIR 2 LEAK');
    expect(titleOf(keys.packLeak[1])).toContain('PACK 2 LEAK');
    for (const key of keys.hpValveNotOpen) {
      expect(EcamAbnormalProcedures[key], `${key}`).toBeDefined();
    }
  });

  it('every INOP SYS and INFO code exists', () => {
    const inputsWithEverything = {
      ...normal,
      apuBleedValveOpen: true,
      packPbOn: [false, false],
      hotAirValveOpen: [false, true],
      leakDetectionLost: LEAK_DETECTION_ZONES.map((zone) => zone !== 'APU'),
      xbleedAbnormalPosition: [true, true, true],
      xbleedAutoControlLost: [true, true, true],
      xbleedManualControlLost: [true, true, true],
    };
    const codes = [
      ...apuBleedLeakInopSys(inputsWithEverything),
      ...packLeakInopSys(inputsWithEverything, 1),
      ...hotAirLeakInopSys(inputsWithEverything, 0),
      ...hotAirLeakInfo(inputsWithEverything),
      ...leakDetFaultInopSys(inputsWithEverything),
      ...leakDetFaultInopSys({ ...normal, leakDetectionLost: LEAK_DETECTION_ZONES.map(() => true) }),
      ...xbleedFaultInopSys(inputsWithEverything),
      ...xbleedFaultInfo(inputsWithEverything),
      '360200001',
      '360200002',
      '360200003',
      '360200004',
      '360300009',
    ];
    for (const code of codes) {
      expect(
        ecamTables.some((table) => code in table),
        code,
      ).toBe(true);
    }
  });
});

describe('FwsBleedLeakAlerts inputs and wiring', () => {
  it('reads the bleed leak detection, valve and temperature L:vars of the systems WASM', () => {
    const values: { [name: string]: number } = {
      'L:A32NX_PNEU_R_INR_WING_LEAK': 1,
      'L:A32NX_PNEU_APU_BLEED_LEAK': 1,
      'L:A32NX_PNEU_PACK_2_LEAK': 1,
      'L:A32NX_PNEU_HOT_AIR_1_LEAK': 1,
      'L:A32NX_PNEU_FWD_CARGO_DUCT_LEAK': 1,
      'L:A32NX_PNEU_AFT_CARGO_LEAK_DET_FAULT': 1,
      'L:A32NX_PNEU_ENG_3_PR_VALVE_OPEN': 1,
      'L:A32NX_PNEU_ENG_3_PR_VALVE_DISAGREE': 1,
      'L:A32NX_PNEU_ENG_3_STARTER_VALVE_OPEN': 1,
      'L:A32NX_PNEU_ENG_4_HP_VALVE_NOT_OPEN': 1,
      'L:A32NX_PNEU_ENG_2_PRECOOLER_OUTLET_TEMPERATURE': 142.5,
      'L:A32NX_PNEU_XBLEED_VALVE_C_ABNORMAL_POSITION': 1,
      'L:A32NX_PNEU_XBLEED_VALVE_R_AUTO_CONTROL_LOST': 1,
      'L:A32NX_PNEU_XBLEED_VALVE_L_MANUAL_CONTROL_LOST': 1,
      'L:A32NX_APU_BLEED_AIR_VALVE_OPEN': 1,
      'L:A32NX_COND_PACK_2_FLOW_VALVE_2_IS_OPEN': 1,
    };
    const inputs = readBleedLeakAlertInputs((name) => values[name] ?? 0, normal);
    expect(inputs.wingLeak).toEqual([false, false, true, false]);
    expect([inputs.apuLeak, inputs.packLeak, inputs.hotAirLeak, inputs.fwdCargoDuctLeak]).toEqual([
      true,
      [false, true],
      [true, false],
      true,
    ]);
    expect(inputs.leakDetectionLost).toEqual(LEAK_DETECTION_ZONES.map((zone) => zone === 'AFT_CARGO'));
    expect([inputs.bleedValveOpen[2], inputs.bleedValveDisagree[2], inputs.starterValveOpen[2]]).toEqual([
      true,
      true,
      true,
    ]);
    expect(inputs.hpValveNotOpen).toEqual([false, false, false, true]);
    expect(inputs.bleedTemperature).toEqual([0, 142.5, 0, 0]);
    expect(inputs.xbleedAbnormalPosition).toEqual([false, true, false]);
    expect(inputs.xbleedAutoControlLost).toEqual([false, false, true]);
    expect(inputs.xbleedManualControlLost).toEqual([true, false, false]);
    expect(inputs.apuBleedValveOpen).toBe(true);
    expect(inputs.packValveOpen).toEqual([false, false, false, true]);
  });

  it('the L:vars are written by the pneumatic model', () => {
    const pneumatic = readFileSync(
      resolve(__dirname, '../../../../wasm/systems/a380_systems/src/pneumatic.rs'),
      'utf-8',
    );
    for (const name of [
      '"PNEU_ENG_{}_HP_VALVE_NOT_OPEN"',
      '"PNEU_XBLEED_VALVE_{}_ABNORMAL_POSITION"',
      '"PNEU_XBLEED_VALVE_{}_MANUAL_CONTROL_LOST"',
      '"PNEU_XBLEED_VALVE_{}_AUTO_CONTROL_LOST"',
      '"PNEU_{}_LEAK_DET_FAULT"',
      '"PNEU_ENG_{}_PRECOOLER_OUTLET_TEMPERATURE"',
      '"PNEU_ENG_{}_STARTER_VALVE_OPEN"',
    ]) {
      expect(pneumatic).toContain(name);
    }
    for (const zone of ['"ENG_{}"', '"{}_WING"', '"APU"', '"PACK_{}"', '"HOT_AIR_{}"', '"FWD_CARGO"', '"AFT_CARGO"']) {
      expect(pneumatic).toContain(zone);
    }
  });

  it('FwsCore updates the alerts every cycle and FwsAbnormalSensed lists them', () => {
    const { core, simVars } = createFws();
    const listed = bleedLeakAbnormalItems(core.bleedLeakAlerts);
    for (const key of Object.keys(listed).map(Number)) {
      const entry = core.abnormalSensed.ewdAbnormalSensed[key];
      expect(entry, `${key}`).toBeDefined();
      expect(entry.simVarIsActive).toBe(listed[key].simVarIsActive);
    }
    simVars.set('L:A32NX_PNEU_APU_BLEED_LEAK', 1);
    for (let cycle = 0; cycle < 5; cycle++) {
      runFwsCycle(core);
    }
    expect(core.bleedLeakAlerts.apuBleedLeak.get()).toBe(true);
  });
});
