// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { doorBits, DSMS_CHANNEL_COUNT, DSMS_VARS, PASSENGER_DOOR_COUNT } from '@shared/DoorsAndSlides';

/*
 * The Doors and Slides Management System (DSMS): a local door controller (LDC) at each passenger door monitors the
 * door, its flight lock and its escape slide, and three DSMS channels collect the data for the FWS and the DOOR/OXY SD
 * page. The flyPad failures (ATA 52) fail its parts; the DSMS publishes what it detects (shared/DoorsAndSlides.ts).
 */

/** The flyPad failure name part of each passenger door, in interactive point order */
const DOOR_FAILURE_NAMES = [
  'Main1L',
  'Main1R',
  'Main2L',
  'Main2R',
  'Main3L',
  'Main3R',
  'Main4L',
  'Main4R',
  'Main5L',
  'Main5R',
  'Upper1L',
  'Upper1R',
  'Upper2L',
  'Upper2R',
  'Upper3L',
  'Upper3R',
];

type DoorFailureKind = 'Actuator' | 'FlightLock' | 'LatchMonitoring' | 'Ldc' | 'Slide';

function doorFailures(kind: DoorFailureKind): number[] {
  return DOOR_FAILURE_NAMES.map((door) => A380Failure[`Door${door}${kind}` as keyof typeof A380Failure]);
}

/** The flyPad failures of each kind, one per passenger door in interactive point order */
export const DOOR_FAILURES: Record<DoorFailureKind, number[]> = {
  Actuator: doorFailures('Actuator'),
  FlightLock: doorFailures('FlightLock'),
  LatchMonitoring: doorFailures('LatchMonitoring'),
  Ldc: doorFailures('Ldc'),
  Slide: doorFailures('Slide'),
};

/** Only the M1 doors have an extension slide */
export const SLIDE_LENGTHENING_FAILURES = [
  A380Failure.DoorMain1LSlideLengthening,
  A380Failure.DoorMain1RSlideLengthening,
];

export const DSMS_CHANNEL_FAILURES = [A380Failure.DsmsChannel1, A380Failure.DsmsChannel2, A380Failure.DsmsChannel3];

/** The flight lock locks the door handles from 65 kt until FL 240 (in climb), and again below FL 240 in descent */
const FLIGHT_LOCK_SPEED_KT = 65;
const FLIGHT_LOCK_RELEASE_ALTITUDE_FT = 24000;

/**
 * Design choice: the flight lock follows the sim's indicated airspeed and pressure altitude; the release on a cabin
 * differential pressure detection is not simulated.
 * @returns true when the flight lock actuators must lock the door handles
 */
export function isFlightLockCommanded(airspeedKt: number, pressureAltitudeFt: number): boolean {
  return airspeedKt >= FLIGHT_LOCK_SPEED_KT && pressureAltitudeFt < FLIGHT_LOCK_RELEASE_ALTITUDE_FT;
}

/** The failed parts, one flag per passenger door for the per-door parts */
export interface DsmsFailures {
  actuator: boolean[];
  flightLock: boolean[];
  latchMonitoring: boolean[];
  ldc: boolean[];
  slide: boolean[];
  /** MAIN 1L, MAIN 1R */
  slideLengthening: boolean[];
  channelsFailed: number;
  aspsu: boolean;
}

/** What the DSMS detects and publishes, one flag per passenger door for the per-door outputs */
export interface DsmsOutputs {
  actuatorFault: boolean[];
  flightLockFault: boolean[];
  flightLockEngaged: boolean[];
  latchMonitoringFault: boolean[];
  ldcFault: boolean[];
  positionInvalid: boolean[];
  slideFault: boolean[];
  /** MAIN 1L, MAIN 1R */
  slideLengtheningFault: boolean[];
  channelsFailed: number;
  residualPressureDetectionFault: boolean;
}

export class DsmsLogic {
  private readonly flightLockEngaged: boolean[] = new Array(PASSENGER_DOOR_COUNT).fill(false);

  /**
   * - A door is monitored while its LDC works and at least one DSMS channel works. An unmonitored door has an unknown
   *   position, no detected fault and its flight lock is no longer engaged.
   * - Design choice: a failed flight lock actuator stays where it was, locked if it failed locked (the ECAM procedure
   *   has a failed and locked case), unlocked otherwise; one released by the loss of its door monitoring stays released
   *   when the monitoring comes back.
   * @param failures the failed parts
   * @param flightLockCommanded the aircraft speed and altitude call for locked door handles
   */
  public update(failures: DsmsFailures, flightLockCommanded: boolean): DsmsOutputs {
    const allChannelsFailed = failures.channelsFailed >= DSMS_CHANNEL_COUNT;
    const monitored = failures.ldc.map((ldcFailed) => !ldcFailed && !allChannelsFailed);
    const detected = (failed: readonly boolean[]) => failed.map((fault, door) => fault && monitored[door]);

    for (let door = 0; door < PASSENGER_DOOR_COUNT; door++) {
      if (!monitored[door]) {
        this.flightLockEngaged[door] = false;
      } else if (!failures.flightLock[door]) {
        this.flightLockEngaged[door] = flightLockCommanded;
      }
    }

    return {
      actuatorFault: detected(failures.actuator),
      flightLockFault: detected(failures.flightLock),
      flightLockEngaged: [...this.flightLockEngaged],
      latchMonitoringFault: detected(failures.latchMonitoring),
      ldcFault: [...failures.ldc],
      positionInvalid: monitored.map((isMonitored) => !isMonitored),
      slideFault: detected(failures.slide),
      slideLengtheningFault: detected(failures.slideLengthening),
      channelsFailed: failures.channelsFailed,
      residualPressureDetectionFault: failures.aspsu,
    };
  }
}

/** The DSMS L:var values of the outputs */
export function dsmsVarValues(outputs: DsmsOutputs): [string, number][] {
  return [
    [DSMS_VARS.actuatorFault, doorBits(outputs.actuatorFault)],
    [DSMS_VARS.flightLockFault, doorBits(outputs.flightLockFault)],
    [DSMS_VARS.flightLockEngaged, doorBits(outputs.flightLockEngaged)],
    [DSMS_VARS.latchMonitoringFault, doorBits(outputs.latchMonitoringFault)],
    [DSMS_VARS.ldcFault, doorBits(outputs.ldcFault)],
    [DSMS_VARS.positionInvalid, doorBits(outputs.positionInvalid)],
    [DSMS_VARS.slideFault, doorBits(outputs.slideFault)],
    [DSMS_VARS.slideLengtheningFault, doorBits(outputs.slideLengtheningFault)],
    [DSMS_VARS.channelsFailed, outputs.channelsFailed],
    [DSMS_VARS.residualPressureDetectionFault, outputs.residualPressureDetectionFault ? 1 : 0],
  ];
}

/**
 * Reads the ATA 52 door failures and publishes the DSMS L:vars, every 200 ms. Design choice: the DSMS power supply is
 * not simulated, it works whenever the systems host runs.
 */
export class DoorsAndSlidesManagementSystem implements Instrument {
  private static readonly UPDATE_PERIOD_MS = 200;

  private readonly logic = new DsmsLogic();

  private readonly written = new Map<string, number>();

  private timeSinceUpdateMs = DoorsAndSlidesManagementSystem.UPDATE_PERIOD_MS;

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failuresConsumer: Pick<FailuresConsumer, 'register' | 'isActive'>,
  ) {}

  /** @inheritdoc */
  public init(): void {
    // No Array.flat in the sim's JavaScript engine
    const doorFailures = ([] as number[]).concat(...Object.values(DOOR_FAILURES));
    [...doorFailures, ...SLIDE_LENGTHENING_FAILURES, ...DSMS_CHANNEL_FAILURES, A380Failure.Aspsu].forEach((failure) =>
      this.failuresConsumer.register(failure),
    );
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.timeSinceUpdateMs += this.sysHost.deltaTime;
    if (this.timeSinceUpdateMs < DoorsAndSlidesManagementSystem.UPDATE_PERIOD_MS) {
      return;
    }
    this.timeSinceUpdateMs = 0;

    const failed = (failures: number[]) => failures.map((failure) => this.failuresConsumer.isActive(failure));
    const outputs = this.logic.update(
      {
        actuator: failed(DOOR_FAILURES.Actuator),
        flightLock: failed(DOOR_FAILURES.FlightLock),
        latchMonitoring: failed(DOOR_FAILURES.LatchMonitoring),
        ldc: failed(DOOR_FAILURES.Ldc),
        slide: failed(DOOR_FAILURES.Slide),
        slideLengthening: failed(SLIDE_LENGTHENING_FAILURES),
        channelsFailed: failed(DSMS_CHANNEL_FAILURES).filter((channelFailed) => channelFailed).length,
        aspsu: this.failuresConsumer.isActive(A380Failure.Aspsu),
      },
      isFlightLockCommanded(
        SimVar.GetSimVarValue('AIRSPEED INDICATED', SimVarValueType.Knots),
        SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet),
      ),
    );
    for (const [name, value] of dsmsVarValues(outputs)) {
      if (this.written.get(name) !== value) {
        SimVar.SetSimVarValue(name, SimVarValueType.Number, value);
        this.written.set(name, value);
      }
    }
  }
}
