// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { isTirePressureAbnormal, TIRE_COUNT, tirePressureVar } from '@shared/TirePressures';

/*
 * Brake temperatures, tire pressures, the braking / steering control lines and the WING ACCU gauge of the WHEEL SD
 * page.
 */

/** Above this the brake temperature is excessive (amber) */
const BRAKE_TEMPERATURE_EXCESSIVE_C = 300;
/** The green hottest brake arc shows only above this brake temperature */
const HOTTEST_BRAKE_GREEN_ARC_MIN_C = 100;

/**
 * The brake temperature shown: steps of 5 °C between 0 and 995 °C (FBW display, kept).
 * @param rawTemperature the BTMS brake temperature in °C (L:A32NX_REPORTED_BRAKE_TEMPERATURE_n)
 * @returns the displayed temperature
 */
export function roundBrakeTemperature(rawTemperature: number): number {
  return Math.min(995, Math.max(0, Math.round(rawTemperature / 5) * 5));
}

/**
 * Colour of the brake temperature: amber when it exceeds 300 °C, else green.
 * @param rawTemperature the brake temperature in °C
 * @returns 'Amber' or 'Green'
 */
export function brakeTemperatureColour(rawTemperature: number): 'Amber' | 'Green' {
  return rawTemperature > BRAKE_TEMPERATURE_EXCESSIVE_C ? 'Amber' : 'Green';
}

/** The arc over a brake that marks the hottest brake of the aircraft */
export enum HottestBrakeArc {
  None,
  /** hottest brake, above 100 °C */
  Green,
  /** hottest brake, above 300 °C */
  Amber,
}

/**
 * The arcs of the hottest brakes: the arc marks the hottest wheel brake of the aircraft, green above 100 °C, amber
 * above 300 °C.
 * Design choice: the hottest brake is found on the displayed (rounded) temperatures, so brakes that show the same
 * highest value all get the arc, as the A32NX WHEEL page; the 100 °C and 300 °C thresholds use the measured value, as
 * the colour of the number (brakeTemperatureColour). A temperature that is not a finite number has no arc.
 * @param rawTemperatures the brake temperatures in °C, brake 1 first
 * @returns the arc of each brake, in the same order
 */
export function hottestBrakeArcs(rawTemperatures: readonly number[]): HottestBrakeArc[] {
  const displayed = rawTemperatures.map((t) => (Number.isFinite(t) ? roundBrakeTemperature(t) : null));
  const hottest = displayed.reduce<number | null>(
    (max, t) => (t !== null && (max === null || t > max) ? t : max),
    null,
  );
  return rawTemperatures.map((raw, i) => {
    if (displayed[i] === null || displayed[i] !== hottest) {
      return HottestBrakeArc.None;
    }
    if (raw > BRAKE_TEMPERATURE_EXCESSIVE_C) {
      return HottestBrakeArc.Amber;
    }
    return raw > HOTTEST_BRAKE_GREEN_ARC_MIN_C ? HottestBrakeArc.Green : HottestBrakeArc.None;
  });
}

/** What the braking and steering control lines read from the Rust model (brake_steer_faults.rs) */
export interface WheelControlInputs {
  /** L:A32NX_BRAKES_NORM_BRK_FAULT: the BCS normal braking is failed */
  normBrkFault: boolean;
  /** L:A32NX_BRAKES_ALTN_BRK_FAULT: the BCS alternate braking is failed */
  altnBrkFault: boolean;
  /** L:A32NX_BRAKES_EMER_BRK_FAULT: the EBCU is failed */
  emerBrkFault: boolean;
  /** L:A32NX_BRAKES_AUTO_BRK_FAULT: the autobrake is failed */
  autoBrkFault: boolean;
  /** L:A32NX_STEERING_SCS_1_FAULT */
  scs1Fault: boolean;
  /** L:A32NX_STEERING_SCS_2_FAULT */
  scs2Fault: boolean;
}

/** The BRK CTL line and the AUTO BRAKE indication */
interface BrakeControlIndication {
  lineVisible: boolean;
  bcs1Failed: boolean;
  bcs2Failed: boolean;
  ebcuFailed: boolean;
  /** AUTO BRAKE shows when the autobrake is failed, with or without MORE */
  autoBrakeFailedVisible: boolean;
}

/**
 * BRK CTL line: shown when one or more braking control systems (BCS 1, BCS 2, EBCU) are failed, or on the MORE page.
 * Design choice: the BCS controls the normal and the alternate braking modes with two redundant systems, BCS 1 and
 * BCS 2, and the loss of both reverts to the emergency braking. The model has no BCS 1/2 split, only the normal,
 * alternate and emergency braking faults: BCS 1 and BCS 2 show failed together when both the normal and the alternate
 * braking are failed; one BCS alone cannot fail.
 * @param inputs the brake faults
 * @param moreShown the WHEEL MORE page is shown (L:A32NX_ECAM_SD_MORE_SHOWN)
 * @returns the indication
 */
export function brakeControlIndication(inputs: WheelControlInputs, moreShown: boolean): BrakeControlIndication {
  const bcsFailed = inputs.normBrkFault && inputs.altnBrkFault;
  return {
    lineVisible: moreShown || bcsFailed || inputs.emerBrkFault,
    bcs1Failed: bcsFailed,
    bcs2Failed: bcsFailed,
    ebcuFailed: inputs.emerBrkFault,
    autoBrakeFailedVisible: inputs.autoBrkFault,
  };
}

/** The STEER CTL line */
interface SteeringControlIndication {
  lineVisible: boolean;
  scs1Failed: boolean;
  scs2Failed: boolean;
}

/**
 * STEER CTL line: shown when at least one steering control system (SCS 1, SCS 2) is failed, or on the MORE page.
 * @param inputs the SCS faults
 * @param moreShown the WHEEL MORE page is shown
 * @returns the indication
 */
export function steeringControlIndication(inputs: WheelControlInputs, moreShown: boolean): SteeringControlIndication {
  return {
    lineVisible: moreShown || inputs.scs1Fault || inputs.scs2Fault,
    scs1Failed: inputs.scs1Fault,
    scs2Failed: inputs.scs2Fault,
  };
}

/**
 * Reads the inputs of the control lines.
 * @param read reads one simvar as a number (SimVar.GetSimVarValue(name, 'number') in the sim)
 * @returns the inputs; the Bool L:vars read 1, compared with > 0
 */
export function readWheelControlInputs(read: (name: string) => number): WheelControlInputs {
  return {
    normBrkFault: read('L:A32NX_BRAKES_NORM_BRK_FAULT') > 0,
    altnBrkFault: read('L:A32NX_BRAKES_ALTN_BRK_FAULT') > 0,
    emerBrkFault: read('L:A32NX_BRAKES_EMER_BRK_FAULT') > 0,
    autoBrkFault: read('L:A32NX_BRAKES_AUTO_BRK_FAULT') > 0,
    scs1Fault: read('L:A32NX_STEERING_SCS_1_FAULT') > 0,
    scs2Fault: read('L:A32NX_STEERING_SCS_2_FAULT') > 0,
  };
}

/** Number of brakes with a temperature sensor (wheels 1-16; the centre axle wheels of the body gears have no brake) */
export const BRAKE_COUNT = 16;

/**
 * Reads the brake temperatures.
 * @param read reads one simvar in °C
 * @returns the temperatures of brakes 1 to 16
 */
export function readBrakeTemperatures(read: (name: string) => number): number[] {
  const temperatures: number[] = [];
  for (let i = 1; i <= BRAKE_COUNT; i++) {
    temperatures.push(read(`L:A32NX_REPORTED_BRAKE_TEMPERATURE_${i}`));
  }
  return temperatures;
}

/**
 * Reads the TPIS tire pressures (systems-host Misc/Tpis.ts).
 * @param read reads one simvar as a number
 * @returns the pressures of tires 1 to 22 in PSI (shared/TirePressures numbering)
 */
export function readTirePressures(read: (name: string) => number): number[] {
  const pressures: number[] = [];
  for (let tire = 1; tire <= TIRE_COUNT; tire++) {
    pressures.push(read(tirePressureVar(tire)));
  }
  return pressures;
}

/** How the WHEEL SD page shows the pressure of one tire */
interface TirePressureIndication {
  visible: boolean;
  amber: boolean;
}

/**
 * Tire pressure: green when normal, shown on the MORE page; amber, always shown, when low or when the two tire
 * pressures of the same axle differ too much (thresholds of WHEEL TIRE PRESS LO, shared/TirePressures).
 * @param pressuresPsi the TPIS pressures of tires 1 to 22
 * @param tire the tire, 1 to 22
 * @param flightPhase the FWS flight phase (L:A32NX_FWC_FLIGHT_PHASE)
 * @param moreShown the WHEEL MORE page is shown
 */
export function tirePressureIndication(
  pressuresPsi: readonly number[],
  tire: number,
  flightPhase: number,
  moreShown: boolean,
): TirePressureIndication {
  const amber = isTirePressureAbnormal(pressuresPsi, tire, flightPhase);
  return { visible: amber || moreShown, amber };
}

/** WING ACCU amber arc: 0 to 3480 PSI */
export const WING_ACCU_AMBER_ARC_MAX_PSI = 3480;
/** WING ACCU green arc: 4872 to more than 5000 PSI */
export const WING_ACCU_GREEN_ARC_MIN_PSI = 4872;
/** End of the gauge scale (5, x 1000 PSI) */
export const WING_ACCU_SCALE_MAX_PSI = 5000;

export interface WingAccuIndication {
  /** The gauge is shown */
  visible: boolean;
  /** The pressure is in the amber arc: amber needle, else green */
  amber: boolean;
  /** Needle position, x 1000 PSI, on the 0-5 scale */
  needleKpsi: number;
}

/**
 * WING ACCU pressure indication: shown when a wing brake accumulator pressure is low (in the amber arc), or on the
 * MORE page. It shows the lowest wing brake accumulator pressure, amber in the amber arc, else green.
 * Design choice: the model has one brake accumulator (L:A32NX_HYD_BRAKE_ALTN_ACC_PRESS) for the four of the aircraft;
 * it stands for the wing accumulators. A pressure that is not a finite number shows 0 psi, in amber.
 * @param pressurePsi the brake accumulator pressure
 * @param moreShown the WHEEL MORE page is shown (L:A32NX_ECAM_SD_MORE_SHOWN)
 * @returns the indication
 */
export function wingAccuIndication(pressurePsi: number, moreShown: boolean): WingAccuIndication {
  const pressure = Number.isFinite(pressurePsi) ? Math.max(0, pressurePsi) : 0;
  const amber = pressure <= WING_ACCU_AMBER_ARC_MAX_PSI;
  return {
    visible: moreShown || amber,
    amber,
    needleKpsi: Math.min(pressure, WING_ACCU_SCALE_MAX_PSI) / 1000,
  };
}
