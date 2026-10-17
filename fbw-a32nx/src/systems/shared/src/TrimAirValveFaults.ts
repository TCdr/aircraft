// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429WordData } from '@flybywiresim/fbw-sdk';

/** The trim air valves the air conditioning system controllers (ACSC) report as failed */
export interface TrimAirValveFaults {
  cockpit: boolean;
  forward: boolean;
  aft: boolean;
}

/**
 * The failed trim air valves, from the ACSC discrete words 2 (bits 18, 19 and 20, as the FWC reads them for TRIM AIR
 * SYS FAULT): a valve counts as failed when either controller reports it. The COND page replaces the green arrow of
 * a failed zone trim air valve with amber crosses (XX).
 */
export function trimAirValveFaults(acsc1Word2: Arinc429WordData, acsc2Word2: Arinc429WordData): TrimAirValveFaults {
  const failed = (bit: number) => acsc1Word2.bitValueOr(bit, false) || acsc2Word2.bitValueOr(bit, false);
  return { cockpit: failed(18), forward: failed(19), aft: failed(20) };
}
