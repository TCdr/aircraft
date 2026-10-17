// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oxygen alerts of the A380X FWS: OXY CABIN BOTTLE PRESS LO, OXY CABIN VLV CLOSED and OXY CKPT BOTTLE PRESS LO,
 * on the oxygen model of the systems
 * (a380_systems oxygen.rs: L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE, L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE,
 * L:A32NX_OXYGEN_CABIN_VALVE_CLOSED).
 */

import { cabinBottleLowPressurePsi, CKPT_BOTTLE_LOW_PRESSURE_PSI } from '@shared/OxygenBottlePressures';

/** The ECAM alert ids (texts in EcamMessages/AbnormalSensed/ata35-36-42.ts) */
export const OXYGEN_ALERT_IDS = {
  cabinBottlePressLo: '350800001',
  cabinValveClosed: '350800002',
  ckptBottlePressLo: '350800003',
};

// The bottle pressure thresholds are shared with the SD DOOR/OXY page
export {
  CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI,
  cabinOxygenMinimumPressurePsi,
  CKPT_BOTTLE_LOW_PRESSURE_PSI,
} from '@shared/OxygenBottlePressures';

const DEPRESSURIZATION_CABIN_ALTITUDE_FT = 13_800;

export interface OxygenAlertInputs {
  ckptBottlePressurePsi: number;
  cabinBottlePressurePsi: number;
  /** One regulator supply valve (or engine-burst area shutoff valve) is closed */
  cabinValveClosed: boolean;
  /** At least one engine runs */
  oneEngineRunning: boolean;
  /** The FMS passenger number (L:A32NX_FMS_PAX_NUMBER) */
  fmsPassengers: number;
  /** The cabin altitude (ft), null when no CPCS supplies it */
  cabinAltitudeFt: number | null;
  /** The cabin masks are released (MASK MAN ON pb, L:A32NX_OXYGEN_MASKS_DEPLOYED) */
  masksReleased: boolean;
}

export interface OxygenAlerts {
  cabinBottlePressLo: boolean;
  cabinValveClosed: boolean;
  ckptBottlePressLo: boolean;
}

/**
 * The oxygen alerts. The two bottle alerts are inhibited in a depressurization: cabin altitude above 13 800 ft, or the
 * crew pressed the MASK MAN ON pb.
 */
export function oxygenAlerts(inputs: OxygenAlertInputs): OxygenAlerts {
  const depressurization =
    (inputs.cabinAltitudeFt !== null && inputs.cabinAltitudeFt > DEPRESSURIZATION_CABIN_ALTITUDE_FT) ||
    inputs.masksReleased;
  const cabinMinimumPsi = cabinBottleLowPressurePsi(inputs.oneEngineRunning, inputs.fmsPassengers);
  return {
    cabinBottlePressLo: !depressurization && inputs.cabinBottlePressurePsi < cabinMinimumPsi,
    cabinValveClosed: inputs.cabinValveClosed,
    ckptBottlePressLo: !depressurization && inputs.ckptBottlePressurePsi < CKPT_BOTTLE_LOW_PRESSURE_PSI,
  };
}
