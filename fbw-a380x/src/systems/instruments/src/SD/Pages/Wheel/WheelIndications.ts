// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Brake temperatures and the braking / steering control lines of the WHEEL SD page, A380 FCOM DSC-32-20-50/60/70.
 */

/** A380 FCOM DSC-32-20-70 BRAKE TEMPERATURE (a380_fcom.txt l.81367-81370): "The brake temperature exceeds 300 °C." */
export const BRAKE_TEMPERATURE_EXCESSIVE_C = 300;
/** l.81361-81363: "The green arc displays only if the brake temperature exceeds 100 °C." */
export const HOTTEST_BRAKE_GREEN_ARC_MIN_C = 100;

/**
 * The brake temperature shown: steps of 5 °C between 0 and 995 °C (FBW display, kept).
 * @param rawTemperature the BTMS brake temperature in °C (L:A32NX_REPORTED_BRAKE_TEMPERATURE_n)
 * @returns the displayed temperature
 */
export function roundBrakeTemperature(rawTemperature: number): number {
  return Math.min(995, Math.max(0, Math.round(rawTemperature / 5) * 5));
}

/**
 * Colour of the brake temperature (l.81357, l.81367-81370): amber when it exceeds 300 °C, else green.
 * @param rawTemperature the brake temperature in °C
 * @returns 'Amber' or 'Green'
 */
export function brakeTemperatureColour(rawTemperature: number): 'Amber' | 'Green' {
  return rawTemperature > BRAKE_TEMPERATURE_EXCESSIVE_C ? 'Amber' : 'Green';
}

/** The arc over a brake that marks the hottest brake of the aircraft */
export enum HottestBrakeArc {
  None,
  /** l.81361-81363: hottest brake, above 100 °C */
  Green,
  /** l.81372-81373: hottest brake, above 300 °C */
  Amber,
}

/**
 * The arcs of the hottest brakes (l.81361-81363, l.81372-81373): "The green arc indicates that it is the hottest wheel
 * brake on the aircraft. The green arc displays only if the brake temperature exceeds 100 °C." / "The brake temperature
 * exceeds 300 °C. The amber arc indicates that is the hottest wheel brake on the aircraft."
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
export interface BrakeControlIndication {
  lineVisible: boolean;
  bcs1Failed: boolean;
  bcs2Failed: boolean;
  ebcuFailed: boolean;
  /** l.81189-81193: "AUTO BRAKE ... Displayed when the AUTO BRK is failed." (with or without MORE) */
  autoBrakeFailedVisible: boolean;
}

/**
 * BRK CTL line (A380 FCOM DSC-32-20-50, l.81181-81187): "The braking control line displays when: One or more braking
 * control systems are failed (BCS and/or EBCU), or The MORE key on the ECP is pressed." "BCS 1(2) operates normally." /
 * "The EBCU is failed."
 * Design choice: the BCS "controls the normal and the alternate braking modes and has two redundant control systems
 * referred to as BCS 1 and BCS 2" (l.78852-78853) and "BCS 1 and BCS 2 fail" reverts to the emergency braking
 * (l.80062-80063). The model has no BCS 1/2 split, only the normal, alternate and emergency braking faults: BCS 1 and
 * BCS 2 show failed together when both the normal and the alternate braking are failed; one BCS alone cannot fail.
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
export interface SteeringControlIndication {
  lineVisible: boolean;
  scs1Failed: boolean;
  scs2Failed: boolean;
}

/**
 * STEER CTL line (A380 FCOM DSC-32-20-60, l.81309-81322): "The steering control line displays when: At least one
 * steering control system is failed, or The MORE key on the ECP is pressed." "SCS 1(2) operates normally." / "SCS 2(1)
 * is failed."
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
