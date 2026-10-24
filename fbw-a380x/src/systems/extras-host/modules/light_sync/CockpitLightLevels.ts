// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The cockpit light knob levels set when a flight starts, in percent [0, 100]. */
export interface CockpitLightLevels {
  /** Integral (backlight) lighting of all panels. */
  integral: number;
  mainPanelFlood: number;
  pedestalFlood: number;
  ambient: number;
}

/** The A32NX_START_STATE values of a flight that starts parked at the gate (hangar or apron). */
const PARKED_START_STATES = [1, 2];

// Design choice: the lights start to come on below an automatic brightness of 75 and reach their night levels at 40, so
// a dusk or dawn start (the brightness then sits between 50 and 75) already gets readable panels instead of every
// light at 0.
const DARKNESS_START_BRIGHTNESS = 75;
const NIGHT_BRIGHTNESS = 40;

// Design choice: night levels that keep the labels clearly readable and the panel faces lit without glare, the
// ambient strips dimmer than the panel lights so they do not wash out the displays.
const NIGHT_INTEGRAL_LEVEL = 70;
const NIGHT_MAIN_PANEL_FLOOD_LEVEL = 60;
const NIGHT_PEDESTAL_FLOOD_LEVEL = 50;
const NIGHT_AMBIENT_LEVEL = 25;

/**
 * How dark it is in the cockpit, from the sim's automatic brightness.
 * @param autoBrightness the automatic brightness in percent, high in daylight
 * @returns 0 in daylight up to 1 at night
 */
function darkness(autoBrightness: number): number {
  const ratio = (DARKNESS_START_BRIGHTNESS - autoBrightness) / (DARKNESS_START_BRIGHTNESS - NIGHT_BRIGHTNESS);
  return Math.max(0, Math.min(1, ratio));
}

/**
 * The cockpit light levels for the start of a flight: they grow with the darkness outside.
 * @param autoBrightness the sim's automatic brightness in percent [0, 100], high in daylight
 * @param startState the A32NX_START_STATE value of the flight
 * @returns the knob levels in percent [0, 100]
 */
export function cockpitLightLevels(autoBrightness: number, startState: number): CockpitLightLevels {
  const dark = darkness(autoBrightness);
  // Design choice: the ambient strips are only left on for a flight that starts parked, where the crew prepares the
  // cockpit; from the runway onwards the crew dims them so the displays and the outside view stand out.
  const isParked = PARKED_START_STATES.indexOf(startState) !== -1;

  return {
    integral: Math.round(NIGHT_INTEGRAL_LEVEL * dark),
    mainPanelFlood: Math.round(NIGHT_MAIN_PANEL_FLOOD_LEVEL * dark),
    pedestalFlood: Math.round(NIGHT_PEDESTAL_FLOOD_LEVEL * dark),
    ambient: isParked ? Math.round(NIGHT_AMBIENT_LEVEL * dark) : 0,
  };
}
