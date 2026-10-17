// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect } from 'react';
import { usePersistentNumberProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { isCaptainEfb } from '../../../Utils/efbIndex';

/**
 * The pushback steered with the rudder pedals and the sidestick (flyPad > Ground > Pushback, "use controller input").
 * It runs at the root of the captain's flyPad, not on the Pushback page, so that a pushback keeps going and stays
 * steerable while the crew looks at another flyPad page (design choice: leaving the page must not stop the tug).
 */

/** Inputs within this deadzone command nothing (rudder pedals and sidestick, as the Pushback page always did) */
const CONTROLLER_DEADZONE = 0.05;

/**
 * Whether the A32NX pushback system moves the aircraft: the system is on, the tug is attached (not on its way) and
 * the nose wheel steering is disconnected.
 */
export function isPushbackActive(systemEnabled: boolean, tugAttached: boolean, nwStrgDisc: boolean): boolean {
  const tugInTransit = tugAttached !== nwStrgDisc;
  return systemEnabled && !tugInTransit && nwStrgDisc;
}

/**
 * The tug heading factor (-1 to 1) commanded by the rudder pedals.
 * @param rudderPosition L:A32NX_RUDDER_PEDAL_POSITION, -100 to 100
 */
export function controllerHeadingFactor(rudderPosition: number): number {
  return Math.abs(rudderPosition) < CONTROLLER_DEADZONE ? 0 : rudderPosition / 100;
}

/**
 * The tug speed factor (-1 to 1) commanded by the sidestick: stick back pushes the aircraft back.
 * @param sidestickY L:A32NX_SIDESTICK_POSITION_Y, -1 to 1
 */
export function controllerSpeedFactor(sidestickY: number): number {
  return Math.abs(sidestickY) < CONTROLLER_DEADZONE ? 0 : -sidestickY;
}

/** Steers the pushback from the rudder pedals and the sidestick, whatever flyPad page is shown (captain's flyPad) */
export function usePushbackControllerInput(): void {
  const [pushbackSystemEnabled] = useSimVar('L:A32NX_PUSHBACK_SYSTEM_ENABLED', 'bool', 100);
  const [pushbackAttached] = useSimVar('PUSHBACK ATTACHED', 'bool', 100);
  const [nwStrgDisc] = useSimVar('L:A32NX_HYD_NW_STRG_DISC_ECAM_MEMO', 'Bool', 250);
  const [useControllerInput] = usePersistentNumberProperty('PUSHBACK_USE_CONTROLLER_INPUT', 1);
  const [rudderPosition] = useSimVar('L:A32NX_RUDDER_PEDAL_POSITION', 'number', 50);
  const [sidestickY] = useSimVar('L:A32NX_SIDESTICK_POSITION_Y', 'number', 50);
  const [, setCmdHdgFactor] = useSimVar('L:A32NX_PUSHBACK_HDG_FACTOR', 'number', 100);
  const [, setCmdSpdFactor] = useSimVar('L:A32NX_PUSHBACK_SPD_FACTOR', 'number', 100);

  const steering =
    isCaptainEfb() &&
    !!useControllerInput &&
    isPushbackActive(!!pushbackSystemEnabled, !!pushbackAttached, !!nwStrgDisc);

  useEffect(() => {
    if (steering) {
      setCmdHdgFactor(controllerHeadingFactor(rudderPosition));
    }
  }, [rudderPosition]);

  useEffect(() => {
    if (steering) {
      setCmdSpdFactor(controllerSpeedFactor(sidestickY));
    }
  }, [sidestickY]);
}
