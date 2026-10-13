// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The brake and steering legends of the SD WHEEL page, from the a320_systems brake model (BSCU channels 1 and 2, ABCU,
 * normal braking, nose wheel steering and autobrake fault L:vars, hydraulic/brake_control_units.rs) and the hydraulic
 * low pressures.
 */
export interface WheelBrakeInputs {
  /** BSCU channel 1 is lost (failed or unpowered), L:A32NX_BRAKES_BSCU_1_FAULT */
  readonly bscu1Lost: boolean;
  /** BSCU channel 2 is lost (failed or unpowered), L:A32NX_BRAKES_BSCU_2_FAULT */
  readonly bscu2Lost: boolean;
  /** The ABCU is lost (failed or unpowered): no alternate braking, L:A32NX_BRAKES_ALTN_BRK_FAULT */
  readonly alternateBrakingLost: boolean;
  /** The normal braking equipment is failed, L:A32NX_BRAKES_NORM_BRK_FAULT */
  readonly normalBrakingFailed: boolean;
  /** The autobrake is failed, L:A32NX_BRAKES_AUTO_BRK_FAULT */
  readonly autobrakeFailed: boolean;
  /** The nose wheel steering system is failed, L:A32NX_BRAKES_NW_STRG_FAULT */
  readonly noseWheelSteeringFailed: boolean;
  /** The A/SKID & N/W STRG sw is OFF */
  readonly antiSkidSwitchOff: boolean;
  /** The green hydraulic system is in low pressure */
  readonly greenLowPressure: boolean;
  /** The yellow hydraulic system is in low pressure */
  readonly yellowLowPressure: boolean;
}

/** The colour of a legend, or null when the legend is not displayed */
export type WheelLegendColour = 'Green' | 'Amber' | null;

export interface WheelBrakeIndications {
  /** N/W STEERING legend (always amber) with its Y hydraulic supply indication */
  readonly noseWheelSteering: boolean;
  /** ANTI SKID legend */
  readonly antiSkid: WheelLegendColour;
  /** The BSCU channel numbers shown in amber under the ANTI SKID legend: [channel 1, channel 2] */
  readonly failedBscuChannels: readonly [boolean, boolean];
  /** NORM BRK legend with its G hydraulic supply indication */
  readonly normalBraking: WheelLegendColour;
  /** ALTN BRK legend with its Y hydraulic supply indication */
  readonly alternateBraking: WheelLegendColour;
  /** ACCU ONLY under the ALTN BRK legend: alternate braking on the brake accumulator (yellow low pressure) */
  readonly accumulatorOnly: boolean;
}

/**
 * Computes the brake and steering legends of the SD WHEEL page (A320 FCOM DSC-32-20-20 and DSC-32-30-20, WHEEL SD page,
 * a320_fcom.txt l.51038-51047 and l.51564-51630). The G and Y hydraulic supply indications next to the legends take
 * their colour from the hydraulic pressure (HydraulicIndicator): green when available, amber in low pressure, as the
 * FCOM asks (l.51045-51047, 51616-51618, 51627-51629).
 * @param inputs the brake system state
 * @returns the legends to display
 */
export function wheelBrakeIndications(inputs: WheelBrakeInputs): WheelBrakeIndications {
  const bothBscuLost = inputs.bscu1Lost && inputs.bscu2Lost;

  // Normal braking needs the BSCU, the normal braking equipment, green pressure and the A/SKID & N/W STRG sw ON
  // (FCOM DSC-32-30-10 l.51251-51259). NORM BRK is amber "when normal braking is failed due to total BSCU failure, or to
  // the loss of the green hydraulic pressure, or to the loss of antiskid" (l.51613-51615).
  const normalBrakingLost =
    inputs.normalBrakingFailed || bothBscuLost || inputs.greenLowPressure || inputs.antiSkidSwitchOff;

  // The antiskid is deactivated "Electrically (A/SKID & N/W STRG sw OFF, or power supply failure, or BSCU failure), or
  // Hydraulically (Y + G system low pressure, the brakes are supplied by the brake accumulator only)" (l.51310-51312).
  // The ANTI SKID legend is amber "in case of a total BSCU failure, or when the A/SKID & N/W STRG sw is OFF, or if the
  // BSCU detects an ANTI-SKID failure, or in case of normal braking and yellow hydraulic system low pressure"
  // (l.51566-51568): the last case is the loss of normal braking with the yellow low pressure, as in the BRAKES A/SKID
  // N/WS FAULT caution (l.72323-72328).
  const antiSkidLost = bothBscuLost || inputs.antiSkidSwitchOff || (normalBrakingLost && inputs.yellowLowPressure);

  const alternateBrakingLost = inputs.alternateBrakingLost;

  // ANTI SKID "appears in green in case of autobrake, normal braking, or alternate braking failure, and antiskid is
  // still available" (l.51569-51570)
  let antiSkid: WheelLegendColour = null;
  if (antiSkidLost) {
    antiSkid = 'Amber';
  } else if (inputs.autobrakeFailed || normalBrakingLost || alternateBrakingLost) {
    antiSkid = 'Green';
  }

  // "When ANTISKID label is displayed, the number of the failed system(s) is (are) displayed in amber, if any."
  // (l.51573-51574)
  const failedBscuChannels: [boolean, boolean] =
    antiSkid !== null ? [inputs.bscu1Lost, inputs.bscu2Lost] : [false, false];

  // NORM BRK: green "when autobrake or alternate braking is failed, and normal braking is still available", amber when
  // normal braking is failed (l.51611-51615)
  let normalBraking: WheelLegendColour = null;
  if (normalBrakingLost) {
    normalBraking = 'Amber';
  } else if (inputs.autobrakeFailed || alternateBrakingLost) {
    normalBraking = 'Green';
  }

  // ALTN BRK: green "if the braking system is in alternate mode and not failed, or in case autobrake or normal braking
  // is failed and alternate braking is still available", amber "when alternate braking is failed" (l.51623-51625).
  // The braking system is in alternate mode when normal braking is lost.
  let alternateBraking: WheelLegendColour = null;
  if (alternateBrakingLost) {
    alternateBraking = 'Amber';
  } else if (normalBrakingLost || inputs.autobrakeFailed) {
    alternateBraking = 'Green';
  }

  // ACCU ONLY (kept from the previous page): working alternate braking supplied by the brake accumulator only
  // (l.51310-51312)
  const accumulatorOnly = alternateBraking === 'Green' && inputs.yellowLowPressure;

  // N/W STEERING "appears in amber, when nosewheel steering is lost, due to failure of the nosewheel steering system, or
  // of both BSCU channels, or in case of a yellow hydraulic system low pressure, or if the A/SKID & N/W STRG switch is
  // OFF" (l.51039-51041)
  const noseWheelSteering =
    inputs.noseWheelSteeringFailed || bothBscuLost || inputs.yellowLowPressure || inputs.antiSkidSwitchOff;

  return {
    noseWheelSteering,
    antiSkid,
    failedBscuChannels,
    normalBraking,
    alternateBraking,
    accumulatorOnly,
  };
}
