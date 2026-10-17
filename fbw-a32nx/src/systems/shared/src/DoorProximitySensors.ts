// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The door proximity sensors of the A320, shared by the DOOR cautions (systems-host FWC/Logic/DoorAlerts.ts) and the SD
 * DOOR/OXY page (instruments SD/Pages/Door/Door.tsx), so that both agree.
 * The DOOR cautions trigger when a cabin door, an emergency exit door or a cargo door is not detected closed by its
 * proximity sensor.
 * Design choice: a failed proximity sensor (flyPad ATA 52 failure, published by systems-host Doors/DoorFailures.ts)
 * no longer detects its door closed, so the door shows not closed (amber on the DOOR/OXY page, DOOR caution) while it
 * is closed.
 */

/** The doors with a proximity sensor in the sim, in the order of the DOOR cautions (EwdMessages 5200101 to 5200108) */
export const SensedDoors = [
  'L_FWD_CABIN',
  'R_FWD_CABIN',
  'L_AFT_CABIN',
  'R_AFT_CABIN',
  'L_EMER_EXIT',
  'R_EMER_EXIT',
  'FWD_CARGO',
  'AFT_CARGO',
] as const;

export type SensedDoor = (typeof SensedDoors)[number];

/** The L:var of a failed door proximity sensor, e.g. L:A32NX_DOOR_L_FWD_CABIN_PROX_SENSOR_FAULT */
export function doorProximitySensorFaultVar(door: SensedDoor): string {
  return `L:A32NX_DOOR_${door}_PROX_SENSOR_FAULT`;
}

/** Whether the proximity sensors do not detect a door closed: the door is then shown not closed */
export function isDoorDetectedNotClosed(notClosed: boolean, sensorFault: boolean): boolean {
  return notClosed || sensorFault;
}
