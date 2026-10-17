// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The WING A-ICE indication of the BLEED SD page, one per wing:
 * - wing anti-ice off: not displayed.
 * - wing anti-ice on: WING A-ICE white, a green triangle pointing to the wing.
 * - commanded on but remains off (A-ICE L(R) WING VLV CLOSED): WING A-ICE amber, no triangle.
 * - commanded off but remains on (A-ICE L(R) WING VLV OPEN), or an abnormal pressure (A-ICE L(R) WING VLV PRESS HI /
 *   PRESS LO): WING A-ICE amber, an amber triangle.
 * The states come from the AICU monitoring of the Rust wing anti-ice (a380_systems ice_rain_protection.rs), the same
 * L:vars as the ECAM cautions.
 */

type WingAntiIceDisplay = 'hidden' | 'on' | 'commandedOnRemainsOff' | 'abnormal';

/** The wing anti-ice state of one wing, L:A32NX_PNEU_WING_ANTI_ICE_{wing}_* */
export interface WingAntiIceInputs {
  /** both wing anti-ice valves of the wing are closed (_VALVE_CLOSED) */
  valvesClosed: boolean;
  /** A-ICE L(R) WING VLV CLOSED (_ABNORMALLY_CLOSED) */
  abnormallyClosed: boolean;
  /** A-ICE L(R) WING VLV OPEN (_ABNORMALLY_OPEN) */
  abnormallyOpen: boolean;
  /** A-ICE L(R) WING VLV PRESS LO (_LOW_PRESSURE) */
  lowPressure: boolean;
  /** A-ICE L(R) WING VLV PRESS HI (_HIGH_PRESSURE) */
  highPressure: boolean;
}

/**
 * @param i the wing anti-ice state of the wing
 * @returns how the WING A-ICE indication of the wing shows
 */
export function wingAntiIceIndication(i: WingAntiIceInputs): WingAntiIceDisplay {
  if (i.abnormallyClosed) {
    return 'commandedOnRemainsOff';
  }
  if (i.abnormallyOpen || i.lowPressure || i.highPressure) {
    return 'abnormal';
  }
  return i.valvesClosed ? 'hidden' : 'on';
}
