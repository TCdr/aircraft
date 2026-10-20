// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The surfaces whose actuator failures the hydraulic system publishes, by SD event name */
export const FCTL_ACTUATOR_SURFACES = [
  'leftOuterAileron',
  'leftMiddleAileron',
  'leftInnerAileron',
  'rightInnerAileron',
  'rightMiddleAileron',
  'rightOuterAileron',
  'leftOuterElevator',
  'leftInnerElevator',
  'rightInnerElevator',
  'rightOuterElevator',
  'upperRudder',
  'lowerRudder',
  'stabilizer',
] as const;

export type FctlActuatorSurface = (typeof FCTL_ACTUATOR_SURFACES)[number];

/** Actuator 1 and 2 of a surface, in the order of the hydraulic system (see the F/CTL page elements) */
export type FctlActuatorNumber = 1 | 2;

export type FctlActuatorFailedTopic = `${FctlActuatorSurface}Actuator${FctlActuatorNumber}Failed`;

export type FctlEbhaElecPartFailedTopic = `${'upper' | 'lower'}RudderActuator${FctlActuatorNumber}ElecPartFailed`;

/**
 * @param surface the surface, by SD event name
 * @param actuator actuator 1 or 2
 * @returns the event of the actuator failure
 */
export function actuatorFailedTopic(
  surface: FctlActuatorSurface,
  actuator: FctlActuatorNumber,
): FctlActuatorFailedTopic {
  return `${surface}Actuator${actuator}Failed`;
}

/**
 * @param surface the SD event name of a surface, e.g. leftMiddleAileron
 * @returns its name in the L:vars, e.g. LEFT_MIDDLE_AILERON
 */
export function surfaceVariableName(surface: FctlActuatorSurface): string {
  return surface.replace(/([A-Z])/g, '_$1').toUpperCase();
}

/**
 * An actuator moves its surface when its power supply is available and it is not failed.
 * @param powerAvailable the power supply of the actuator is available
 * @param failed the actuator is failed
 * @returns whether the actuator is operative
 */
export function isActuatorOperative(powerAvailable: boolean, failed: boolean): boolean {
  return !!powerAvailable && !failed;
}

/**
 * An EBHA works in hydraulic mode with its hydraulic system, else as an EHA with its electrical part.
 * @param hydPowerAvailable the hydraulic system of the EBHA is pressurised
 * @param elecPowerAvailable the electrical power supply of the EBHA is available
 * @param failed the EBHA is failed
 * @param elecPartFailed the electrical part of the EBHA is failed
 * @returns whether the EBHA is operative
 */
export function isEbhaOperative(
  hydPowerAvailable: boolean,
  elecPowerAvailable: boolean,
  failed: boolean,
  elecPartFailed: boolean,
): boolean {
  return !failed && (!!hydPowerAvailable || (!!elecPowerAvailable && !elecPartFailed));
}

/**
 * The surface position index is green while at least one actuator controls the surface, amber when its power supplies
 * are lost. Design choice: a surface whose actuators are all failed is shown as one without power supply, since no
 * actuator controls it either and it floats.
 * @param actuatorsOperative whether each actuator of the surface is operative
 * @returns whether the surface is controlled
 */
export function isSurfaceControlled(...actuatorsOperative: boolean[]): boolean {
  return actuatorsOperative.some((operative) => operative);
}
