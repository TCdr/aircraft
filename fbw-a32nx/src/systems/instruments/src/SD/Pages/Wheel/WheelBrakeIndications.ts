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
  readonly greenLowPressure: boolean;
  readonly yellowLowPressure: boolean;
}

/** The colour of a legend, or null when the legend is not displayed */
export type WheelLegendColour = 'Green' | 'Amber' | null;

export interface WheelBrakeIndications {
  /** N/W STEERING legend (always amber) with its Y hydraulic supply indication */
  readonly noseWheelSteering: boolean;
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
 * The brake and steering legends of the SD WHEEL page. The G and Y hydraulic supply indications next to the legends
 * take their colour from the hydraulic pressure (HydraulicIndicator): green when available, amber in low pressure.
 * @param inputs the brake system state
 * @returns the legends to display
 */
export function wheelBrakeIndications(inputs: WheelBrakeInputs): WheelBrakeIndications {
  const bothBscuLost = inputs.bscu1Lost && inputs.bscu2Lost;

  // Normal braking needs the BSCU, the normal braking equipment, green pressure and the A/SKID & N/W STRG sw ON
  const normalBrakingLost =
    inputs.normalBrakingFailed || bothBscuLost || inputs.greenLowPressure || inputs.antiSkidSwitchOff;

  // ANTI SKID is amber with a total BSCU failure, the A/SKID & N/W STRG sw OFF, or the loss of normal braking with the
  // yellow low pressure (the brakes then on the accumulator only), as in the BRAKES A/SKID N/WS FAULT caution
  const antiSkidLost = bothBscuLost || inputs.antiSkidSwitchOff || (normalBrakingLost && inputs.yellowLowPressure);

  const alternateBrakingLost = inputs.alternateBrakingLost;

  // ANTI SKID is green with an autobrake, normal or alternate braking failure while the antiskid is still available
  let antiSkid: WheelLegendColour = null;
  if (antiSkidLost) {
    antiSkid = 'Amber';
  } else if (inputs.autobrakeFailed || normalBrakingLost || alternateBrakingLost) {
    antiSkid = 'Green';
  }

  // With ANTI SKID shown, the numbers of the failed BSCU channels are shown in amber
  const failedBscuChannels: [boolean, boolean] =
    antiSkid !== null ? [inputs.bscu1Lost, inputs.bscu2Lost] : [false, false];

  // NORM BRK: green with an autobrake or alternate braking failure while normal braking works, amber when it is lost
  let normalBraking: WheelLegendColour = null;
  if (normalBrakingLost) {
    normalBraking = 'Amber';
  } else if (inputs.autobrakeFailed || alternateBrakingLost) {
    normalBraking = 'Green';
  }

  // ALTN BRK: green in alternate mode (normal braking lost) or with an autobrake failure while alternate braking works,
  // amber when alternate braking is lost
  let alternateBraking: WheelLegendColour = null;
  if (alternateBrakingLost) {
    alternateBraking = 'Amber';
  } else if (normalBrakingLost || inputs.autobrakeFailed) {
    alternateBraking = 'Green';
  }

  // ACCU ONLY: working alternate braking supplied by the brake accumulator only
  const accumulatorOnly = alternateBraking === 'Green' && inputs.yellowLowPressure;

  // N/W STEERING in amber when the nosewheel steering is lost: its own failure, both BSCU channels lost, the yellow low
  // pressure, or the A/SKID & N/W STRG sw OFF
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
