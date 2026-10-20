// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X L/G and STEER (ATA 32) alerts of the landing gear configuration monitoring and of the steering equipment.
 *
 * The Rust model (a380_systems hydraulic/gear_steering_monitoring.rs and the SCS of brake_steer_faults.rs) gives the
 * uplock, bogie position, gravity extension and retraction faults, the nose wheel angle limit, the unlocked BWS and
 * the pedal steering fault; the retraction fault, the uplock and bogie faults and the unlocked BWS keep the gears down.
 * The oleo pressure monitoring, the ground/flight computation, the tillers, the steering LEHGS fluid, the tow switch
 * disconnection and the steering selector valves are not modelled: their flyPad failures set the FWS conditions.
 */

import { NXLogicConfirmNode, NXLogicMemoryNode } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { A380Failure } from '@failures';
import { SdPages } from '@shared/EcamSystemPages';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';
import { LeverRecycleMonitor } from './FwsGearAlerts';

/** The gears of the oleo pressure lines, in the order of their ECAM lines: nose, L wing, R wing, L body, R body */
const OLEO_PRESSURE_ABNORMAL_FAILURES = [
  A380Failure.GearOleoPressureAbnormalNose,
  A380Failure.GearOleoPressureAbnormalLeftWing,
  A380Failure.GearOleoPressureAbnormalRightWing,
  A380Failure.GearOleoPressureAbnormalLeftBody,
  A380Failure.GearOleoPressureAbnormalRightBody,
];
const OLEO_PRESSURE_MONITORING_FAILURES = [
  A380Failure.GearOleoPressureMonitoringNose,
  A380Failure.GearOleoPressureMonitoringLeftWing,
  A380Failure.GearOleoPressureMonitoringRightWing,
  A380Failure.GearOleoPressureMonitoringLeftBody,
  A380Failure.GearOleoPressureMonitoringRightBody,
];

/** L:A32NX_STEERING_NWS_MODE */
const NWS_MODE_NORMAL = 1;
const NWS_MODE_ALTERNATE = 2;
/** The sim PUSHBACK STATE without pushback */
const NO_PUSHBACK_STATE = 3;
/** L:FSDT_GSX_DEPARTURE_STATE while GSX performs the pushback */
const GSX_PUSHBACK_IN_PROGRESS = 5;
/** The BWS steers below 30 kt of ground speed only */
const BWS_MAX_GROUND_SPEED_KT = 30;
/**
 * Design choice: no published time. N/W STEER NOT DISC is confirmed for 3 s, so the short gap between the start of a
 * pushback and the tow pin insertion by the ground crew (GSX) does not flash it.
 */
const NOT_DISC_CONFIRM_TIME_S = 3;

/** EcamLimitations, EcamInopSys and EcamInfos keys of these procedures */
const MAX_SPEED_250 = '260400002';
const NO_LG_RETRACTION = '320400006';
const LG_KEEP_DOWN = '320400010';
const INOP_LG_RETRACTION = '320300013';
const INOP_BW_STEER = '320300014';
const INOP_CAPT_STEER_TILLER = '320300015';
const INOP_FO_STEER_TILLER = '320300016';
const INOP_NW_STEER_DISC = '320300018';
const INOP_PEDAL_STEER_CTL = '320300021';
const INOP_OLEO_PRESS_MONIT_SYS = '320300035';
const INFO_FUEL_CONSUMPT_FMS_PRED = '280200003';
const INFO_NW_STEER_POWERED = '320200020';
const INFO_TAXI_WITH_CARE = ['800200003', '800200004', '800200005'];

/** The flight phases in which the aircraft inhibits each alert */
export const GEAR_STEERING_PHASE_INHIBITION = {
  abnormOleoPress: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  bogiePositionFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  gearUplockFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  grvtyExtnFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  oleoPressMonitoringFault: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  retractionFault: [4, 5, 8, 9, 10, 11],
  weightOnWheelsFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  altnSteerSysHot: [3, 4, 5, 6, 7, 8, 9, 10],
  bwSteerNotLocked: [4, 5, 6, 7, 10],
  steerTillerFault: [3, 4, 5, 6, 7, 9, 10],
  nwSteerAngleLimitExceeded: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  nwSteerDiscFault: [3, 4, 5, 6, 7, 9, 10],
  nwSteerNotDisc: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  pedalSteerCtlFault: [4, 5, 6, 7, 9, 10],
  steerSelVlvJammedOpen: [3, 4, 5, 6, 7, 8, 9, 10],
};

/** The landing gear and steering system signals of these alerts */
export interface GearSteeringSystemInputs {
  uplockFault: boolean;
  bogiePositionFault: boolean;
  gravityExtensionFault: boolean;
  /** The LGCIS keep the gears down (the lever is up out of the retraction configuration) */
  retractionInhibited: boolean;
  retractionFault: boolean;
  weightOnWheelsFault: boolean;
  /** Per gear, in the order of OLEO_PRESSURE_ABNORMAL_FAILURES */
  oleoPressureAbnormal: boolean[];
  oleoPressureMonitoringFault: boolean[];
  nwsAngleLimitExceeded: boolean;
  bwsNotLocked: boolean;
  pedalSteeringFault: boolean;
  captTillerFault: boolean;
  foTillerFault: boolean;
  lehgsOverheat: boolean;
  nwsDisconnectionFault: boolean;
  normalSelectorValveJammedOpen: boolean;
  alternateSelectorValveJammedOpen: boolean;
  bwsSelectorValveJammedOpen: boolean;
  /** L:A32NX_STEERING_NWS_MODE: 0 off, 1 normal, 2 alternate */
  nwsMode: number;
  /** The TOW sw is in the towing position (the N/W STEER DISC memo) */
  towPinInserted: boolean;
  /** A tug pushes or tows the aircraft (sim pushback or GSX pushback) */
  towing: boolean;
}

/**
 * Reads the system signals.
 * @param read reads a simvar as a number
 * @param isFailureActive whether a flyPad failure is active
 * @returns the signals
 */
export function readGearSteeringSystemInputs(
  read: (name: string) => number,
  isFailureActive: (failure: number) => boolean,
): GearSteeringSystemInputs {
  return {
    uplockFault: read('L:A32NX_LG_UPLOCK_FAULT') > 0,
    bogiePositionFault: read('L:A32NX_LG_BOGIE_POSITION_FAULT') > 0,
    gravityExtensionFault: read('L:A32NX_LG_GRVTY_EXTN_FAULT') > 0,
    retractionInhibited: read('L:A32NX_LG_RETRACTION_INHIBITED') > 0,
    retractionFault: read('L:A32NX_LG_RETRACTION_FAULT') > 0,
    weightOnWheelsFault: isFailureActive(A380Failure.GearWeightOnWheels),
    oleoPressureAbnormal: OLEO_PRESSURE_ABNORMAL_FAILURES.map(isFailureActive),
    oleoPressureMonitoringFault: OLEO_PRESSURE_MONITORING_FAILURES.map(isFailureActive),
    nwsAngleLimitExceeded: read('L:A32NX_STEERING_NWS_ANGLE_LIMIT_EXCEEDED') > 0,
    bwsNotLocked: read('L:A32NX_STEERING_BWS_NOT_LOCKED') > 0,
    pedalSteeringFault: read('L:A32NX_STEERING_PEDAL_CTL_FAULT') > 0,
    captTillerFault: isFailureActive(A380Failure.SteeringCaptTiller),
    foTillerFault: isFailureActive(A380Failure.SteeringFoTiller),
    lehgsOverheat: isFailureActive(A380Failure.SteeringLehgsOverheat),
    nwsDisconnectionFault: isFailureActive(A380Failure.SteeringNoseWheelDisconnection),
    normalSelectorValveJammedOpen: isFailureActive(A380Failure.SteeringNormalSelectorValveJammedOpen),
    alternateSelectorValveJammedOpen: isFailureActive(A380Failure.SteeringAlternateSelectorValveJammedOpen),
    bwsSelectorValveJammedOpen: isFailureActive(A380Failure.SteeringBodyWheelSelectorValveJammedOpen),
    nwsMode: read('L:A32NX_STEERING_NWS_MODE'),
    towPinInserted: read('L:A32NX_HYD_NW_STRG_DISC_ECAM_MEMO') > 0,
    towing:
      read('PUSHBACK STATE') !== NO_PUSHBACK_STATE || read('L:FSDT_GSX_DEPARTURE_STATE') === GSX_PUSHBACK_IN_PROGRESS,
  };
}

/** The aircraft state these alerts use */
export interface GearSteeringAircraftState {
  onGround: boolean;
  /** The gear lever itself (the LGCIS take it as down while the retraction is inhibited) */
  gearLeverDown: boolean;
  /** All gears locked down for the FWS (LGCIS vote), for NO L/G RETRACTION */
  allGearsDownlocked: boolean;
  oneEngineRunning: boolean;
  allEngineMastersOff: boolean;
  /** Speed above 250 kt or M .55 */
  aboveGearDoorSpeed: boolean;
  groundSpeedKt: number;
}

/**
 * The steering selector valves sensed jammed open: a valve that stays open while the SCS commands it closed. The normal
 * (alternate) selector valve is commanded open in normal (alternate) NWS only; the BWS selector valve while the BWS
 * can steer. Design choice: the BWS can steer on ground below 30 kt with an engine running or during a tow.
 * @param inputs the system signals
 * @param state the aircraft state
 * @returns the jammed open normal, alternate and BWS selector valves
 */
function selectorValvesJammedOpen(
  inputs: GearSteeringSystemInputs,
  state: GearSteeringAircraftState,
): { normal: boolean; alternate: boolean; bws: boolean } {
  const bwsCanSteer =
    state.onGround && state.groundSpeedKt < BWS_MAX_GROUND_SPEED_KT && (state.oneEngineRunning || inputs.towing);
  return {
    normal: inputs.normalSelectorValveJammedOpen && inputs.nwsMode !== NWS_MODE_NORMAL,
    alternate: inputs.alternateSelectorValveJammedOpen && inputs.nwsMode !== NWS_MODE_ALTERNATE,
    bws: inputs.bwsSelectorValveJammedOpen && !bwsCanSteer,
  };
}

/**
 * Lines of L/G RETRACTION FAULT (ata31-32-33.ts 320800044: [0] MAX SPEED below 250/.55, [1] SPEED REDUCE above,
 * [2] L/G RECYCLE, [3] IF NOT SUCCESSFUL, [4] L/G : KEEP DOWN, [5] MAX SPEED above, [6] MAX SPEED with a BLG door not
 * folded). Crew awareness only on ground. The BLG door folding is not modelled: [6] never shows.
 * @param inFlight the aircraft is in flight
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @returns which lines show
 */
export function retractionFaultItems(inFlight: boolean, aboveSpeed: boolean): boolean[] {
  if (!inFlight) {
    return [false, false, false, false, false, false, false];
  }
  return [!aboveSpeed, aboveSpeed, true, true, true, aboveSpeed, false];
}

/**
 * Ticks of L/G RETRACTION FAULT (same lines as retractionFaultItems).
 * @param aboveSpeed the speed is above 250 kt or M .55
 * @param recycled the gear lever was recycled since the alert came up
 * @param notSuccessful the gears stayed down after the recycle
 * @returns which lines are ticked
 */
export function retractionFaultChecked(aboveSpeed: boolean, recycled: boolean, notSuccessful: boolean): boolean[] {
  return [false, !aboveSpeed, recycled, notSuccessful, false, false, false];
}

/** Remembers a condition at the moment an alert comes up, until the alert goes */
class OnsetLatch {
  private alertWasActive = false;

  private latched = false;

  /**
   * @param alertActive whether the alert is active
   * @param condition the condition to remember at the alert onset
   * @returns the condition at the alert onset, false without the alert
   */
  public update(alertActive: boolean, condition: boolean): boolean {
    if (alertActive && !this.alertWasActive) {
      this.latched = condition;
    } else if (!alertActive) {
      this.latched = false;
    }
    this.alertWasActive = alertActive;
    return this.latched;
  }
}

/** The L/G and STEER alert conditions of this module. One instance in FwsCore. */
export class FwsGearSteeringAlerts {
  public readonly abnormOleoPress = Subject.create(false);

  public readonly bogiePositionFault = Subject.create(false);

  public readonly gearUplockFault = Subject.create(false);

  public readonly grvtyExtnFault = Subject.create(false);

  public readonly oleoPressMonitoringFault = Subject.create(false);

  public readonly retractionFault = Subject.create(false);

  public readonly weightOnWheelsFault = Subject.create(false);

  public readonly altnSteerSysHot = Subject.create(false);

  public readonly bwSteerNotLocked = Subject.create(false);

  public readonly captSteerTillerFault = Subject.create(false);

  public readonly foSteerTillerFault = Subject.create(false);

  public readonly nwSteerAngleLimitExceeded = Subject.create(false);

  public readonly nwSteerDiscFault = Subject.create(false);

  public readonly nwSteerNotDisc = Subject.create(false);

  public readonly pedalSteerCtlFault = Subject.create(false);

  public readonly steerSelVlvJammedOpen = Subject.create(false);

  /** The gears of the ON ... L/G lines of ABNORM OLEO PRESS and OLEO PRESS MONITORING SYS FAULT */
  public oleoPressureAbnormalGears: boolean[] = [false, false, false, false, false];

  public oleoPressureMonitoringGears: boolean[] = [false, false, false, false, false];

  /** NO L/G RETRACTION of BOGIE POSITION FAULT, GEAR UPLOCK FAULT and B/W STEER NOT LOCKED */
  public bogieNoRetraction = false;

  public uplockNoRetraction = false;

  public bwsNoRetraction = false;

  public retractionRecycled = false;

  public retractionNotSuccessful = false;

  public selectorValves = { normal: false, alternate: false, bws: false };

  public onGround = true;

  public aboveGearDoorSpeed = false;

  public oneEngineRunning = false;

  public allEngineMastersOff = true;

  private readonly bogieGearDownAtOnset = new OnsetLatch();

  private readonly uplockGearDownAtOnset = new OnsetLatch();

  private readonly bwsGearDownAtOnset = new OnsetLatch();

  private readonly retractionRecycle = new LeverRecycleMonitor();

  private readonly retractionNotSuccessfulMemory = new NXLogicMemoryNode(false);

  /** Design choice: the exceedance is kept until the next flight, as a potential damage to look at on ground */
  private readonly angleLimitMemory = new NXLogicMemoryNode(false);

  private readonly notDiscConfirm = new NXLogicConfirmNode(NOT_DISC_CONFIRM_TIME_S);

  /**
   * @param deltaTimeMs the frame time in milliseconds (as the NXLogic nodes take it)
   * @param inputs the system signals
   * @param state the aircraft state
   */
  public update(deltaTimeMs: number, inputs: GearSteeringSystemInputs, state: GearSteeringAircraftState): void {
    this.onGround = state.onGround;
    this.aboveGearDoorSpeed = state.aboveGearDoorSpeed;
    this.oneEngineRunning = state.oneEngineRunning;
    this.allEngineMastersOff = state.allEngineMastersOff;

    this.oleoPressureAbnormalGears = inputs.oleoPressureAbnormal;
    this.oleoPressureMonitoringGears = inputs.oleoPressureMonitoringFault;
    this.abnormOleoPress.set(inputs.oleoPressureAbnormal.some((abnormal) => abnormal));
    this.oleoPressMonitoringFault.set(inputs.oleoPressureMonitoringFault.some((failed) => failed));
    this.weightOnWheelsFault.set(inputs.weightOnWheelsFault);
    this.grvtyExtnFault.set(inputs.gravityExtensionFault);

    // NO L/G RETRACTION: one engine running and all L/Gs already locked down when the alert came up
    this.bogiePositionFault.set(inputs.bogiePositionFault);
    this.bogieNoRetraction =
      this.bogieGearDownAtOnset.update(inputs.bogiePositionFault, state.allGearsDownlocked) && state.oneEngineRunning;
    this.gearUplockFault.set(inputs.uplockFault);
    this.uplockNoRetraction =
      this.uplockGearDownAtOnset.update(inputs.uplockFault, state.allGearsDownlocked) && state.oneEngineRunning;
    this.bwSteerNotLocked.set(inputs.bwsNotLocked);
    this.bwsNoRetraction =
      this.bwsGearDownAtOnset.update(inputs.bwsNotLocked, state.allGearsDownlocked) && state.oneEngineRunning;

    this.retractionFault.set(inputs.retractionFault);
    this.retractionRecycled = this.retractionRecycle.update(inputs.retractionFault, state.gearLeverDown);
    this.retractionNotSuccessful = this.retractionNotSuccessfulMemory.write(
      this.retractionRecycled && inputs.retractionInhibited,
      !inputs.retractionFault,
    );

    this.altnSteerSysHot.set(inputs.lehgsOverheat);
    this.captSteerTillerFault.set(inputs.captTillerFault);
    this.foSteerTillerFault.set(inputs.foTillerFault);
    this.pedalSteerCtlFault.set(inputs.pedalSteeringFault);
    this.nwSteerAngleLimitExceeded.set(this.angleLimitMemory.write(inputs.nwsAngleLimitExceeded, !state.onGround));

    // The tow sw in the towing position does not disconnect the NWS: the N/W STEER POWERED light comes on
    const nwsDisconnectionFailed = inputs.towPinInserted && inputs.nwsDisconnectionFault;
    this.nwSteerDiscFault.set(nwsDisconnectionFailed);
    const nwsConnected = !inputs.towPinInserted || nwsDisconnectionFailed;
    this.nwSteerNotDisc.set(this.notDiscConfirm.write(inputs.towing && nwsConnected, deltaTimeMs));

    this.selectorValves = selectorValvesJammedOpen(inputs, state);
    this.steerSelVlvJammedOpen.set(
      this.selectorValves.normal || this.selectorValves.alternate || this.selectorValves.bws,
    );
  }
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param alerts the alert state (FwsCore.gearSteeringAlerts)
 * @returns the entries, by alert key
 */
export function gearSteeringAbnormalItems(alerts: FwsGearSteeringAlerts): { [key: number]: EwdAbnormalItem } {
  const phases = GEAR_STEERING_PHASE_INHIBITION;
  const noRetractionLimitation = (noRetraction: boolean) => (noRetraction ? [NO_LG_RETRACTION] : []);
  const nwSteerPoweredInfo = (shown: boolean) => (shown ? [INFO_NW_STEER_POWERED] : []);
  const noLines = {
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
  };

  return {
    // L/G ABNORM OLEO PRESS: a maintenance action is required
    320800031: {
      flightPhaseInhib: phases.abnormOleoPress,
      simVarIsActive: alerts.abnormOleoPress,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => alerts.oleoPressureAbnormalGears,
      whichItemsChecked: () => [false, false, false, false, false],
      failure: 1,
      sysPage: SdPages.None,
    },
    // L/G BOGIE POSITION FAULT: a later retraction attempt gives L/G RETRACTION FAULT
    320800032: {
      flightPhaseInhib: phases.bogiePositionFault,
      simVarIsActive: alerts.bogiePositionFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [alerts.bogieNoRetraction],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.None,
      limitationsAllPhases: () => noRetractionLimitation(alerts.bogieNoRetraction),
    },
    // L/G GEAR UPLOCK FAULT: the gear cannot be retracted
    320800041: {
      flightPhaseInhib: phases.gearUplockFault,
      simVarIsActive: alerts.gearUplockFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [alerts.uplockNoRetraction],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () => noRetractionLimitation(alerts.uplockNoRetraction),
    },
    // L/G GRVTY EXTN FAULT: crew awareness
    320800042: {
      flightPhaseInhib: phases.grvtyExtnFault,
      simVarIsActive: alerts.grvtyExtnFault,
      ...noLines,
      failure: 1,
      sysPage: SdPages.None,
    },
    320800043: {
      flightPhaseInhib: phases.oleoPressMonitoringFault,
      simVarIsActive: alerts.oleoPressMonitoringFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => alerts.oleoPressureMonitoringGears,
      whichItemsChecked: () => [false, false, false, false, false],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [INOP_OLEO_PRESS_MONIT_SYS],
    },
    320800044: {
      flightPhaseInhib: phases.retractionFault,
      simVarIsActive: alerts.retractionFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => retractionFaultItems(!alerts.onGround, alerts.aboveGearDoorSpeed),
      whichItemsChecked: () =>
        retractionFaultChecked(alerts.aboveGearDoorSpeed, alerts.retractionRecycled, alerts.retractionNotSuccessful),
      failure: 2,
      sysPage: SdPages.None,
      limitationsAllPhases: () => (alerts.onGround ? [] : [MAX_SPEED_250, LG_KEEP_DOWN]),
      inopSysAllPhases: () => [INOP_LG_RETRACTION],
      info: () => (alerts.oneEngineRunning ? [INFO_FUEL_CONSUMPT_FMS_PRED] : []),
    },
    // L/G WEIGHT ON WHEELS FAULT: crew awareness
    320800046: {
      flightPhaseInhib: phases.weightOnWheelsFault,
      simVarIsActive: alerts.weightOnWheelsFault,
      ...noLines,
      failure: 1,
      sysPage: SdPages.None,
    },
    320800048: {
      flightPhaseInhib: phases.altnSteerSysHot,
      simVarIsActive: alerts.altnSteerSysHot,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Wheel,
    },
    320800050: {
      flightPhaseInhib: phases.bwSteerNotLocked,
      simVarIsActive: alerts.bwSteerNotLocked,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, alerts.bwsNoRetraction],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () => noRetractionLimitation(alerts.bwsNoRetraction),
      inopSysApprLdg: () => [INOP_BW_STEER],
      info: () => (alerts.oneEngineRunning ? INFO_TAXI_WITH_CARE : []),
    },
    // STEER CAPT(FO) STEER TILLER FAULT: crew awareness
    320800051: {
      flightPhaseInhib: phases.steerTillerFault,
      simVarIsActive: alerts.captSteerTillerFault,
      ...noLines,
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => [INOP_CAPT_STEER_TILLER],
    },
    320800052: {
      flightPhaseInhib: phases.steerTillerFault,
      simVarIsActive: alerts.foSteerTillerFault,
      ...noLines,
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => [INOP_FO_STEER_TILLER],
    },
    320800056: {
      flightPhaseInhib: phases.nwSteerAngleLimitExceeded,
      simVarIsActive: alerts.nwSteerAngleLimitExceeded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
    },
    320800057: {
      flightPhaseInhib: phases.nwSteerDiscFault,
      simVarIsActive: alerts.nwSteerDiscFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [alerts.onGround, alerts.onGround],
      whichItemsChecked: () => [false, alerts.allEngineMastersOff],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => [INOP_NW_STEER_DISC],
      info: () => nwSteerPoweredInfo(alerts.onGround),
    },
    320800059: {
      flightPhaseInhib: phases.nwSteerNotDisc,
      simVarIsActive: alerts.nwSteerNotDisc,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, alerts.allEngineMastersOff],
      failure: 2,
      sysPage: SdPages.Wheel,
      info: () => nwSteerPoweredInfo(true),
    },
    // STEER PEDAL STEER CTL FAULT: crew awareness, the tillers still steer
    320800061: {
      flightPhaseInhib: phases.pedalSteerCtlFault,
      simVarIsActive: alerts.pedalSteerCtlFault,
      ...noLines,
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => [INOP_PEDAL_STEER_CTL],
    },
    320800062: {
      flightPhaseInhib: phases.steerSelVlvJammedOpen,
      simVarIsActive: alerts.steerSelVlvJammedOpen,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const { normal, alternate } = alerts.selectorValves;
        return [normal || alternate, normal && !alternate, alternate];
      },
      whichItemsChecked: () => [false, alerts.allEngineMastersOff, false],
      failure: 1,
      sysPage: SdPages.None,
      info: () => nwSteerPoweredInfo(alerts.selectorValves.normal || alerts.selectorValves.alternate),
    },
  };
}
