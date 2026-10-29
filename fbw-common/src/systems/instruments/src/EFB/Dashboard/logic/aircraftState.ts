// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type PowerSource = 'extPwr' | 'apu' | 'engineGen' | 'battery' | 'off';

export interface PowerInput {
  acPowered: boolean;
  /** External power units available at the aircraft and switched on (EXT PWR pushbutton ON) */
  extPwrOnline: number;
  /** External power units available at the aircraft */
  extPwrAvailable: number;
  apuGenOnline: boolean;
  engineRunning: boolean;
  batteryBusPowered: boolean;
}

/** The source feeding the AC network, in the priority of the network: engine generators, external power, APU */
export const powerSource = (i: PowerInput): PowerSource => {
  if (i.acPowered) {
    if (i.engineRunning) {
      return 'engineGen';
    }
    if (i.extPwrOnline > 0) {
      return 'extPwr';
    }
    if (i.apuGenOnline) {
      return 'apu';
    }
  }
  return i.batteryBusPowered ? 'battery' : 'off';
};

export type AircraftStateChip = 'coldDark' | 'powered' | 'enginesRunning';

export const aircraftStateChip = (acPowered: boolean, anyEngineRunning: boolean): AircraftStateChip => {
  if (anyEngineRunning) {
    return 'enginesRunning';
  }
  return acPowered ? 'powered' : 'coldDark';
};

export interface DoorReading {
  name: string;
  openFraction: number;
}

/** The doors not fully closed, by name in the given order */
export const openDoors = (doors: readonly DoorReading[]): string[] =>
  doors.filter((door) => door.openFraction > 0).map((door) => door.name);

export type AdirsState = 'off' | 'aligning' | 'aligned';

/** The ADIRU states of the systems: 0 off, 1 aligning, 2 aligned */
const ADIRU_ALIGNING = 1;
const ADIRU_ALIGNED = 2;
/** The IR mode selector positions: 0 OFF, 1 NAV, 2 ATT */
const IR_MODE_NAV = 1;

/**
 * The ADIRS as one value: aligned only when every ADIRU is, aligning while any one is, with the remaining time of
 * the slowest IR (the systems publish one remaining time for all of them). An ADIRU counts only with its mode
 * selector at NAV: with the Instant align time the systems report it aligned at OFF too.
 */
export const adirsSummary = (
  adiruStates: readonly number[],
  irModes: readonly number[],
  remainingSeconds: number,
): { state: AdirsState; minutesLeft: number | null } => {
  const atNav = (index: number) => irModes[index] === IR_MODE_NAV;
  if (adiruStates.length > 0 && adiruStates.every((state, index) => state === ADIRU_ALIGNED && atNav(index))) {
    return { state: 'aligned', minutesLeft: null };
  }
  if (adiruStates.some((state) => state === ADIRU_ALIGNING)) {
    return { state: 'aligning', minutesLeft: remainingSeconds > 0 ? Math.ceil(remainingSeconds / 60) : null };
  }
  return { state: 'off', minutesLeft: null };
};

/** The button states of the Services page (Store/features/groundServicePage) */
const SERVICE_BUTTON_CALLED = 3;
const SERVICE_BUTTON_ACTIVE = 4;

export type JetBridgeStatus = 'connected' | 'moving' | 'notConnected';

/** The flyPad moved the jet bridge: only then does the Services page button state say where the bridge is */
export const jetBridgeMovedByFlypad = (buttonState: number): boolean =>
  buttonState === SERVICE_BUTTON_CALLED || buttonState === SERVICE_BUTTON_ACTIVE;

/**
 * The jet bridge as the Services page's button says, or null (row hidden) while the flyPad has not moved it since it
 * was loaded: the sim has no jet bridge variable, and a bridge moved otherwise would show as not connected
 */
export const jetBridgeStatus = (buttonState: number, movedSinceLoad: boolean): JetBridgeStatus | null => {
  if (!movedSinceLoad) {
    return null;
  }
  if (buttonState === SERVICE_BUTTON_ACTIVE) {
    return 'connected';
  }
  return buttonState === SERVICE_BUTTON_CALLED ? 'moving' : 'notConnected';
};
