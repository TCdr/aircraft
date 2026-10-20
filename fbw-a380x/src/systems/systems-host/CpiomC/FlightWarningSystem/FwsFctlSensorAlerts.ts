// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X F/CTL (ATA 27) alerts of the flight control inputs, sensors, rudder trim, spoilers and PRIM/SEC configuration:
 * CONFIG L(R) SIDESTICK FAULT (BY TAKE-OVER), F/CTL L(R) SIDESTICK FAULT, L(R) SIDESTICK SENSOR FAULT, PRIM 1(2)(3)
 * SIDESTICK SENSOR FAULT, SIDESTICK PRIORITY FAULT, RUDDER PEDAL FAULT, RUDDER PEDAL SENSOR FAULT, (DOUBLE) RUDDER PRESSURE
 * SENSOR FAULT, RUDDER TRIM 1(2) FAULT, RUDDER TRIM FAULT, GND SPLRs FAULT, PART (MOST) SPLRs FAULT, SPEED BRAKES FAULT,
 * LOAD ALLEVIATION FAULT, TWO GYROMETERs FAULT, PRIM (SEC) VERSIONS DISAGREE and PRIMs PIN PROG DISAGREE.
 *
 * The PRIMs and SECs detect these failures; the FWS reads the flyPad failures (ATA 27) while a computer that detects them
 * runs. The C++ fbw module simulates the failures of the sidesticks, rudder pedal transducers, rudder trim motors, PRIM
 * wheel speed inputs, speed brakes lever and spoiler actuators (FlightControlInputFailures.h). The sensor, priority
 * function, accelerometer, gyrometer, version and pin programming failures change nothing else: the computers keep enough
 * redundancy, so only the alert shows.
 *
 * Not done: the ALTN LAW of PART (MOST) SPLRs FAULT with four pairs of roll spoilers lost (the generated PRIM laws know no
 * spoiler failure), so its F/CTL PROT, CAT 2 and ALTN LAW : PROT LOST STATUS lines are not shown.
 */

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { A380Failure } from '@failures';
import type { EwdAbnormalItem } from './FwsAbnormalSensed';

type Two<T> = [T, T];
type Three<T> = [T, T, T];

/** E/WD keys (ata27.ts) */
export const FCTL_SENSOR_ALERT_KEYS = {
  configSidestickFault: [271800001, 271800002] as Two<number>,
  twoGyrometersFault: 271800018,
  gndSplrsFault: 271800016,
  sidestickFault: [271800025, 271800026] as Two<number>,
  sidestickSensorFault: [271800027, 271800028] as Two<number>,
  loadAlleviationFault: 271800029,
  partSplrsFault: 271800030,
  mostSplrsFault: 271800031,
  primSidestickSensorFault: [271800042, 271800043, 271800044] as Three<number>,
  primVersionsDisagree: 271800045,
  secVersionsDisagree: 271800046,
  primsPinProgDisagree: 271800047,
  rudderPedalFault: 271800050,
  rudderPedalSensorFault: 271800052,
  rudderPressureSensorFault: 271800053,
  rudderTrimSingleFault: [271800054, 271800055] as Two<number>,
  rudderTrimFault: 271800056,
  speedBrakesFault: 271800063,
  sidestickPriorityFault: 271800073,
  doubleRudderPressureSensorFault: 271800074,
};

/** Flight phases in which the alerts are inhibited */
export const FCTL_SENSOR_PHASE_INHIBITION = {
  configSidestickFault: [5, 6, 7, 8, 9, 10, 12],
  sidestickFault: [] as number[],
  sidestickSensorFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  primSidestickSensorFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  sidestickPriorityFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  rudderPedalFault: [4, 5, 6, 7],
  rudderPedalSensorFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  rudderPressureSensorFault: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  doubleRudderPressureSensorFault: [3, 4, 5, 6, 7, 9, 10, 11],
  rudderTrimSingleFault: [3, 4, 5, 6, 7, 9, 10, 11],
  rudderTrimFault: [4, 5, 6, 7, 9, 10],
  gndSplrsFault: [3, 4, 5, 6, 7],
  splrsFault: [3, 4, 5, 6, 7, 9, 10],
  speedBrakesFault: [3, 4, 5, 6, 7, 9, 10],
  loadAlleviationFault: [3, 4, 5, 6, 7, 8, 9, 10],
  twoGyrometersFault: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  versionsDisagree: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

// EcamInopSys keys
const INOP_SIDESTICK: Two<string> = ['270300050', '270300051'];
const INOP_RUDDER_PEDAL = '270300052';
const INOP_SPEED_BRAKES = '270300053';
const INOP_GND_SPLRS = '270300054';
const INOP_RUDDER_TRIM = '270300004';
const INOP_RUDDER_TRIM_CHANNEL: Two<string> = ['270300005', '270300006'];
const INOP_PART_SPLRS = '290100001';
const INOP_MOST_SPLRS = '290100011';
const INOP_LOAD_ALLEVIATION = '340300014';
const INOP_BTV = '320300007';
const INOP_RWY_OVERRUN_PROT = '320300025';
const INOP_CAT_2 = '220300027';
const INOP_GLS_AUTOLAND = '220300010';
const INOP_AP_FD_TCAS_MODE = '220300020';
// EcamLimitations keys
const LIMITATION_LDG_DIST_AFFECTED = '800400002';
const LIMITATION_AUTO_BRK_DO_NOT_USE = '320400004';

/** The CAPT and F/O sidestick takeover pb hold time that deactivates the other sidestick until it is pressed again */
const SIDESTICK_TAKEOVER_LOCK_SECONDS = 30;

/** Spoilers lost from this number on: MOST SPLRs FAULT instead of PART SPLRs FAULT */
// Design choice: the alert lists "one to eight" spoilers for PART and "more than nine" for MOST; nine counts as MOST.
const MOST_SPLRS_LOST = 9;

/** What the FWS reads for these alerts */
export interface FctlSensorInputs {
  flightPhase: number;
  /** T.O CONFIG pb pressed (held for the config test), FwsCore toConfigTestHeldMin1s5Pulse */
  toConfigTest: boolean;
  /** Taxi-in with the FLAPS lever at 0 for one minute (FwsCore), the taxi line of the spoiler alerts */
  taxiInFlapsLever0For1Min: boolean;
  primHealthy: Three<boolean>;
  /** SEC 1, 2, 3; SEC 1 and SEC 3 are the rudder trim computers */
  secHealthy: Three<boolean>;
  captTakeoverPbPressed: boolean;
  foTakeoverPbPressed: boolean;
  deltaTimeSeconds: number;
  isFailureActive: (failure: number) => boolean;
}

/** The alert conditions, true while the triggering condition is met */
export interface FctlSensorAlertFlags {
  sidestickFault: Two<boolean>;
  sidestickSensorFault: Two<boolean>;
  primSidestickSensorFault: Three<boolean>;
  sidestickPriorityFault: boolean;
  rudderPedalFault: boolean;
  rudderPedalSensorFault: boolean;
  rudderPressureSensorFault: boolean;
  doubleRudderPressureSensorFault: boolean;
  rudderTrimSingleFault: Two<boolean>;
  rudderTrimFault: boolean;
  gndSplrsFault: boolean;
  partSplrsFault: boolean;
  mostSplrsFault: boolean;
  speedBrakesFault: boolean;
  loadAlleviationFault: boolean;
  twoGyrometersFault: boolean;
  primVersionsDisagree: boolean;
  secVersionsDisagree: boolean;
  primsPinProgDisagree: boolean;
}

const LEFT_SPOILER_ACTUATORS = [
  A380Failure.LeftSpoiler1Actuator,
  A380Failure.LeftSpoiler2Actuator,
  A380Failure.LeftSpoiler3Actuator,
  A380Failure.LeftSpoiler4Actuator,
  A380Failure.LeftSpoiler5Actuator,
  A380Failure.LeftSpoiler6Actuator,
  A380Failure.LeftSpoiler7Actuator,
  A380Failure.LeftSpoiler8Actuator,
];
const RIGHT_SPOILER_ACTUATORS = [
  A380Failure.RightSpoiler1Actuator,
  A380Failure.RightSpoiler2Actuator,
  A380Failure.RightSpoiler3Actuator,
  A380Failure.RightSpoiler4Actuator,
  A380Failure.RightSpoiler5Actuator,
  A380Failure.RightSpoiler6Actuator,
  A380Failure.RightSpoiler7Actuator,
  A380Failure.RightSpoiler8Actuator,
];
const LEFT_WING_LAF_ACCELEROMETERS = [
  A380Failure.LeftWingLafAccelerometer1,
  A380Failure.LeftWingLafAccelerometer2,
  A380Failure.LeftWingLafAccelerometer3,
];
const RIGHT_WING_LAF_ACCELEROMETERS = [
  A380Failure.RightWingLafAccelerometer1,
  A380Failure.RightWingLafAccelerometer2,
  A380Failure.RightWingLafAccelerometer3,
];
const GYROMETERS = [
  A380Failure.FlightControlGyrometer1,
  A380Failure.FlightControlGyrometer2,
  A380Failure.FlightControlGyrometer3,
  A380Failure.FlightControlGyrometer4,
  A380Failure.FlightControlGyrometer5,
  A380Failure.FlightControlGyrometer6,
];
const PRIM_SIDESTICK_SENSOR_CHANNELS = [
  A380Failure.Prim1SidestickSensorChannel,
  A380Failure.Prim2SidestickSensorChannel,
  A380Failure.Prim3SidestickSensorChannel,
];
const PRIM_SIDESTICK_PRIORITY_FUNCTIONS = [
  A380Failure.Prim1SidestickPriority,
  A380Failure.Prim2SidestickPriority,
  A380Failure.Prim3SidestickPriority,
];

/**
 * The number of spoilers lost: a failed spoiler, and the symmetric spoiler of a failed one that the PRIMs inhibit, except
 * for spoilers 5 and 6 (EBHAs). The same rule as the spoiler orders of FlightControlInputFailures.h.
 * @param leftFailed failed actuators of spoilers 1 to 8 of the left wing
 * @param rightFailed same for the right wing
 * @returns the number of spoilers lost, 0 to 16
 */
export function lostSpoilerCount(leftFailed: boolean[], rightFailed: boolean[]): number {
  let lost = 0;
  for (let i = 0; i < 8; i++) {
    const keepsSymmetric = i === 4 || i === 5;
    lost += leftFailed[i] || (rightFailed[i] && !keepsSymmetric) ? 1 : 0;
    lost += rightFailed[i] || (leftFailed[i] && !keepsSymmetric) ? 1 : 0;
  }
  return lost;
}

function countTrue(values: boolean[]): number {
  return values.filter((value) => value).length;
}

/**
 * The alert conditions of this cycle.
 * @param inputs the inputs
 * @returns one flag per alert
 */
export function fctlSensorAlertFlags(inputs: FctlSensorInputs): FctlSensorAlertFlags {
  const failed = inputs.isFailureActive;
  // The healthy flags come from SimVar Bool reads, which return the number 1 for true
  const primHealthy = inputs.primHealthy.map(Boolean) as Three<boolean>;
  const secHealthy = inputs.secHealthy.map(Boolean) as Three<boolean>;
  const healthyPrims = countTrue(primHealthy);
  const anyPrim = healthyPrims > 0;
  const anySec = secHealthy[0] || secHealthy[1] || secHealthy[2];
  const anyComputer = anyPrim || anySec;

  const sidestickFailed: Two<boolean> = [failed(A380Failure.CaptSidestick), failed(A380Failure.FoSidestick)];
  const sidestickSensorFailed: Two<boolean> = [
    failed(A380Failure.CaptSidestickSensor),
    failed(A380Failure.FoSidestickSensor),
  ];
  const sidestickFault = sidestickFailed.map((stick) => stick && anyPrim) as Two<boolean>;
  // Two or three PRIMs see a failed sidestick sensor: SIDESTICK SENSOR FAULT; one PRIM alone: PRIM n SIDESTICK SENSOR
  const sidestickSensorFault = sidestickSensorFailed.map(
    (sensor, side) => sensor && !sidestickFailed[side] && healthyPrims >= 2,
  ) as Two<boolean>;
  const sensorSeenByOnePrimOnly =
    healthyPrims === 1 &&
    ((sidestickSensorFailed[0] && !sidestickFailed[0]) || (sidestickSensorFailed[1] && !sidestickFailed[1]));
  const primSidestickSensorFault = primHealthy.map(
    (healthy, prim) => healthy && (failed(PRIM_SIDESTICK_SENSOR_CHANNELS[prim]) || sensorSeenByOnePrimOnly),
  ) as Three<boolean>;
  const sidestickPriorityFault = primHealthy.some(
    (healthy, prim) => healthy && failed(PRIM_SIDESTICK_PRIORITY_FUNCTIONS[prim]),
  );

  const pedalTransducersFailed = failed(A380Failure.RudderPedalTransducers);
  const upperPressureSensorFailed = failed(A380Failure.UpperRudderPressureSensor);
  const lowerPressureSensorFailed = failed(A380Failure.LowerRudderPressureSensor);

  // Rudder trim channel 1 = SEC 1 and motor 1, channel 2 = SEC 3 and motor 2
  const trimMotorFailed: Two<boolean> = [failed(A380Failure.RudderTrimMotor1), failed(A380Failure.RudderTrimMotor2)];
  const trimSecHealthy: Two<boolean> = [secHealthy[0], secHealthy[2]];
  const trimChannelLost = trimMotorFailed.map((motor, channel) => motor || !trimSecHealthy[channel]);
  const rudderTrimFault =
    trimChannelLost[0] && trimChannelLost[1] && (trimMotorFailed[0] || trimMotorFailed[1]) && anySec;
  const rudderTrimSingleFault = trimMotorFailed.map(
    (motor, channel) => motor && trimSecHealthy[channel] && !rudderTrimFault,
  ) as Two<boolean>;

  const spoilersLost = lostSpoilerCount(
    LEFT_SPOILER_ACTUATORS.map((failure) => failed(failure)),
    RIGHT_SPOILER_ACTUATORS.map((failure) => failed(failure)),
  );

  const lafAccelerometersFailedInOneWing =
    countTrue(LEFT_WING_LAF_ACCELEROMETERS.map((failure) => failed(failure))) >= 2 ||
    countTrue(RIGHT_WING_LAF_ACCELEROMETERS.map((failure) => failed(failure))) >= 2;

  return {
    sidestickFault,
    sidestickSensorFault,
    primSidestickSensorFault,
    sidestickPriorityFault,
    rudderPedalFault: pedalTransducersFailed && anyComputer,
    rudderPedalSensorFault: failed(A380Failure.RudderPedalSensor) && !pedalTransducersFailed && anyComputer,
    rudderPressureSensorFault: upperPressureSensorFailed !== lowerPressureSensorFailed && anyComputer,
    doubleRudderPressureSensorFault: upperPressureSensorFailed && lowerPressureSensorFailed && anyComputer,
    rudderTrimSingleFault,
    rudderTrimFault,
    gndSplrsFault: failed(A380Failure.PrimWheelSpeedInputs) && anyPrim,
    partSplrsFault: spoilersLost > 0 && spoilersLost < MOST_SPLRS_LOST && anyPrim,
    mostSplrsFault: spoilersLost >= MOST_SPLRS_LOST && anyPrim,
    speedBrakesFault: failed(A380Failure.SpeedBrakesLever) && anyPrim,
    loadAlleviationFault: lafAccelerometersFailedInOneWing && anyPrim,
    twoGyrometersFault: countTrue(GYROMETERS.map((failure) => failed(failure))) >= 2 && anyPrim,
    primVersionsDisagree: failed(A380Failure.PrimSoftwareVersions) && healthyPrims >= 2,
    secVersionsDisagree: failed(A380Failure.SecSoftwareVersions) && countTrue(secHealthy) >= 2,
    primsPinProgDisagree: failed(A380Failure.PrimPinProgramming) && healthyPrims >= 2,
  };
}

/**
 * The sidestick deactivation by take-over, as the PRIMs latch it: a pilot who keeps the take-over pb pressed for 30 s
 * deactivates the other sidestick until the pilot of that sidestick presses their pb.
 */
export class SidestickTakeoverLock {
  /** CAPT (L) and F/O (R) sidestick deactivated by a 30 s take-over of the other pilot */
  public readonly deactivated: Two<boolean> = [false, false];

  private readonly pbPreviouslyPressed: Two<boolean> = [false, false];

  /** Who has the priority: the last pilot to press the pb, while it is pressed */
  private priority: 0 | 1 | null = null;

  private priorityHeldSeconds = 0;

  /**
   * @param captPbPressed the CAPT take-over pb
   * @param foPbPressed the F/O take-over pb
   * @param deltaTimeSeconds time since the last update
   */
  public update(captPbPressed: boolean, foPbPressed: boolean, deltaTimeSeconds: number): void {
    const pressed: Two<boolean> = [captPbPressed, foPbPressed];
    const previousPriority = this.priority;
    for (const side of [0, 1] as const) {
      if (pressed[side] && !this.pbPreviouslyPressed[side]) {
        this.priority = side;
        // a press on the deactivated sidestick gives it its priority back
        this.deactivated[side] = false;
      }
    }
    if (this.priority !== null && !pressed[this.priority]) {
      this.priority = null;
    }
    this.pbPreviouslyPressed[0] = captPbPressed;
    this.pbPreviouslyPressed[1] = foPbPressed;

    this.priorityHeldSeconds =
      this.priority !== null && this.priority === previousPriority ? this.priorityHeldSeconds + deltaTimeSeconds : 0;
    if (this.priority !== null && this.priorityHeldSeconds >= SIDESTICK_TAKEOVER_LOCK_SECONDS) {
      this.deactivated[this.priority === 0 ? 1 : 0] = true;
    }
  }
}

/**
 * CONFIG L(R) SIDESTICK FAULT (BY TAKE-OVER): a sidestick deactivated by take-over at the T.O CONFIG test (phases 1, 2,
 * 11) or when the thrust levers are set to FLEX or TOGA (phases 3, 4, 5, kept until lift-off or until the sidestick is
 * active again), like the other CONFIG alerts of FwsCore.
 */
export class ConfigSidestickMonitor {
  private latched = false;

  /**
   * @param deactivated the sidestick is deactivated by take-over
   * @param flightPhase the FWS flight phase
   * @param toConfigTest the T.O CONFIG pb is pressed
   * @returns whether the alert is active
   */
  public update(deactivated: boolean, flightPhase: number, toConfigTest: boolean): boolean {
    const takeoffPower = flightPhase === 3 || flightPhase === 4 || flightPhase === 5;
    if (!deactivated || flightPhase === 6 || flightPhase === 7) {
      this.latched = false;
    } else if (takeoffPower) {
      this.latched = true;
    }
    const configTest = toConfigTest && deactivated && (flightPhase === 1 || flightPhase === 2 || flightPhase === 11);
    return configTest || this.latched;
  }
}

/** The state of these alerts, updated every FWS cycle */
export class FctlSensorAlerts {
  public readonly configSidestickFault: Two<Subject<boolean>> = [Subject.create(false), Subject.create(false)];
  public readonly sidestickFault: Two<Subject<boolean>> = [Subject.create(false), Subject.create(false)];
  public readonly sidestickSensorFault: Two<Subject<boolean>> = [Subject.create(false), Subject.create(false)];
  public readonly primSidestickSensorFault: Three<Subject<boolean>> = [
    Subject.create(false),
    Subject.create(false),
    Subject.create(false),
  ];
  public readonly sidestickPriorityFault = Subject.create(false);
  public readonly rudderPedalFault = Subject.create(false);
  public readonly rudderPedalSensorFault = Subject.create(false);
  public readonly rudderPressureSensorFault = Subject.create(false);
  public readonly doubleRudderPressureSensorFault = Subject.create(false);
  public readonly rudderTrimSingleFault: Two<Subject<boolean>> = [Subject.create(false), Subject.create(false)];
  public readonly rudderTrimFault = Subject.create(false);
  public readonly gndSplrsFault = Subject.create(false);
  public readonly partSplrsFault = Subject.create(false);
  public readonly mostSplrsFault = Subject.create(false);
  public readonly speedBrakesFault = Subject.create(false);
  public readonly loadAlleviationFault = Subject.create(false);
  public readonly twoGyrometersFault = Subject.create(false);
  public readonly primVersionsDisagree = Subject.create(false);
  public readonly secVersionsDisagree = Subject.create(false);
  public readonly primsPinProgDisagree = Subject.create(false);
  /**
   * An active alert of this module that affects the landing distance lists BTV in its STATUS INOP SYS: BTV does not arm
   * (FwsCore btvInopByAlert). PRIMs PIN PROG DISAGREE also lists BTV but changes nothing else in the aircraft.
   */
  public readonly btvInop = Subject.create(false);

  /** The taxi-in line of PART (MOST) SPLRs FAULT */
  public taxiInFlapsLever0For1Min = false;

  private readonly takeoverLock = new SidestickTakeoverLock();

  private readonly configSidestickMonitors: Two<ConfigSidestickMonitor> = [
    new ConfigSidestickMonitor(),
    new ConfigSidestickMonitor(),
  ];

  public update(inputs: FctlSensorInputs): void {
    this.takeoverLock.update(inputs.captTakeoverPbPressed, inputs.foTakeoverPbPressed, inputs.deltaTimeSeconds);
    this.configSidestickMonitors.forEach((monitor, side) =>
      this.configSidestickFault[side].set(
        monitor.update(this.takeoverLock.deactivated[side], inputs.flightPhase, inputs.toConfigTest),
      ),
    );

    const flags = fctlSensorAlertFlags(inputs);
    flags.sidestickFault.forEach((fault, side) => this.sidestickFault[side].set(fault));
    flags.sidestickSensorFault.forEach((fault, side) => this.sidestickSensorFault[side].set(fault));
    flags.primSidestickSensorFault.forEach((fault, prim) => this.primSidestickSensorFault[prim].set(fault));
    this.sidestickPriorityFault.set(flags.sidestickPriorityFault);
    this.rudderPedalFault.set(flags.rudderPedalFault);
    this.rudderPedalSensorFault.set(flags.rudderPedalSensorFault);
    this.rudderPressureSensorFault.set(flags.rudderPressureSensorFault);
    this.doubleRudderPressureSensorFault.set(flags.doubleRudderPressureSensorFault);
    flags.rudderTrimSingleFault.forEach((fault, channel) => this.rudderTrimSingleFault[channel].set(fault));
    this.rudderTrimFault.set(flags.rudderTrimFault);
    this.gndSplrsFault.set(flags.gndSplrsFault);
    this.partSplrsFault.set(flags.partSplrsFault);
    this.mostSplrsFault.set(flags.mostSplrsFault);
    this.speedBrakesFault.set(flags.speedBrakesFault);
    this.loadAlleviationFault.set(flags.loadAlleviationFault);
    this.twoGyrometersFault.set(flags.twoGyrometersFault);
    this.primVersionsDisagree.set(flags.primVersionsDisagree);
    this.secVersionsDisagree.set(flags.secVersionsDisagree);
    this.primsPinProgDisagree.set(flags.primsPinProgDisagree);
    this.btvInop.set(flags.rudderPedalFault || flags.gndSplrsFault || flags.partSplrsFault || flags.mostSplrsFault);
    this.taxiInFlapsLever0For1Min = inputs.taxiInFlapsLever0For1Min;
  }

  /** @returns whether a sidestick is deactivated by take-over (the T.O CONFIG test fails) */
  public sidestickDeactivatedByTakeover(): boolean {
    return this.takeoverLock.deactivated[0] || this.takeoverLock.deactivated[1];
  }
}

/** An alert with no ECAM action line */
function crewAwareness(
  flightPhaseInhib: number[],
  simVarIsActive: Subject<boolean>,
  failure: number,
  sysPage: SdPages,
): EwdAbnormalItem {
  return {
    flightPhaseInhib,
    simVarIsActive,
    notActiveWhenItemActive: [],
    whichItemsToShow: () => [],
    whichItemsChecked: () => [],
    failure,
    sysPage,
  };
}

/**
 * The FwsAbnormalSensed entries of these alerts.
 * @param alerts the alert state (FwsCore.fctlSensorAlerts)
 */
export function fctlSensorAbnormalItems(alerts: FctlSensorAlerts): { [key: number]: EwdAbnormalItem } {
  const keys = FCTL_SENSOR_ALERT_KEYS;
  const inhib = FCTL_SENSOR_PHASE_INHIBITION;
  const items: { [key: number]: EwdAbnormalItem } = {};

  keys.configSidestickFault.forEach((key, side) => {
    items[key] = {
      flightPhaseInhib: inhib.configSidestickFault,
      simVarIsActive: alerts.configSidestickFault[side],
      notActiveWhenItemActive: [],
      // L(R) TAKEOVER ... DEPRESS
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 3,
      sysPage: SdPages.None,
    };
  });

  keys.sidestickFault.forEach((key, side) => {
    items[key] = {
      ...crewAwareness(inhib.sidestickFault, alerts.sidestickFault[side], 2, SdPages.Fctl),
      inopSysAllPhases: () => [INOP_SIDESTICK[side]],
    };
  });

  keys.sidestickSensorFault.forEach((key, side) => {
    items[key] = {
      ...crewAwareness(inhib.sidestickSensorFault, alerts.sidestickSensorFault[side], 1, SdPages.None),
      notActiveWhenItemActive: [keys.sidestickFault[side].toString()],
    };
  });

  keys.primSidestickSensorFault.forEach((key, prim) => {
    items[key] = crewAwareness(inhib.primSidestickSensorFault, alerts.primSidestickSensorFault[prim], 1, SdPages.None);
  });

  items[keys.sidestickPriorityFault] = crewAwareness(
    inhib.sidestickPriorityFault,
    alerts.sidestickPriorityFault,
    1,
    SdPages.None,
  );

  items[keys.rudderPedalFault] = {
    flightPhaseInhib: inhib.rudderPedalFault,
    simVarIsActive: alerts.rudderPedalFault,
    notActiveWhenItemActive: [],
    // AP : KEEP ON, LDG DIST AFFECTED
    whichItemsToShow: () => [true, true],
    whichItemsChecked: () => [false, false],
    failure: 2,
    sysPage: SdPages.Fctl,
    limitationsApprLdg: () => [LIMITATION_LDG_DIST_AFFECTED],
    inopSysAllPhases: () => [INOP_RUDDER_PEDAL],
    inopSysApprLdg: () => [INOP_BTV],
  };

  items[keys.rudderPedalSensorFault] = crewAwareness(
    inhib.rudderPedalSensorFault,
    alerts.rudderPedalSensorFault,
    1,
    SdPages.None,
  );

  items[keys.rudderPressureSensorFault] = crewAwareness(
    inhib.rudderPressureSensorFault,
    alerts.rudderPressureSensorFault,
    1,
    SdPages.None,
  );

  items[keys.doubleRudderPressureSensorFault] = crewAwareness(
    inhib.doubleRudderPressureSensorFault,
    alerts.doubleRudderPressureSensorFault,
    1,
    SdPages.None,
  );

  keys.rudderTrimSingleFault.forEach((key, channel) => {
    items[key] = {
      ...crewAwareness(inhib.rudderTrimSingleFault, alerts.rudderTrimSingleFault[channel], 1, SdPages.Fctl),
      redundLoss: () => [INOP_RUDDER_TRIM_CHANNEL[channel]],
    };
  });

  items[keys.rudderTrimFault] = {
    ...crewAwareness(inhib.rudderTrimFault, alerts.rudderTrimFault, 2, SdPages.Fctl),
    inopSysAllPhases: () => [INOP_RUDDER_TRIM],
    inopSysApprLdg: () => [INOP_CAT_2],
  };

  items[keys.gndSplrsFault] = {
    flightPhaseInhib: inhib.gndSplrsFault,
    simVarIsActive: alerts.gndSplrsFault,
    notActiveWhenItemActive: [],
    // LDG DIST AFFECTED, AUTO BRK : DO NOT USE
    whichItemsToShow: () => [true, true],
    whichItemsChecked: () => [false, false],
    failure: 2,
    sysPage: SdPages.Fctl,
    limitationsApprLdg: () => [LIMITATION_LDG_DIST_AFFECTED, LIMITATION_AUTO_BRK_DO_NOT_USE],
    inopSysApprLdg: () => [INOP_GND_SPLRS, INOP_BTV, INOP_RWY_OVERRUN_PROT, INOP_CAT_2],
  };

  const splrsFaultItem = (active: Subject<boolean>, inopSys: string): EwdAbnormalItem => ({
    flightPhaseInhib: inhib.splrsFault,
    simVarIsActive: active,
    notActiveWhenItemActive: [],
    // FOR TAXI : FLAPS SELECT CONF 1+F (taxi-in, one minute after FLAPS lever 0), LDG DIST AFFECTED
    whichItemsToShow: () => [alerts.taxiInFlapsLever0For1Min, true],
    whichItemsChecked: () => [false, false],
    failure: 2,
    sysPage: SdPages.Fctl,
    limitationsApprLdg: () => [LIMITATION_LDG_DIST_AFFECTED],
    inopSysAllPhases: () => [inopSys],
    inopSysApprLdg: () => [INOP_BTV, INOP_GLS_AUTOLAND],
  });
  items[keys.partSplrsFault] = splrsFaultItem(alerts.partSplrsFault, INOP_PART_SPLRS);
  items[keys.mostSplrsFault] = splrsFaultItem(alerts.mostSplrsFault, INOP_MOST_SPLRS);

  items[keys.speedBrakesFault] = {
    ...crewAwareness(inhib.speedBrakesFault, alerts.speedBrakesFault, 2, SdPages.Fctl),
    inopSysAllPhases: () => [INOP_SPEED_BRAKES],
  };

  items[keys.loadAlleviationFault] = {
    ...crewAwareness(inhib.loadAlleviationFault, alerts.loadAlleviationFault, 1, SdPages.None),
    inopSysAllPhases: () => [INOP_LOAD_ALLEVIATION],
  };

  items[keys.twoGyrometersFault] = crewAwareness(inhib.twoGyrometersFault, alerts.twoGyrometersFault, 1, SdPages.None);
  items[keys.primVersionsDisagree] = crewAwareness(
    inhib.versionsDisagree,
    alerts.primVersionsDisagree,
    1,
    SdPages.None,
  );
  items[keys.secVersionsDisagree] = crewAwareness(inhib.versionsDisagree, alerts.secVersionsDisagree, 1, SdPages.None);
  items[keys.primsPinProgDisagree] = {
    ...crewAwareness(inhib.versionsDisagree, alerts.primsPinProgDisagree, 1, SdPages.None),
    inopSysAllPhases: () => [INOP_AP_FD_TCAS_MODE],
    inopSysApprLdg: () => [INOP_BTV, INOP_RWY_OVERRUN_PROT],
  };

  return items;
}

/** The FwsAbnormalSensed deferred procedure entries (ata27.ts EcamDeferredProcAta27) of GND SPLRs, MOST SPLRs and RUDDER
 * PEDAL FAULT: shown while their alert is active (FwsCore links them through fromAbnormalProcs) */
export function fctlSensorDeferredItems(): { [key: number]: EwdAbnormalItem } {
  const deferred = (itemCount: number): EwdAbnormalItem => ({
    flightPhaseInhib: [],
    simVarIsActive: Subject.create(true),
    notActiveWhenItemActive: [],
    whichItemsToShow: () => Array(itemCount).fill(true),
    whichItemsChecked: () => Array(itemCount).fill(false),
    failure: 0,
    sysPage: SdPages.None,
  });
  return {
    // GND SPLRs FAULT and MOST SPLRs FAULT: LDG DIST COMPUTATION ... CONFIRM
    270700002: deferred(1),
    270700004: deferred(1),
    // RUDDER PEDAL FAULT
    270700003: deferred(6),
  };
}
