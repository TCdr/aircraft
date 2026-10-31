// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { COCKPIT_DOOR_VARS, DSMS_VARS } from '@shared/DoorsAndSlides';
import { EcamAbnormalProcedures, EcamInopSys } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { CABIN_DOORS, cargoDoorLockedVariable } from './DoorAlerts';
import {
  DOOR_SYSTEM_ALERT_KEYS,
  doorSystemAbnormalItems,
  doorSystemAlertFlags,
  DoorSystemAlerts,
  DoorSystemInputs,
  readDoorSystemInputs,
} from './FwsDoorSystemAlerts';
import { createFws, runFwsCycle, procedureItemNames } from './FwsSpecFixture';

const ESCAPE = String.fromCharCode(27);

/** Text of an EcamInopSys line, without its ECAM colour code */
function inopSysText(key: string): string | undefined {
  return EcamInopSys[key]?.replace(new RegExp(`^${ESCAPE}<\\d+m`), '').trim();
}

const titleOf = (key: number) =>
  ['\x1b<4m', '\x1b4m', '\x1bm'].reduce((title, code) => title.split(code).join(''), EcamAbnormalProcedures[key].title);

function noFault(): DoorSystemInputs {
  const doors = () => new Array(16).fill(false);
  return {
    actuatorFault: doors(),
    flightLockFault: doors(),
    flightLockEngaged: doors(),
    latchMonitoringFault: doors(),
    ldcFault: doors(),
    positionInvalid: doors(),
    slideFault: doors(),
    slideLengtheningFault: [false, false],
    dsmsChannelsFailed: 0,
    residualPressureDetectionFault: false,
    ckptDoorEmerOpening: false,
  };
}

function setup(inputs: DoorSystemInputs, onGround = false, flightPhase = 8, pressSysFault = false) {
  const alerts = new DoorSystemAlerts();
  alerts.update(inputs);
  const aircraft = {
    flightPhase: Subject.create(flightPhase),
    aircraftOnGround: Subject.create(onGround),
    pressSysFault: Subject.create(pressSysFault),
  };
  return { alerts, aircraft, items: doorSystemAbnormalItems(alerts, aircraft) };
}

const MAIN_2L = 2;

describe('DOOR alerts of the DSMS: inputs', () => {
  it('reads the DSMS bit fields, bit n = interactive point n, and the cockpit door L:var', () => {
    const values: Record<string, number> = {
      [DSMS_VARS.actuatorFault]: 0b101,
      [DSMS_VARS.slideFault]: 1 << 15,
      [DSMS_VARS.slideLengtheningFault]: 0b10,
      [DSMS_VARS.channelsFailed]: 2,
      [DSMS_VARS.residualPressureDetectionFault]: 1,
      [COCKPIT_DOOR_VARS.emerOpeningInProgress]: 1,
    };
    const inputs = readDoorSystemInputs((name) => values[name] ?? 0);
    expect(inputs.actuatorFault.map((fault, door) => (fault ? door : -1)).filter((door) => door >= 0)).toEqual([0, 2]);
    expect(inputs.slideFault[15]).toBe(true);
    expect(inputs.slideLengtheningFault).toEqual([false, true]);
    expect(inputs.dsmsChannelsFailed).toBe(2);
    expect(inputs.residualPressureDetectionFault).toBe(true);
    expect(inputs.ckptDoorEmerOpening).toBe(true);
    expect(inputs.ldcFault.every((fault) => !fault)).toBe(true);
  });
});

describe('DOOR alerts of the DSMS: triggering conditions', () => {
  it('raises nothing without a fault', () => {
    const flags = doorSystemAlertFlags(noFault());
    expect(flags.posDetFault.some((fault) => fault) || flags.doorPosDetFault || flags.residualDiffPressDetFault).toBe(
      false,
    );
  });

  it('DOOR ... POS DET FAULT: a failed LDC, or two other faults on the same door', () => {
    const inputs = noFault();
    inputs.ldcFault[MAIN_2L] = true;
    inputs.actuatorFault[5] = true;
    inputs.slideFault[5] = true;
    inputs.latchMonitoringFault[7] = true;
    const flags = doorSystemAlertFlags(inputs);
    expect(flags.posDetFault.map((fault, door) => (fault ? door : -1)).filter((door) => door >= 0)).toEqual([
      MAIN_2L,
      5,
    ]);
    // the two faults keep their own alerts
    expect(flags.actuatorFault[5] && flags.slideFault[5] && flags.latchMonitoringFault[7]).toBe(true);
    expect(flags.doorPosDetFault).toBe(false);
  });

  it('DOOR POS DET FAULT: all the LDCs of one side, which replaces their DOOR ... POS DET FAULT alerts', () => {
    const inputs = noFault();
    inputs.ldcFault = inputs.ldcFault.map((_, door) => door % 2 === 0);
    inputs.ldcFault[1] = true;
    const flags = doorSystemAlertFlags(inputs);
    expect(flags.doorPosDetFault).toBe(true);
    expect(flags.sideLdcsLost).toEqual([true, false]);
    expect(flags.posDetFault.map((fault, door) => (fault ? door : -1)).filter((door) => door >= 0)).toEqual([1]);
  });

  it('DOOR POS DET FAULT: two DSMS channels lost; the other alerts stay', () => {
    const inputs = noFault();
    inputs.dsmsChannelsFailed = 1;
    expect(doorSystemAlertFlags(inputs).doorPosDetFault).toBe(false);
    inputs.dsmsChannelsFailed = 2;
    inputs.actuatorFault[3] = true;
    inputs.residualPressureDetectionFault = true;
    const flags = doorSystemAlertFlags(inputs);
    expect(flags.doorPosDetFault).toBe(true);
    expect(flags.actuatorFault[3]).toBe(true);
    expect(flags.residualDiffPressDetFault).toBe(true);
  });

  it('three DSMS channels lost: DOOR POS DET FAULT inhibits the other DSMS alerts, not the cockpit door one', () => {
    const inputs = noFault();
    inputs.dsmsChannelsFailed = 3;
    inputs.ldcFault[0] = true;
    inputs.flightLockFault[4] = true;
    inputs.slideLengtheningFault = [true, false];
    inputs.residualPressureDetectionFault = true;
    inputs.ckptDoorEmerOpening = true;
    const flags = doorSystemAlertFlags(inputs);
    expect(flags.doorPosDetFault).toBe(true);
    expect(flags.allChannelsLost).toBe(true);
    expect([
      ...flags.posDetFault,
      ...flags.flightLockFault,
      ...flags.slideLengtheningFault,
      flags.residualDiffPressDetFault,
    ]).not.toContain(true);
    expect(flags.ckptDoorEmerOpening).toBe(true);
  });
});

describe('DOOR alerts of the DSMS: ECAM procedures', () => {
  const { items } = setup(noFault());
  const keys = Object.keys(items).map(Number);

  it('has the titles of the 16 passenger doors', () => {
    const k = DOOR_SYSTEM_ALERT_KEYS;
    CABIN_DOORS.forEach((door, index) => {
      expect(titleOf(k.actuatorFault + index)).toBe(`DOOR ${door} ACTUATOR FAULT`);
      expect(titleOf(k.flightLockFault + index)).toBe(`DOOR ${door} FLIGHT LOCK FAULT`);
      expect(titleOf(k.latchMonitoringFault + index)).toBe(`DOOR ${door} LATCH MONITORING FAULT`);
      expect(titleOf(k.posDetFault + index)).toBe(`DOOR ${door} POS DET FAULT`);
      expect(titleOf(k.slideFault + index)).toBe(`DOOR ${door} SLIDE FAULT`);
    });
    expect(titleOf(k.slideLengtheningFault)).toBe('DOOR MAIN 1L SLIDE LENGTHENING FAULT');
    expect(titleOf(k.slideLengtheningFault + 1)).toBe('DOOR MAIN 1R SLIDE LENGTHENING FAULT');
    expect(titleOf(k.doorPosDetFault)).toBe('DOOR POS DET FAULT');
    expect(titleOf(k.residualDiffPressDetFault)).toBe('DOOR RESIDUAL DIFF PRESS DET FAULT');
    expect(titleOf(k.ckptDoorEmerOpening)).toBe('DOOR CKPT DOOR EMER OPENING IN PROGRESS');
    expect(keys).toHaveLength(16 * 5 + 2 + 3);
  });

  it('gives each procedure line a display and a check flag', () => {
    for (const key of keys) {
      const lines = EcamAbnormalProcedures[key].items.length;
      expect(items[key].whichItemsToShow(), `${key}`).toHaveLength(lines);
      expect(items[key].whichItemsChecked(), `${key}`).toHaveLength(lines);
    }
  });

  it('uses the flight phase inhibitions of each alert', () => {
    const k = DOOR_SYSTEM_ALERT_KEYS;
    expect(items[k.ckptDoorEmerOpening].flightPhaseInhib).toEqual([3, 4, 5, 6]);
    expect(items[k.actuatorFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[k.flightLockFault + 15].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[k.latchMonitoringFault].flightPhaseInhib).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(items[k.posDetFault].flightPhaseInhib).toEqual([4, 5, 6, 7, 9, 10]);
    expect(items[k.slideFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[k.slideLengtheningFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[k.doorPosDetFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 9, 10]);
    expect(items[k.residualDiffPressDetFault].flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('has a master caution except LATCH MONITORING FAULT and EMER OPENING IN PROGRESS, and their SD pages', () => {
    const k = DOOR_SYSTEM_ALERT_KEYS;
    const levelOneKeys = [k.ckptDoorEmerOpening, ...CABIN_DOORS.map((_, door) => k.latchMonitoringFault + door)];
    for (const key of keys) {
      expect(items[key].failure, `${key}`).toBe(levelOneKeys.includes(key) ? 1 : 2);
    }
    expect(items[k.ckptDoorEmerOpening].sysPage).toBe(SdPages.Video);
    expect(items[k.posDetFault].sysPage).toBe(SdPages.Door);
    expect(items[k.slideFault].sysPage).toBe(SdPages.Door);
    expect(items[k.doorPosDetFault].sysPage).toBe(SdPages.Door);
    expect(items[k.residualDiffPressDetFault].sysPage).toBe(SdPages.Press);
    expect(items[k.actuatorFault].sysPage).toBe(SdPages.None);
  });
});

describe('DOOR alerts of the DSMS: lines and STATUS', () => {
  const k = DOOR_SYSTEM_ALERT_KEYS;
  const inop = (lines: (string | null)[] | undefined) => (lines ?? []).map((key) => inopSysText(key as string));

  it('ACTUATOR FAULT: CABIN CREW ADVISE, INOP SYS APPR & LDG DOOR <\\door>', () => {
    const { items } = setup(noFault());
    expect(items[k.actuatorFault + 10].whichItemsToShow()).toEqual([true]);
    expect(inop(items[k.actuatorFault + 10].inopSysApprLdg?.([]))).toEqual(['DOOR UPPER 1L']);
  });

  it('FLIGHT LOCK FAULT failed locked: FLIGHT LOCK ENGAGED, CABIN CREW ADVISE, INOP SYS APPR & LDG DOOR <\\door>', () => {
    const inputs = noFault();
    inputs.flightLockFault[MAIN_2L] = true;
    inputs.flightLockEngaged[MAIN_2L] = true;
    const item = setup(inputs).items[k.flightLockFault + MAIN_2L];
    expect(item.whichItemsToShow()).toEqual([true, true, false]);
    expect(inop(item.inopSysApprLdg?.([]))).toEqual(['DOOR MAIN 2L']);
    expect(item.inopSysAllPhases?.([])).toEqual([]);
  });

  it('FLIGHT LOCK FAULT failed unlocked: FLIGHT LOCK NOT AVAIL on ground, INOP SYS <\\door> FLT LOCK', () => {
    const inputs = noFault();
    inputs.flightLockFault[MAIN_2L] = true;
    const onGround = setup(inputs, true, 1).items[k.flightLockFault + MAIN_2L];
    expect(onGround.whichItemsToShow()).toEqual([false, false, true]);
    expect(inop(onGround.inopSysAllPhases?.([]))).toEqual(['MAIN 2L FLT LOCK']);
    const inFlight = setup(inputs, false).items[k.flightLockFault + MAIN_2L];
    expect(inFlight.whichItemsToShow()).toEqual([false, false, false]);
    expect(inFlight.inopSysAllPhases?.([])).toEqual([]);
  });

  it('POS DET FAULT: PACK 1+2 & CAB PRESS NOT AVAIL in phases 1-3 without pressurization, IF ABNORM CAB V/S in flight', () => {
    const inputs = noFault();
    inputs.ldcFault[MAIN_2L] = true;
    const ground = setup(inputs, true, 2, true).items[k.posDetFault + MAIN_2L];
    expect(ground.whichItemsToShow()).toEqual([true, false, false, false, false, false, false]);
    expect(inop(ground.inopSysAllPhases?.([]))).toEqual(['CAB PRESS SYS', 'PACK 1+2']);
    expect(inop(ground.inopSysApprLdg?.([]))).toEqual(['DOOR MAIN 2L']);
    expect(setup(inputs, true, 1, true).items[k.posDetFault + MAIN_2L].whichItemsToShow()[0]).toBe(true);
    expect(setup(inputs, false, 4, true).items[k.posDetFault + MAIN_2L].whichItemsToShow()[0]).toBe(false);
    expect(setup(inputs, true, 2, false).items[k.posDetFault + MAIN_2L].whichItemsToShow()[0]).toBe(false);
    const cruise = setup(inputs, false, 8, true).items[k.posDetFault + MAIN_2L];
    expect(cruise.whichItemsToShow()).toEqual([false, true, true, true, true, true, true]);
    expect(cruise.inopSysAllPhases?.([])).toEqual([]);
    expect(cruise.limitationsAllPhases?.([false, true])).toEqual(['210400001']);
    expect(cruise.limitationsPfd?.([false, false])).toEqual([]);
  });

  it('SLIDE FAULT: CABIN CREW ADVISE, INOP SYS APPR & LDG <\\door> SLIDE; SLIDE LENGTHENING: <\\door> SLIDE LENGTH', () => {
    const { items } = setup(noFault());
    expect(items[k.slideFault + 9].whichItemsToShow()).toEqual([false, true]);
    expect(inop(items[k.slideFault + 9].inopSysApprLdg?.([]))).toEqual(['MAIN 5R SLIDE']);
    expect(inop(items[k.slideLengtheningFault + 1].inopSysApprLdg?.([]))).toEqual(['MAIN 1R SLIDE LENGTH']);
  });

  it('DOOR POS DET FAULT, three channels lost on ground: RESIDUAL DIFF PRESS CHECK, INOP SYS DOOR POS DET', () => {
    const inputs = noFault();
    inputs.dsmsChannelsFailed = 3;
    const item = setup(inputs, true, 12).items[k.doorPosDetFault];
    expect(item.whichItemsToShow()).toEqual([false, true, true, true, false, false, false, false, false, false]);
    expect(inop(item.inopSysAllPhases?.([]))).toEqual(['DOOR POS DET']);
  });

  it('DOOR POS DET FAULT, right LDCs lost in flight: IF ABNORM CAB V/S, INOP SYS APPR & LDG R DOORS POS DET', () => {
    const inputs = noFault();
    inputs.ldcFault = inputs.ldcFault.map((_, door) => door % 2 === 1);
    const item = setup(inputs, false, 8).items[k.doorPosDetFault];
    expect(item.whichItemsToShow()).toEqual([false, false, false, false, true, true, true, true, true, true]);
    expect(inop(item.inopSysApprLdg?.([]))).toEqual(['R DOORS POS DET']);
    expect(item.limitationsAllPhases?.([false, false, false, false, true])).toEqual(['210400001']);
  });

  it('DOOR POS DET FAULT, two channels lost: no line, no STATUS', () => {
    const inputs = noFault();
    inputs.dsmsChannelsFailed = 2;
    const item = setup(inputs, false, 8).items[k.doorPosDetFault];
    expect(item.whichItemsToShow().some((shown) => shown)).toBe(false);
    expect(item.inopSysAllPhases?.([])).toEqual([]);
    expect(item.inopSysApprLdg?.([])).toEqual([]);
  });

  it('RESIDUAL DIFF PRESS DET FAULT: BEFORE OPENING ANY CABIN DOOR, RESIDUAL DIFF PRESS CHECK, CABIN CREW ADVISE', () => {
    const { items } = setup(noFault());
    const lines = procedureItemNames(k.residualDiffPressDetFault);
    expect(lines).toEqual(['BEFORE OPENING ANY CABIN DOOR:', 'RESIDUAL DIFF PRESS', 'CABIN CREW']);
    expect(items[k.residualDiffPressDetFault].whichItemsToShow()).toEqual([true, true, true]);
  });

  it('CKPT DOOR EMER OPENING IN PROGRESS: CKPT DOOR LOCK AS RQRD', () => {
    const line = EcamAbnormalProcedures[k.ckptDoorEmerOpening].items[0];
    expect([line.name, 'labelNotCompleted' in line ? line.labelNotCompleted : undefined]).toEqual([
      'CKPT DOOR',
      'LOCK AS RQRD',
    ]);
  });
});

describe('DOOR alerts of the DSMS: state for the NOT CLOSED alerts', () => {
  it('keeps the doors of unknown position and the loss of the three DSMS channels', () => {
    const inputs = noFault();
    inputs.positionInvalid[MAIN_2L] = true;
    inputs.dsmsChannelsFailed = 3;
    const { alerts } = setup(inputs);
    expect(alerts.positionInvalid.map((invalid, door) => (invalid ? door : -1)).filter((door) => door >= 0)).toEqual([
      MAIN_2L,
    ]);
    expect(alerts.allChannelsLost).toBe(true);
  });
});

describe('DOOR alerts of the DSMS: wiring', () => {
  it('lists the alerts in the FWS table, driven by the alert state of the core', () => {
    const { core } = createFws();
    const listed = doorSystemAbnormalItems(core.doorSystemAlerts, core);
    for (const key of Object.keys(listed).map(Number)) {
      expect(core.abnormalSensed.ewdAbnormalSensed[key], `${key}`).toBeDefined();
    }
    expect(core.abnormalSensed.ewdAbnormalSensed[DOOR_SYSTEM_ALERT_KEYS.doorPosDetFault].simVarIsActive).toBe(
      core.doorSystemAlerts.doorPosDetFault,
    );
  });

  it('removes NOT CLOSED of a door with an unknown position', () => {
    const { core, simVars } = createFws();
    simVars.set(`INTERACTIVE POINT OPEN:${MAIN_2L}`, 1);
    runFwsCycle(core);
    expect(core.cabinDoorNotClosed[MAIN_2L].get()).toBe(true);

    simVars.set(DSMS_VARS.positionInvalid, 1 << MAIN_2L);
    runFwsCycle(core);
    expect(core.cabinDoorNotClosed[MAIN_2L].get()).toBe(false);
  });

  it('removes NOT CLOSED of the cargo doors when the three DSMS channels are lost', () => {
    const { core, simVars } = createFws();
    simVars.set(cargoDoorLockedVariable('FWD'), 0);
    runFwsCycle(core);
    expect(core.cargoDoorNotClosed[0].get()).toBe(true);

    simVars.set(DSMS_VARS.channelsFailed, 3);
    runFwsCycle(core);
    expect(core.cargoDoorNotClosed[0].get()).toBe(false);
  });
});
