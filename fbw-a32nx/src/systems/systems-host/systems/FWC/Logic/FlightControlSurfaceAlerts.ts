// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The F/CTL surface cautions, from the FCDC discrete words that the C++ flight controls already write
 * (fbw_a320/src/fcdc/Fcdc.cpp getBusOutputs, L:A32NX_FCDC_n_DISCRETE_WORD_1..5):
 * - F/CTL AIL SERVO FAULT; F/CTL L(R) AIL FAULT
 * - F/CTL ELEV SERVO FAULT; F/CTL L(R) ELEV FAULT
 * - F/CTL ELAC 1(2) PITCH FAULT
 * - F/CTL SPLR FAULT
 * - F/CTL ELAC 1(2) FAULT (BOTH COMPUTERS FAILED): one alert instead of ELAC 1 FAULT + ELAC 2 FAULT
 *
 * Not modelled (no model output): GND SPLR 5 FAULT and
 * GND SPLR (1+2)(3+4) FAULT (the SEC ground spoiler fault bit, SEC discrete word 1 bit 24, is a constant false), SPD BRK
 * 2 (3+4) FAULT and SPD BRK FAULT (the SEC speed brake lever word is never invalid), the rudder pedal transducer part of
 * AIL SERVO FAULT and the flutter protection part of L(R) ELEV FAULT.
 *
 * How a surface is seen: each aileron and each elevator has two servojacks. The FCDC tells, for each servojack, whether
 * its computer reports it available. A servojack is lost for one of three causes:
 * - its computer(s) failed: the ELAC (SEC) FAULT alerts cover that;
 * - its hydraulic system is at low pressure: the HYD alerts cover that (their STATUS lists the lost surfaces: G+B
 *   SYS LO PR L ELEV, L+R AIL; B+Y SYS LO PR R ELEV);
 * - else a servo fault (the ELAC/SEC discrete input L:A32NX_LEFT_AIL_SERVO_1_FAILED etc.): the F/CTL alerts here.
 * Design choice: a surface fault (L(R) AIL FAULT, L(R) ELEV FAULT) is shown when both servojacks are lost, unless both
 * are lost by their hydraulics alone or by their computers alone (then the HYD or ELAC/SEC alert is the procedure).
 */

/** The flight phase inhibitions. The A320 FWC phases are 1 to 10. */
export const FlightControlSurfacePhaseInhibition = {
  ailServoFault: [3, 4, 5, 7, 8],
  /** ELAC 1(2) FAULT, both variants */
  elacFault: [3, 4, 5, 7, 8],
  elacPitchFault: [3, 4, 5, 7, 8],
  elevServoFault: [3, 4, 5],
  /** L(R) AIL FAULT */
  aileronFault: [4, 5],
  /** L(R) ELEV FAULT */
  elevatorFault: [4, 5],
  spoilerFault: [3, 4, 5, 7],
  fcdc12Fault: [4, 5, 7],
};

/**
 * Design choice: a hydraulic system counts as pressurised for the servojacks only 3 s after its pressure switch closes.
 * The ELACs confirm the pressure for 0.5 s before they report their servojacks available again (ElacComputer_data.cpp
 * ConfirmNode timeDelay 0.5), so without this margin a recovered system would show a servojack loss for a moment.
 */
export const HYDRAULIC_RECOVERY_CONFIRM_SECONDS = 3;

/** One FCDC discrete word as the FWC reads it (Arinc429Word) */
export interface FcdcDiscreteWord {
  isNormalOperation(): boolean;
  /** The bit when the word is valid (normal operation or functional test), else the given value */
  bitValueOr(bit: number, valueIfInvalid: boolean): boolean;
}

/** The FCDC words used here: L:A32NX_FCDC_n_DISCRETE_WORD_1, _3 and _5 (Fcdc.cpp efcsStatus1, 3 and 5) */
export interface FcdcWords {
  word1: FcdcDiscreteWord;
  word3: FcdcDiscreteWord;
  word5: FcdcDiscreteWord;
}

/** The bits of the FCDC discrete words (Fcdc.cpp getBusOutputs) */
export const FcdcBits = {
  word1: {
    /** The ELAC 1 cannot engage in pitch (ELAC discrete word 1 bit 21), true when the ELAC sends nothing */
    elac1PitchFault: 19,
    /** The ELAC 1 cannot engage in roll (ELAC discrete word 1 bit 22) */
    elac1RollFault: 20,
    elac2PitchFault: 21,
    elac2RollFault: 22,
    /** The ELAC 1 is not valid (failed or OFF) */
    elac1Invalid: 23,
    elac2Invalid: 24,
    sec1Invalid: 25,
    sec2Invalid: 26,
    sec3Invalid: 29,
  },
  word3: {
    /** The left aileron servojack of the ELAC 1 is available (blue hydraulic), ELAC discrete word 1 bit 15 */
    leftAileronElac1Available: 11,
    /** The left aileron servojack of the ELAC 2 is available (green hydraulic) */
    leftAileronElac2Available: 12,
    /** The right aileron servojack of the ELAC 1 is available (green hydraulic), ELAC discrete word 1 bit 16 */
    rightAileronElac1Available: 13,
    /** The right aileron servojack of the ELAC 2 is available (blue hydraulic) */
    rightAileronElac2Available: 14,
    /** The left elevator servojack of the ELAC 1 / SEC 1 is available (blue hydraulic) */
    leftElevator1Available: 15,
    /** The left elevator servojack of the ELAC 2 / SEC 2 is available (green hydraulic) */
    leftElevator2Available: 16,
    /** The right elevator servojack of the ELAC 1 / SEC 1 is available (blue hydraulic) */
    rightElevator1Available: 17,
    /** The right elevator servojack of the ELAC 2 / SEC 2 is available (yellow hydraulic) */
    rightElevator2Available: 18,
  },
  word5: {
    /** Spoiler 1 to 5 servo fault (SEC 3: spoilers 1 and 2, SEC 1: spoilers 3 and 4, SEC 2: spoiler 5) */
    spoilerFault: [21, 22, 23, 24, 25],
  },
};

export type HydraulicSystem = 'blue' | 'green' | 'yellow';

export interface FlightControlSurfaceInputs {
  fcdc1: FcdcWords;
  fcdc2: FcdcWords;
  /** The hydraulic pressure switches (L:A32NX_HYD_<system>_SYSTEM_1_SECTION_PRESSURE_SWITCH) */
  bluePressurised: boolean;
  greenPressurised: boolean;
  yellowPressurised: boolean;
}

export interface FlightControlSurfaceState {
  elac1PitchFault: boolean;
  elac2PitchFault: boolean;
  elevServoFault: boolean;
  leftElevatorFault: boolean;
  rightElevatorFault: boolean;
  /** The left or the right elevator is lost, any cause: drives the SPD BRK DO NOT USE line of ALTN LAW */
  leftOrRightElevatorLost: boolean;
  ailServoFault: boolean;
  leftAileronFault: boolean;
  rightAileronFault: boolean;
  /** Index 0 is spoiler 1 */
  spoilerFaults: boolean[];
  spoilerFault: boolean;
}

export const NO_SURFACE_FAULT: FlightControlSurfaceState = {
  elac1PitchFault: false,
  elac2PitchFault: false,
  elevServoFault: false,
  leftElevatorFault: false,
  rightElevatorFault: false,
  leftOrRightElevatorLost: false,
  ailServoFault: false,
  leftAileronFault: false,
  rightAileronFault: false,
  spoilerFaults: [false, false, false, false, false],
  spoilerFault: false,
};

/** A bit set in at least one valid FCDC word */
function reported(word1: FcdcDiscreteWord, word2: FcdcDiscreteWord, bit: number): boolean {
  return word1.bitValueOr(bit, false) || word2.bitValueOr(bit, false);
}

/** An "available" bit cleared in at least one valid FCDC word (as the L+R ELEV FAULT computation of the FWC) */
function reportedUnavailable(word1: FcdcDiscreteWord, word2: FcdcDiscreteWord, bit: number): boolean {
  return (
    (word1.isNormalOperation() && !word1.bitValueOr(bit, true)) ||
    (word2.isNormalOperation() && !word2.bitValueOr(bit, true))
  );
}

/** One servojack and why it is lost */
interface ServojackLoss {
  lost: boolean;
  byComputer: boolean;
  byHydraulic: boolean;
}

/** A servo fault: lost while its computers and its hydraulic system are fine */
const isServoLoss = (servojack: ServojackLoss) => servojack.lost && !servojack.byComputer && !servojack.byHydraulic;

/** Both servojacks of a surface lost, not by the hydraulics alone nor by the computers alone (see the header) */
function isSurfaceFault(a: ServojackLoss, b: ServojackLoss): boolean {
  return a.lost && b.lost && !(a.byHydraulic && b.byHydraulic) && !(a.byComputer && b.byComputer);
}

/** One servojack of a surface lost by a servo fault, the other one still available */
function isServojackFault(a: ServojackLoss, b: ServojackLoss): boolean {
  return (isServoLoss(a) && !b.lost) || (isServoLoss(b) && !a.lost);
}

/**
 * The F/CTL surface cautions from the FCDC words. It keeps the time each hydraulic system has been pressurised (see
 * HYDRAULIC_RECOVERY_CONFIRM_SECONDS), so it is one instance updated every FWC cycle.
 */
export class FlightControlSurfaceMonitor {
  private readonly pressurisedSeconds: Record<HydraulicSystem, number> = { blue: 0, green: 0, yellow: 0 };

  /**
   * @param inputs the FCDC words and the hydraulic pressure switches
   * @param deltaTimeSeconds the time since the last update
   * @returns the surface cautions
   */
  update(inputs: FlightControlSurfaceInputs, deltaTimeSeconds: number): FlightControlSurfaceState {
    const pressurised: Record<HydraulicSystem, boolean> = {
      blue: inputs.bluePressurised,
      green: inputs.greenPressurised,
      yellow: inputs.yellowPressurised,
    };
    for (const system of ['blue', 'green', 'yellow'] as const) {
      this.pressurisedSeconds[system] = pressurised[system] ? this.pressurisedSeconds[system] + deltaTimeSeconds : 0;
    }
    const hydraulicOk = (system: HydraulicSystem) =>
      this.pressurisedSeconds[system] >= HYDRAULIC_RECOVERY_CONFIRM_SECONDS;
    return computeSurfaceState(inputs.fcdc1, inputs.fcdc2, hydraulicOk);
  }
}

/**
 * The surface cautions for given hydraulic states.
 * @param fcdc1 the FCDC 1 words
 * @param fcdc2 the FCDC 2 words
 * @param hydraulicOk whether a hydraulic system is (confirmed) pressurised
 * @returns the surface cautions
 */
export function computeSurfaceState(
  fcdc1: FcdcWords,
  fcdc2: FcdcWords,
  hydraulicOk: (system: HydraulicSystem) => boolean,
): FlightControlSurfaceState {
  const w1 = FcdcBits.word1;
  const w3 = FcdcBits.word3;
  const word1 = (bit: number) => reported(fcdc1.word1, fcdc2.word1, bit);
  const unavailable = (bit: number) => reportedUnavailable(fcdc1.word3, fcdc2.word3, bit);

  const elac1Invalid = word1(w1.elac1Invalid);
  const elac2Invalid = word1(w1.elac2Invalid);
  const sec1Invalid = word1(w1.sec1Invalid);
  const sec2Invalid = word1(w1.sec2Invalid);

  const servojack = (availableBit: number, computersFailed: boolean, system: HydraulicSystem): ServojackLoss => ({
    lost: unavailable(availableBit),
    byComputer: computersFailed,
    byHydraulic: !hydraulicOk(system),
  });

  // Ailerons: the ELAC 1 drives the blue left and the green right servojacks, the ELAC 2 the green left and the blue
  // right ones (ElacComputer.cpp leftAileronAvail / rightAileronAvail)
  const leftAileron1 = servojack(w3.leftAileronElac1Available, elac1Invalid, 'blue');
  const leftAileron2 = servojack(w3.leftAileronElac2Available, elac2Invalid, 'green');
  const rightAileron1 = servojack(w3.rightAileronElac1Available, elac1Invalid, 'green');
  const rightAileron2 = servojack(w3.rightAileronElac2Available, elac2Invalid, 'blue');

  // Elevators: the ELAC 1 / SEC 1 drive the blue servojacks, the ELAC 2 / SEC 2 the green left and the yellow right ones
  const leftElevator1 = servojack(w3.leftElevator1Available, elac1Invalid && sec1Invalid, 'blue');
  const leftElevator2 = servojack(w3.leftElevator2Available, elac2Invalid && sec2Invalid, 'green');
  const rightElevator1 = servojack(w3.rightElevator1Available, elac1Invalid && sec1Invalid, 'blue');
  const rightElevator2 = servojack(w3.rightElevator2Available, elac2Invalid && sec2Invalid, 'yellow');

  const leftElevatorLost = leftElevator1.lost && leftElevator2.lost;
  const rightElevatorLost = rightElevator1.lost && rightElevator2.lost;

  // ELAC 1(2) PITCH FAULT: the pitch channel of the ELAC failed. The pitch channel of a valid ELAC is lost
  // while its roll channel works (both lost is ELAC 1(2) FAULT). The ELAC 1 pitch needs the blue system, the ELAC 2 the
  // green and yellow ones or one of them without blue (ElacComputer.cpp canEngageInPitch): a loss by the hydraulics is
  // for the HYD alerts.
  const elac2PitchHydraulicOk =
    (hydraulicOk('green') && hydraulicOk('yellow')) ||
    (!hydraulicOk('blue') && (hydraulicOk('green') || hydraulicOk('yellow')));
  const elac1PitchFault =
    !elac1Invalid && word1(w1.elac1PitchFault) && !word1(w1.elac1RollFault) && hydraulicOk('blue');
  const elac2PitchFault =
    !elac2Invalid && word1(w1.elac2PitchFault) && !word1(w1.elac2RollFault) && elac2PitchHydraulicOk;

  const spoilerFaults = FcdcBits.word5.spoilerFault.map((bit) => reported(fcdc1.word5, fcdc2.word5, bit));

  return {
    elac1PitchFault,
    elac2PitchFault,
    elevServoFault: isServojackFault(leftElevator1, leftElevator2) || isServojackFault(rightElevator1, rightElevator2),
    // both elevators lost is L+R ELEV FAULT
    leftElevatorFault: isSurfaceFault(leftElevator1, leftElevator2) && !rightElevatorLost,
    rightElevatorFault: isSurfaceFault(rightElevator1, rightElevator2) && !leftElevatorLost,
    leftOrRightElevatorLost: leftElevatorLost || rightElevatorLost,
    ailServoFault: isServojackFault(leftAileron1, leftAileron2) || isServojackFault(rightAileron1, rightAileron2),
    leftAileronFault: isSurfaceFault(leftAileron1, leftAileron2),
    rightAileronFault: isSurfaceFault(rightAileron1, rightAileron2),
    spoilerFaults,
    spoilerFault: spoilerFaults.some((fault) => fault),
  };
}

/**
 * ELAC 1 FAULT, ELAC 2 FAULT and the BOTH COMPUTERS FAILED variant: when both ELAC FAULT alerts are active, one
 * alert with the procedure for both computers replaces them.
 * @param elac1Fault the ELAC 1 FAULT condition (confirmed)
 * @param elac2Fault the ELAC 2 FAULT condition (confirmed)
 * @returns which of the three alerts is active
 */
export function elacFaultAlerts(
  elac1Fault: boolean,
  elac2Fault: boolean,
): { elac1Fault: boolean; elac2Fault: boolean; elac12Fault: boolean } {
  const both = elac1Fault && elac2Fault;
  return { elac1Fault: elac1Fault && !both, elac2Fault: elac2Fault && !both, elac12Fault: both };
}

/**
 * F/CTL ELAC 1+2 FAULT lines (EwdMessages 2701010xx: title, -ELAC 1 OFF THEN ON, -ELAC 2 OFF THEN ON, .IF BOTH ELAC
 * FAULT, -ELAC 1 OFF, -ELAC 2 OFF, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE).
 * The procedure: ELAC 1 OFF THEN ON, ELAC 2 OFF THEN ON, and if both ELAC FAULT remain ELAC 1 OFF, ELAC 2 OFF; then
 * the ALTN LAW procedure (the existing F/CTL ALTN LAW alert shows it, with its MAX SPEED 320 KT), then FUEL CONSUMPT
 * INCRSD and FMS PRED UNRELIABLE.
 * Design choice: the documented procedure name "ELAC 1(2) FAULT (BOTH COMPUTERS FAILED)" is no E/WD title; the
 * title is "ELAC 1+2 FAULT" as FCDC 1+2 FAULT, FAC 1+2 FAULT and the INOP SYS line "ELAC 1+2". The action
 * lines of an ELAC go once it is OFF (as elacFaultLines).
 * @param elac1ProcedureShown the ELAC 1 failed and its pb is not OFF
 * @param elac2ProcedureShown the ELAC 2 failed and its pb is not OFF
 * @returns the line indexes, null for a hidden line
 */
export function elac12FaultLines(elac1ProcedureShown: boolean, elac2ProcedureShown: boolean): (number | null)[] {
  return [
    0,
    elac1ProcedureShown ? 1 : null,
    elac2ProcedureShown ? 2 : null,
    elac1ProcedureShown || elac2ProcedureShown ? 3 : null,
    elac1ProcedureShown ? 4 : null,
    elac2ProcedureShown ? 5 : null,
    6,
    7,
  ];
}

/**
 * F/CTL L(R) ELEV FAULT lines (EwdMessages 270105001-003 / 270106001-003: title, MANEUVER WITH CARE, FOR GA: MAX PITCH
 * 15 DEG). The associated F/CTL ALTN LAW procedure (MAX SPEED 320 KT, SPD BRK DO NOT USE) is the
 * existing ALTN LAW alert, its SPD BRK line keyed on the elevator loss (leftOrRightElevatorLost).
 * @returns the line indexes
 */
export function elevatorFaultLines(): (number | null)[] {
  return [0, 1, 2];
}

/**
 * F/CTL L(R) AIL FAULT lines (EwdMessages 270108001-003 / 270109001-003: title, FUEL CONSUMPT INCRSD, FMS PRED
 * UNRELIABLE).
 * @returns the line indexes
 */
export function aileronFaultLines(): (number | null)[] {
  return [0, 1, 2];
}

/**
 * F/CTL SPLR FAULT lines (EwdMessages 270110001-002: title, SPD BRK DO NOT USE).
 * SPD BRK DO NOT USE shows when the spoilers 3+4 are affected. The spoilers 3 and 4 are one speed brake pair of the
 * SEC 1: one of them faulty makes both unavailable (Fcdc.cpp spoiler34Avail).
 * Not shown, no model output: the lines for one or more spoilers fully extended (OPT SPD G DOT+10, AP DO NOT USE)
 * and for spoilers extended (FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE).
 * @param spoilerFaults the faulty spoilers 1 to 5
 * @returns the line indexes, null for a hidden line
 */
export function spoilerFaultLines(spoilerFaults: readonly boolean[]): (number | null)[] {
  return [0, spoilerFaults[2] || spoilerFaults[3] ? 1 : null];
}
