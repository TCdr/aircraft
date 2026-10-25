// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** What the dashboard remembered for the loaded OFP: the flown mark, the flight log and the services that ran */
export const OFP_MEMORY_KEYS = [
  'EFB_DASHBOARD_FLOWN_OFP',
  'EFB_DASHBOARD_FLIGHT_LOG',
  'EFB_DASHBOARD_SERVICES_RAN',
] as const;

/** Clears the OFP memory, so the next OFP starts at the gate instead of inheriting the cancelled one's progress */
export const forgetOfpMemory = (clear: (key: string) => void): void => {
  OFP_MEMORY_KEYS.forEach(clear);
};
