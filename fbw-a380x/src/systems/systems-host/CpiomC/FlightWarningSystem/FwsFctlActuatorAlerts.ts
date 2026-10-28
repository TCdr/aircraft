// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { A380Failure } from '@failures';
import { Subject } from '@microsoft/msfs-sdk';

/*
 * F/CTL alerts of the primary flight control actuators, from the flyPad actuator failures of the Rust hydraulic model
 * (a380_systems hydraulic/flight_control_actuator_failures.rs). There, a failed actuator loses its active mode and the
 * other actuator of the surface takes over; with both actuators failed, the surface is lost.
 *
 * Design choice: the PRIM and SEC models select the flight control laws from the hydraulic systems only and do not see
 * these failures, so a lost elevator or stabilizer does not revert the laws to alternate. The STATUS lines that come
 * with the alternate law (F/CTL PROT, CAT 2, GLS AUTOLAND, ALTN LAW : PROT LOST) are left to the F/CTL ALTN LAW alert
 * of the laws the PRIMs actually apply. The lines for a jammed elevator are not used: a failed elevator floats.
 */

/** Actuator 1 and 2 of a surface are failed */
export type ActuatorPairFailed = [boolean, boolean];

export interface FctlActuatorFailures {
  /**
   * L OUTR, L MID, L INR, R INR, R MID, R OUTR aileron. Actuator 2 of the mid and inner ailerons is their EHA, both
   * actuators of the outer ailerons are hydraulic.
   */
  ailerons: ActuatorPairFailed[];
  /** L OUTR, L INR, R INR, R OUTR elevator: the hydraulic actuator and the EHA */
  elevators: ActuatorPairFailed[];
  /** UPPER and LOWER rudder: their two EBHAs */
  rudders: ActuatorPairFailed[];
  rudderEbhaElectricalParts: ActuatorPairFailed[];
  /** GREEN and YELLOW hydraulic motors */
  stabilizerMotors: ActuatorPairFailed;
  stabilizerJammed: boolean;
  /** The electric motor of the stabilizer (FWS only, see stabilizerElecActuatorFault) */
  stabilizerElectricMotorFailed: boolean;
  /** PRIM 1, 2 and 3 have lost the capacity to control their elevator (rudder) actuator */
  primElevatorActuatorControlLost: boolean[];
  primRudderActuatorControlLost: boolean[];
}

const AILERON_NAMES = ['L OUTR', 'L MID', 'L INR', 'R INR', 'R MID', 'R OUTR'];
const OUTER_AILERONS = [0, 5];

const ELEVATOR_NAMES = ['L OUTR', 'L INR', 'R INR', 'R OUTR'];

type ActuatorPairSurfaces = 'ailerons' | 'elevators' | 'rudders' | 'rudderEbhaElectricalParts';

const ACTUATOR_FAILURE_IDS: Record<ActuatorPairSurfaces, [number, number][]> = {
  ailerons: [
    [A380Failure.LeftOuterAileronGreenActuator, A380Failure.LeftOuterAileronYellowActuator],
    [A380Failure.LeftMidAileronYellowActuator, A380Failure.LeftMidAileronEha],
    [A380Failure.LeftInnerAileronGreenActuator, A380Failure.LeftInnerAileronEha],
    [A380Failure.RightInnerAileronGreenActuator, A380Failure.RightInnerAileronEha],
    [A380Failure.RightMidAileronYellowActuator, A380Failure.RightMidAileronEha],
    [A380Failure.RightOuterAileronGreenActuator, A380Failure.RightOuterAileronYellowActuator],
  ],
  elevators: [
    [A380Failure.LeftOuterElevatorGreenActuator, A380Failure.LeftOuterElevatorEha],
    [A380Failure.LeftInnerElevatorGreenActuator, A380Failure.LeftInnerElevatorEha],
    [A380Failure.RightInnerElevatorYellowActuator, A380Failure.RightInnerElevatorEha],
    [A380Failure.RightOuterElevatorYellowActuator, A380Failure.RightOuterElevatorEha],
  ],
  rudders: [
    [A380Failure.UpperRudderYellowEbha, A380Failure.UpperRudderGreenEbha],
    [A380Failure.LowerRudderGreenEbha, A380Failure.LowerRudderYellowEbha],
  ],
  rudderEbhaElectricalParts: [
    [A380Failure.UpperRudderYellowEbhaElectricalPart, A380Failure.UpperRudderGreenEbhaElectricalPart],
    [A380Failure.LowerRudderGreenEbhaElectricalPart, A380Failure.LowerRudderYellowEbhaElectricalPart],
  ],
};

/**
 * Reads the actuator failures.
 * @param failureActive whether a flyPad failure is active
 * @returns the failed actuators of each surface
 */
export function readFctlActuatorFailures(failureActive: (failure: number) => boolean): FctlActuatorFailures {
  const pairs = (surface: ActuatorPairSurfaces): ActuatorPairFailed[] =>
    ACTUATOR_FAILURE_IDS[surface].map(
      ([first, second]): ActuatorPairFailed => [failureActive(first), failureActive(second)],
    );
  return {
    ailerons: pairs('ailerons'),
    elevators: pairs('elevators'),
    rudders: pairs('rudders'),
    rudderEbhaElectricalParts: pairs('rudderEbhaElectricalParts'),
    stabilizerMotors: [
      failureActive(A380Failure.StabilizerGreenHydraulicMotor),
      failureActive(A380Failure.StabilizerYellowHydraulicMotor),
    ],
    stabilizerJammed: failureActive(A380Failure.StabilizerJammed),
    stabilizerElectricMotorFailed: failureActive(A380Failure.StabilizerElectricMotor),
    primElevatorActuatorControlLost: [
      failureActive(A380Failure.Prim1ElevatorActuatorControl),
      failureActive(A380Failure.Prim2ElevatorActuatorControl),
      failureActive(A380Failure.Prim3ElevatorActuatorControl),
    ],
    primRudderActuatorControlLost: [
      failureActive(A380Failure.Prim1RudderActuatorControl),
      failureActive(A380Failure.Prim2RudderActuatorControl),
      failureActive(A380Failure.Prim3RudderActuatorControl),
    ],
  };
}

export interface FctlActuatorAlertStates {
  aileronActuatorFault: boolean;
  aileronElecActuatorFault: boolean;
  /** Lost ailerons, in the order of AILERON_NAMES */
  aileronFault: boolean[];
  elevatorActuatorFault: boolean;
  elevatorElecActuatorFault: boolean;
  /** Lost elevators, in the order of ELEVATOR_NAMES */
  elevatorFault: boolean[];
  singleElevatorFault: boolean;
  /** Two elevators or more are lost */
  doubleElevatorFault: boolean;
  rudderActuatorFault: boolean;
  rudderElecActuatorFault: boolean;
  /** Both EBHAs of the UPPER (LOWER) rudder are failed: SINGLE RUDDER FAULT */
  upperRudderFault: boolean;
  lowerRudderFault: boolean;
  stabilizerActuatorFault: boolean;
  /**
   * STABILIZER ELEC ACTUATOR FAULT: the electric motor of the stabilizer is failed. Not with STABILIZER FAULT, which
   * locks the pitch trim. Design choice: the electric motor has no model, so the failure only raises the alert.
   */
  stabilizerElecActuatorFault: boolean;
  /** The stabilizer is jammed, or none of its hydraulic motors works (the electric motor is not simulated) */
  stabilizerFault: boolean;
  /** PRIM 1, 2 and 3 ELEVATOR (RUDDER) ACTUATOR FAULT */
  primElevatorActuatorFault: boolean[];
  primRudderActuatorFault: boolean[];
}

const bothFailed = ([first, second]: ActuatorPairFailed) => first && second;
const onlyFirstFailed = ([first, second]: ActuatorPairFailed) => first && !second;
const onlySecondFailed = ([first, second]: ActuatorPairFailed) => !first && second;
const oneFailed = (pair: ActuatorPairFailed) => onlyFirstFailed(pair) || onlySecondFailed(pair);

/**
 * The alerts of the actuator failures:
 * - (ELEC) ACTUATOR FAULT: one actuator (one EHA) of a surface is failed, the other one controls the surface
 * - L(R) INR(MID)(OUTR) AILERON FAULT, SINGLE (DOUBLE) ELEVATOR FAULT, SINGLE RUDDER FAULT and STABILIZER FAULT: both
 *   actuators of the surface are failed
 * - RUDDER ELEC ACTUATOR FAULT: the electrical part of an EBHA is failed, the EBHA still works as a conventional
 *   actuator
 * - PRIM 1(2)(3) ELEVATOR (RUDDER) ACTUATOR FAULT: a running PRIM has lost the control of its actuator, the SEC took
 *   it over. A failed PRIM shows PRIM 1(2)(3) FAULT instead.
 * @param failures the failed actuators
 * @param primHealthy whether PRIM 1, 2 and 3 are healthy
 * @returns the alert states
 */
export function fctlActuatorAlerts(failures: FctlActuatorFailures, primHealthy: boolean[]): FctlActuatorAlertStates {
  const aileronFault = failures.ailerons.map(bothFailed);
  const elevatorFault = failures.elevators.map(bothFailed);
  const lostElevators = elevatorFault.filter((lost) => lost).length;
  const rudderEbhaElecFailed = (rudder: number, ebha: number) =>
    failures.rudderEbhaElectricalParts[rudder][ebha] && !failures.rudders[rudder][ebha];
  const [greenMotorFailed, yellowMotorFailed] = failures.stabilizerMotors;
  const stabilizerFault = failures.stabilizerJammed || (greenMotorFailed && yellowMotorFailed);

  return {
    aileronActuatorFault: failures.ailerons.some((pair, aileron) =>
      OUTER_AILERONS.includes(aileron) ? oneFailed(pair) : onlyFirstFailed(pair),
    ),
    aileronElecActuatorFault: failures.ailerons.some(
      (pair, aileron) => !OUTER_AILERONS.includes(aileron) && onlySecondFailed(pair),
    ),
    aileronFault,
    elevatorActuatorFault: failures.elevators.some(onlyFirstFailed),
    elevatorElecActuatorFault: failures.elevators.some(onlySecondFailed),
    elevatorFault,
    singleElevatorFault: lostElevators === 1,
    doubleElevatorFault: lostElevators >= 2,
    rudderActuatorFault: failures.rudders.some(oneFailed),
    rudderElecActuatorFault: [0, 1].some(
      (rudder) => rudderEbhaElecFailed(rudder, 0) || rudderEbhaElecFailed(rudder, 1),
    ),
    upperRudderFault: bothFailed(failures.rudders[0]),
    lowerRudderFault: bothFailed(failures.rudders[1]),
    stabilizerActuatorFault: !stabilizerFault && (greenMotorFailed || yellowMotorFailed),
    stabilizerElecActuatorFault: !stabilizerFault && failures.stabilizerElectricMotorFailed,
    stabilizerFault,
    primElevatorActuatorFault: failures.primElevatorActuatorControlLost.map(
      (lost, prim) => lost && Boolean(primHealthy[prim]),
    ),
    primRudderActuatorFault: failures.primRudderActuatorControlLost.map(
      (lost, prim) => lost && Boolean(primHealthy[prim]),
    ),
  };
}

/** Flight phases in which each alert is inhibited */
export const AILERON_ACTUATOR_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];
export const AILERON_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 10];
export const ELEVATOR_ACTUATOR_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];
export const ELEVATOR_FAULT_PHASE_INHIBITION = [4, 5, 6, 7];
export const RUDDER_ACTUATOR_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10, 11];
export const RUDDER_ELEC_ACTUATOR_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];
export const STABILIZER_ACTUATOR_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10, 11];
export const STABILIZER_FAULT_PHASE_INHIBITION = [4, 5, 6];
export const PRIM_ACTUATOR_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8, 9, 10, 11];

/** STABILIZER FAULT: the MAX SPEED applies when the stabilizer is locked above 3.9 deg nose up */
const STABILIZER_MAX_SPEED_TRIM_DEGREES_UP = 3.9;
/** STABILIZER FAULT: the stabilizer can only be locked that far nose up when it fails at low speed */
const STABILIZER_FAULT_LOW_SPEED_KNOTS = 240;

/** The FWS states of the actuator alerts, and the speed at which the stabilizer failed */
export class FctlActuatorAlertMonitor {
  public readonly aileronActuatorFault = Subject.create(false);
  public readonly aileronElecActuatorFault = Subject.create(false);
  /** In the order of AILERON_NAMES */
  public readonly aileronFault = AILERON_NAMES.map(() => Subject.create(false));
  public readonly elevatorActuatorFault = Subject.create(false);
  public readonly elevatorElecActuatorFault = Subject.create(false);
  /** In the order of ELEVATOR_NAMES */
  public readonly elevatorFault = ELEVATOR_NAMES.map(() => Subject.create(false));
  public readonly singleElevatorFault = Subject.create(false);
  public readonly doubleElevatorFault = Subject.create(false);
  public readonly rudderActuatorFault = Subject.create(false);
  public readonly rudderElecActuatorFault = Subject.create(false);
  public readonly upperRudderFault = Subject.create(false);
  public readonly lowerRudderFault = Subject.create(false);
  public readonly stabilizerActuatorFault = Subject.create(false);
  public readonly stabilizerElecActuatorFault = Subject.create(false);
  public readonly stabilizerFault = Subject.create(false);
  /** STABILIZER FAULT: the failure was detected below 240 kt, the stabilizer position has to be checked */
  public readonly stabilizerFailedAtLowSpeed = Subject.create(false);
  /** STABILIZER FAULT: the stabilizer is locked above 3.9 deg nose up, MAX SPEED 260 KT */
  public readonly stabilizerLockedNoseUp = Subject.create(false);
  /** PRIM 1, 2 and 3 */
  public readonly primElevatorActuatorFault = [0, 1, 2].map(() => Subject.create(false));
  public readonly primRudderActuatorFault = [0, 1, 2].map(() => Subject.create(false));

  /**
   * Updates the alert states.
   * @param failures the failed actuators
   * @param primHealthy whether PRIM 1, 2 and 3 are healthy (the PRIM healthy L:vars read as 0 or 1)
   * @param computedAirspeedKnots the computed airspeed, null when no ADR gives it
   * @param stabilizerPositionDegrees the stabilizer position, nose up positive
   */
  public update(
    failures: FctlActuatorFailures,
    primHealthy: boolean[],
    computedAirspeedKnots: number | null,
    stabilizerPositionDegrees: number,
  ) {
    const states = fctlActuatorAlerts(failures, primHealthy);

    if (states.stabilizerFault && !this.stabilizerFault.get()) {
      this.stabilizerFailedAtLowSpeed.set(
        computedAirspeedKnots !== null && computedAirspeedKnots < STABILIZER_FAULT_LOW_SPEED_KNOTS,
      );
    }
    this.stabilizerLockedNoseUp.set(
      states.stabilizerFault && stabilizerPositionDegrees > STABILIZER_MAX_SPEED_TRIM_DEGREES_UP,
    );

    this.aileronActuatorFault.set(states.aileronActuatorFault);
    this.aileronElecActuatorFault.set(states.aileronElecActuatorFault);
    states.aileronFault.forEach((lost, aileron) => this.aileronFault[aileron].set(lost));
    this.elevatorActuatorFault.set(states.elevatorActuatorFault);
    this.elevatorElecActuatorFault.set(states.elevatorElecActuatorFault);
    states.elevatorFault.forEach((lost, elevator) => this.elevatorFault[elevator].set(lost));
    this.singleElevatorFault.set(states.singleElevatorFault);
    this.doubleElevatorFault.set(states.doubleElevatorFault);
    this.rudderActuatorFault.set(states.rudderActuatorFault);
    this.rudderElecActuatorFault.set(states.rudderElecActuatorFault);
    this.upperRudderFault.set(states.upperRudderFault);
    this.lowerRudderFault.set(states.lowerRudderFault);
    this.stabilizerActuatorFault.set(states.stabilizerActuatorFault);
    this.stabilizerElecActuatorFault.set(states.stabilizerElecActuatorFault);
    this.stabilizerFault.set(states.stabilizerFault);
    states.primElevatorActuatorFault.forEach((fault, prim) => this.primElevatorActuatorFault[prim].set(fault));
    states.primRudderActuatorFault.forEach((fault, prim) => this.primRudderActuatorFault[prim].set(fault));
  }
}

/** EcamInopSys keys of the elevators, in the order of ELEVATOR_NAMES */
const ELEVATOR_INOP_SYS = ['270300107', '270300105', '270300106', '270300108'];

/**
 * INOP SYS ALL PHASES of the lost elevators (SINGLE and DOUBLE ELEVATOR FAULT).
 * @param elevatorFault the lost elevators, in the order of ELEVATOR_NAMES
 * @returns the INOP SYS keys
 */
export function lostElevatorsInopSys(elevatorFault: boolean[]): string[] {
  return ELEVATOR_INOP_SYS.filter((_, elevator) => elevatorFault[elevator]);
}
