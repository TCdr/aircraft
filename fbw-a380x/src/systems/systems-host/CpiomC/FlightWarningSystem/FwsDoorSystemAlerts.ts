// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X DOOR (ATA 52) alerts of the doors and slides management system (DSMS) and of the cockpit door:
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) ACTUATOR FAULT, FLIGHT LOCK FAULT, LATCH MONITORING FAULT,
 * POS DET FAULT and SLIDE FAULT, DOOR MAIN 1L(R) SLIDE LENGTHENING FAULT, DOOR POS DET FAULT,
 * DOOR RESIDUAL DIFF PRESS DET FAULT and DOOR CKPT DOOR EMER OPENING IN PROGRESS.
 *
 * The DSMS (systems-host Misc/DoorsAndSlidesManagement.ts) publishes the faults it detects and the doors whose position
 * it no longer knows; a door with an unknown position has no DOOR ... NOT CLOSED alert (DoorAlerts.ts).
 */

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import {
  COCKPIT_DOOR_VARS,
  doorFlags,
  DSMS_CHANNEL_COUNT,
  DSMS_VARS,
  PASSENGER_DOOR_COUNT,
} from '@shared/DoorsAndSlides';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';

/** Flight phases in which the alerts are inhibited */
const DOOR_SYSTEM_PHASE_INHIBITION = {
  ckptDoorEmerOpening: [3, 4, 5, 6],
  actuatorFault: [3, 4, 5, 6, 7, 9, 10],
  flightLockFault: [3, 4, 5, 6, 7, 9, 10],
  latchMonitoringFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  posDetFault: [4, 5, 6, 7, 9, 10],
  slideFault: [3, 4, 5, 6, 7, 9, 10],
  slideLengtheningFault: [3, 4, 5, 6, 7, 9, 10],
  doorPosDetFault: [3, 4, 5, 6, 7, 9, 10],
  residualDiffPressDetFault: [3, 4, 5, 6, 7, 8, 9, 10],
};

/** The DOOR ... SLIDE LENGTHENING FAULT doors: MAIN 1L and MAIN 1R */
const SLIDE_EXTENSION_DOOR_COUNT = 2;

/** What the FWS reads for these alerts; the per-door flags are in interactive point order */
export interface DoorSystemInputs {
  actuatorFault: boolean[];
  flightLockFault: boolean[];
  flightLockEngaged: boolean[];
  latchMonitoringFault: boolean[];
  ldcFault: boolean[];
  positionInvalid: boolean[];
  slideFault: boolean[];
  /** MAIN 1L, MAIN 1R */
  slideLengtheningFault: boolean[];
  dsmsChannelsFailed: number;
  residualPressureDetectionFault: boolean;
  ckptDoorEmerOpening: boolean;
}

/** @param read reads an L:var as a number (SimVar.GetSimVarValue(name, Number) in the sim) */
export function readDoorSystemInputs(read: (name: string) => number): DoorSystemInputs {
  return {
    actuatorFault: doorFlags(read(DSMS_VARS.actuatorFault)),
    flightLockFault: doorFlags(read(DSMS_VARS.flightLockFault)),
    flightLockEngaged: doorFlags(read(DSMS_VARS.flightLockEngaged)),
    latchMonitoringFault: doorFlags(read(DSMS_VARS.latchMonitoringFault)),
    ldcFault: doorFlags(read(DSMS_VARS.ldcFault)),
    positionInvalid: doorFlags(read(DSMS_VARS.positionInvalid)),
    slideFault: doorFlags(read(DSMS_VARS.slideFault)),
    slideLengtheningFault: doorFlags(read(DSMS_VARS.slideLengtheningFault), SLIDE_EXTENSION_DOOR_COUNT),
    dsmsChannelsFailed: read(DSMS_VARS.channelsFailed),
    residualPressureDetectionFault: read(DSMS_VARS.residualPressureDetectionFault) > 0,
    ckptDoorEmerOpening: read(COCKPIT_DOOR_VARS.emerOpeningInProgress) > 0,
  };
}

/** Left doors have an even interactive point, right doors an odd one */
function doorSide(door: number): 0 | 1 {
  return door % 2 === 0 ? 0 : 1;
}

/** One flag per alert, true while its triggering condition is met */
export interface DoorSystemAlertFlags {
  actuatorFault: boolean[];
  flightLockFault: boolean[];
  latchMonitoringFault: boolean[];
  posDetFault: boolean[];
  slideFault: boolean[];
  slideLengtheningFault: boolean[];
  doorPosDetFault: boolean;
  residualDiffPressDetFault: boolean;
  ckptDoorEmerOpening: boolean;
  /** The three DSMS channels are lost */
  allChannelsLost: boolean;
  /** All the LDCs of the left (0) or right (1) side are lost */
  sideLdcsLost: [boolean, boolean];
}

/**
 * The triggering conditions.
 * - DOOR POS DET FAULT: two or three DSMS channels lost, or all the LDCs of one side lost. With the three channels lost
 *   it inhibits the other DSMS door alerts, the NOT CLOSED alerts included (DoorAlerts.ts). Design choice: with all the LDCs of one side lost it also replaces the
 *   DOOR ... POS DET FAULT alerts of that side (its STATUS has L(R) DOORS POS DET for them).
 * - DOOR ... POS DET FAULT: the LDC of the door is failed, or two other faults are detected on the door.
 * - The other per-door alerts follow the faults the DSMS detects (it detects none on a door it does not monitor).
 * - DOOR CKPT DOOR EMER OPENING IN PROGRESS comes from the cockpit door locking system, not from the DSMS: the loss of
 *   the DSMS does not inhibit it.
 */
export function doorSystemAlertFlags(inputs: DoorSystemInputs): DoorSystemAlertFlags {
  const allChannelsLost = inputs.dsmsChannelsFailed >= DSMS_CHANNEL_COUNT;
  const sideLdcsLost: [boolean, boolean] = [0, 1].map((side) =>
    inputs.ldcFault.every((ldcFault, door) => doorSide(door) !== side || ldcFault),
  ) as [boolean, boolean];
  const notInhibited = (flags: boolean[]) => flags.map((flag) => flag && !allChannelsLost);
  const posDetFault = inputs.ldcFault.map((ldcFault, door) => {
    const otherFaults = [
      inputs.actuatorFault,
      inputs.flightLockFault,
      inputs.latchMonitoringFault,
      inputs.slideFault,
    ].filter((faults) => faults[door]).length;
    return (ldcFault || otherFaults >= 2) && !allChannelsLost && !sideLdcsLost[doorSide(door)];
  });
  return {
    actuatorFault: notInhibited(inputs.actuatorFault),
    flightLockFault: notInhibited(inputs.flightLockFault),
    latchMonitoringFault: notInhibited(inputs.latchMonitoringFault),
    posDetFault,
    slideFault: notInhibited(inputs.slideFault),
    slideLengtheningFault: notInhibited(inputs.slideLengtheningFault),
    doorPosDetFault: inputs.dsmsChannelsFailed >= 2 || sideLdcsLost[0] || sideLdcsLost[1],
    residualDiffPressDetFault: inputs.residualPressureDetectionFault && !allChannelsLost,
    ckptDoorEmerOpening: inputs.ckptDoorEmerOpening,
    allChannelsLost,
    sideLdcsLost,
  };
}

/** The state of these alerts in FwsCore, refreshed by update() every FWS cycle */
export class DoorSystemAlerts {
  public readonly actuatorFault = doorSubjects();

  public readonly flightLockFault = doorSubjects();

  public readonly latchMonitoringFault = doorSubjects();

  public readonly posDetFault = doorSubjects();

  public readonly slideFault = doorSubjects();

  public readonly slideLengtheningFault = Array.from({ length: SLIDE_EXTENSION_DOOR_COUNT }, () =>
    Subject.create(false),
  );

  public readonly doorPosDetFault = Subject.create(false);

  public readonly residualDiffPressDetFault = Subject.create(false);

  public readonly ckptDoorEmerOpening = Subject.create(false);

  /** The door position is not known: no DOOR ... NOT CLOSED alert for it */
  public readonly positionInvalid: boolean[] = new Array(PASSENGER_DOOR_COUNT).fill(false);

  /** The flight lock of each door locks the door handle */
  public readonly flightLockEngaged: boolean[] = new Array(PASSENGER_DOOR_COUNT).fill(false);

  public allChannelsLost = false;

  public sideLdcsLost: [boolean, boolean] = [false, false];

  public update(inputs: DoorSystemInputs): void {
    const flags = doorSystemAlertFlags(inputs);
    const setAll = (subjects: Subject<boolean>[], values: boolean[]) =>
      subjects.forEach((subject, index) => subject.set(values[index]));
    setAll(this.actuatorFault, flags.actuatorFault);
    setAll(this.flightLockFault, flags.flightLockFault);
    setAll(this.latchMonitoringFault, flags.latchMonitoringFault);
    setAll(this.posDetFault, flags.posDetFault);
    setAll(this.slideFault, flags.slideFault);
    setAll(this.slideLengtheningFault, flags.slideLengtheningFault);
    this.doorPosDetFault.set(flags.doorPosDetFault);
    this.residualDiffPressDetFault.set(flags.residualDiffPressDetFault);
    this.ckptDoorEmerOpening.set(flags.ckptDoorEmerOpening);
    inputs.positionInvalid.forEach((invalid, door) => (this.positionInvalid[door] = invalid));
    inputs.flightLockEngaged.forEach((engaged, door) => (this.flightLockEngaged[door] = engaged));
    this.allChannelsLost = flags.allChannelsLost;
    this.sideLdcsLost = flags.sideLdcsLost;
  }
}

function doorSubjects(): Subject<boolean>[] {
  return Array.from({ length: PASSENGER_DOOR_COUNT }, () => Subject.create(false));
}

/** The alert keys (EcamAbnormalSensedProcedures, ata46-49-52-56.ts) */
export const DOOR_SYSTEM_ALERT_KEYS = {
  ckptDoorEmerOpening: 520800035,
  /** + interactive point of the door */
  actuatorFault: 520800101,
  flightLockFault: 520800121,
  latchMonitoringFault: 520800141,
  posDetFault: 520800161,
  slideFault: 520800181,
  /** + 0 for MAIN 1L, + 1 for MAIN 1R */
  slideLengtheningFault: 520800201,
  doorPosDetFault: 520800203,
  residualDiffPressDetFault: 520800204,
};

/** The INOP SYS keys (EcamInopSys); the per-door keys are + interactive point of the door */
const INOP_SYS = {
  door: 520300001,
  flightLock: 520300021,
  slide: 520300041,
  slideLength: 520300061,
  doorPosDet: '520300063',
  sideDoorsPosDet: ['520300064', '520300065'],
  cabPressSys: '213300005',
  packs: '210300011',
};

const MAX_FL_100_LIMITATION = '210400001';

/** The aircraft state the procedure lines depend on */
export interface DoorSystemAircraftState {
  flightPhase: Subscribable<number>;
  aircraftOnGround: Subscribable<boolean>;
  /** Pressurization not available (CAB PRESS SYS FAULT) */
  pressSysFault: Subscribable<boolean>;
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param alerts the alert state (FwsCore.doorSystemAlerts)
 * @param aircraft the flight phase, ground and pressurization state
 */
export function doorSystemAbnormalItems(
  alerts: DoorSystemAlerts,
  aircraft: DoorSystemAircraftState,
): { [key: number]: EwdAbnormalItem } {
  const items: { [key: number]: EwdAbnormalItem } = {};
  const inFlight = () => !aircraft.aircraftOnGround.get();
  const packsAndCabPressNotAvail = () => aircraft.flightPhase.get() <= 3 && aircraft.pressSysFault.get();
  const packsAndCabPressInop = () =>
    packsAndCabPressNotAvail() ? [INOP_SYS.cabPressSys, INOP_SYS.packs] : ([] as string[]);

  items[DOOR_SYSTEM_ALERT_KEYS.ckptDoorEmerOpening] = {
    flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.ckptDoorEmerOpening,
    simVarIsActive: alerts.ckptDoorEmerOpening,
    notActiveWhenItemActive: [],
    // Local light and emergency buzzer, no master light
    whichItemsToShow: () => [true],
    whichItemsChecked: () => [false],
    failure: 1,
    sysPage: SdPages.Video,
  };

  // ECAM and PFD limitation once the crew confirms ABNORM CAB V/S (line 1) in flight
  const posDetMaxFlLimitation = (checked: boolean[]) => (checked[1] && inFlight() ? [MAX_FL_100_LIMITATION] : []);

  for (let door = 0; door < PASSENGER_DOOR_COUNT; door++) {
    const doorInop = (INOP_SYS.door + door).toString();

    items[DOOR_SYSTEM_ALERT_KEYS.actuatorFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.actuatorFault,
      simVarIsActive: alerts.actuatorFault[door],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      inopSysApprLdg: () => [doorInop],
      failure: 2,
      sysPage: SdPages.None,
    };

    const flightLockFailedLocked = () => alerts.flightLockEngaged[door];
    const flightLockNotAvail = () => !flightLockFailedLocked() && aircraft.aircraftOnGround.get();
    items[DOOR_SYSTEM_ALERT_KEYS.flightLockFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.flightLockFault,
      simVarIsActive: alerts.flightLockFault[door],
      notActiveWhenItemActive: [],
      // FLIGHT LOCK ENGAGED, CABIN CREW ADVISE, FLIGHT LOCK NOT AVAIL
      whichItemsToShow: () => [flightLockFailedLocked(), flightLockFailedLocked(), flightLockNotAvail()],
      whichItemsChecked: () => [false, false, false],
      inopSysAllPhases: () => (flightLockNotAvail() ? [(INOP_SYS.flightLock + door).toString()] : []),
      inopSysApprLdg: () => (flightLockFailedLocked() ? [doorInop] : []),
      failure: 2,
      sysPage: SdPages.None,
    };

    items[DOOR_SYSTEM_ALERT_KEYS.latchMonitoringFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.latchMonitoringFault,
      simVarIsActive: alerts.latchMonitoringFault[door],
      notActiveWhenItemActive: [],
      // Crew awareness: no audio, no master light, no STATUS
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
    };

    items[DOOR_SYSTEM_ALERT_KEYS.posDetFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.posDetFault,
      simVarIsActive: alerts.posDetFault[door],
      notActiveWhenItemActive: [],
      // PACK 1+2 & CAB PRESS NOT AVAIL, IF ABNORM CAB V/S and its 5 lines
      whichItemsToShow: () => [
        packsAndCabPressNotAvail(),
        inFlight(),
        inFlight(),
        inFlight(),
        inFlight(),
        inFlight(),
        inFlight(),
      ],
      whichItemsChecked: () => [false, false, false, false, false, false, false],
      limitationsAllPhases: posDetMaxFlLimitation,
      limitationsPfd: posDetMaxFlLimitation,
      inopSysAllPhases: packsAndCabPressInop,
      inopSysApprLdg: () => [doorInop],
      failure: 2,
      sysPage: SdPages.Door,
    };

    items[DOOR_SYSTEM_ALERT_KEYS.slideFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.slideFault,
      simVarIsActive: alerts.slideFault[door],
      notActiveWhenItemActive: [],
      // Design choice: the loss of the protection against inadvertent slide inflation is not simulated (no
      // PROTECTION LOST line): the flyPad failure is a slide not ready or failed
      whichItemsToShow: () => [false, true],
      whichItemsChecked: () => [false, false],
      inopSysApprLdg: () => [(INOP_SYS.slide + door).toString()],
      failure: 2,
      sysPage: SdPages.Door,
    };
  }

  alerts.slideLengtheningFault.forEach((fault, door) => {
    items[DOOR_SYSTEM_ALERT_KEYS.slideLengtheningFault + door] = {
      flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.slideLengtheningFault,
      simVarIsActive: fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      inopSysApprLdg: () => [(INOP_SYS.slideLength + door).toString()],
      failure: 2,
      sysPage: SdPages.None,
    };
  });

  const doorPosDetCabinVsShown = () =>
    inFlight() && (alerts.allChannelsLost || alerts.sideLdcsLost[0] || alerts.sideLdcsLost[1]);
  const doorPosDetResidualCheckShown = () => !inFlight() && alerts.allChannelsLost;
  // ABNORM CAB V/S is line 4 of DOOR POS DET FAULT
  const doorPosDetMaxFlLimitation = (checked: boolean[]) =>
    checked[4] && doorPosDetCabinVsShown() ? [MAX_FL_100_LIMITATION] : [];
  items[DOOR_SYSTEM_ALERT_KEYS.doorPosDetFault] = {
    flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.doorPosDetFault,
    simVarIsActive: alerts.doorPosDetFault,
    notActiveWhenItemActive: [],
    // PACK 1+2 & CAB PRESS NOT AVAIL, BEFORE OPENING ANY CABIN DOOR with its 2 lines, IF ABNORM CAB V/S and its 5 lines
    whichItemsToShow: () => [
      packsAndCabPressNotAvail(),
      doorPosDetResidualCheckShown(),
      doorPosDetResidualCheckShown(),
      doorPosDetResidualCheckShown(),
      doorPosDetCabinVsShown(),
      doorPosDetCabinVsShown(),
      doorPosDetCabinVsShown(),
      doorPosDetCabinVsShown(),
      doorPosDetCabinVsShown(),
      doorPosDetCabinVsShown(),
    ],
    whichItemsChecked: () => [false, false, false, false, false, false, false, false, false, false],
    limitationsAllPhases: doorPosDetMaxFlLimitation,
    limitationsPfd: doorPosDetMaxFlLimitation,
    inopSysAllPhases: () => [...packsAndCabPressInop(), ...(alerts.allChannelsLost ? [INOP_SYS.doorPosDet] : [])],
    inopSysApprLdg: () => INOP_SYS.sideDoorsPosDet.filter((_, side) => alerts.sideLdcsLost[side]),
    failure: 2,
    // Design choice: always the DOOR/OXY page (the real FWS does not call it with only two DSMS channels lost)
    sysPage: SdPages.Door,
  };

  items[DOOR_SYSTEM_ALERT_KEYS.residualDiffPressDetFault] = {
    flightPhaseInhib: DOOR_SYSTEM_PHASE_INHIBITION.residualDiffPressDetFault,
    simVarIsActive: alerts.residualDiffPressDetFault,
    notActiveWhenItemActive: [],
    // BEFORE OPENING ANY CABIN DOOR, RESIDUAL DIFF PRESS CHECK, CABIN CREW ADVISE
    whichItemsToShow: () => [true, true, true],
    whichItemsChecked: () => [false, false, false],
    failure: 2,
    sysPage: SdPages.Press,
  };

  return items;
}
