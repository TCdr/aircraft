// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The oxygen alerts of the A380X FWS: OXY CABIN BOTTLE PRESS LO, OXY CABIN VLV CLOSED and OXY CKPT BOTTLE PRESS LO,
 * on the oxygen model of the systems
 * (a380_systems oxygen.rs: L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE, L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE,
 * L:A32NX_OXYGEN_CABIN_VALVE_CLOSED).
 */

/** The ECAM alert ids (texts in EcamMessages/AbnormalSensed/ata35-36-42.ts) */
export const OXYGEN_ALERT_IDS = {
  cabinBottlePressLo: '350800001',
  cabinValveClosed: '350800002',
  ckptBottlePressLo: '350800003',
};

/** The pressure in the cockpit oxygen bottle is below 350 PSI */
export const CKPT_BOTTLE_LOW_PRESSURE_PSI = 350;

/** Before an engine starts, the alert triggers with the cabin oxygen bottles below 800 PSI */
export const CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI = 800;

/** The alert is inhibited in a depressurization, with the cabin altitude above 13 800 ft */
const DEPRESSURIZATION_CABIN_ALTITUDE_FT = 13_800;

/**
 * The minimum cabin bottle pressure of the EMERGENCY DESCENT profile (1 min at FL 430, emergency descent from FL 430 to
 * FL 100 at 5 500 ft/min), by number of cabin masks in use (minimum cabin oxygen pressure
 * limitation). OXY CABIN BOTTLE PRESS LO: below the minimum pressure required to fly an emergency descent from
 * 40 000 ft to 10 000 ft in 5 min, with the real number of cabin occupants.
 */
const EMERGENCY_DESCENT_MINIMUM_PRESSURE: readonly [number, number][] = [
  [100, 286],
  [200, 469],
  [300, 649],
  [400, 827],
  [500, 1003],
  [600, 1178],
  [700, 1352],
  [800, 1526],
];

/**
 * The minimum cabin bottle pressure for the cabin occupants, interpolated in the limitation table.
 * Design choices: the real number of cabin occupants comes from the number of passengers of the FMS, so the
 * occupants are the FMS passengers; below 100 or above 800 occupants the first or last value of
 * the table applies.
 * @param cabinOccupants the number of passengers of the FMS
 */
export function cabinOxygenMinimumPressurePsi(cabinOccupants: number): number {
  const table = EMERGENCY_DESCENT_MINIMUM_PRESSURE;
  if (cabinOccupants <= table[0][0]) {
    return table[0][1];
  }
  for (let i = 1; i < table.length; i++) {
    const [occupants, pressure] = table[i];
    if (cabinOccupants <= occupants) {
      const [previousOccupants, previousPressure] = table[i - 1];
      const ratio = (cabinOccupants - previousOccupants) / (occupants - previousOccupants);
      return previousPressure + ratio * (pressure - previousPressure);
    }
  }
  return table[table.length - 1][1];
}

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
  const cabinMinimumPsi = inputs.oneEngineRunning
    ? cabinOxygenMinimumPressurePsi(inputs.fmsPassengers)
    : CABIN_BOTTLE_LOW_PRESSURE_BEFORE_ENGINE_START_PSI;
  return {
    cabinBottlePressLo: !depressurization && inputs.cabinBottlePressurePsi < cabinMinimumPsi,
    cabinValveClosed: inputs.cabinValveClosed,
    ckptBottlePressLo: !depressurization && inputs.ckptBottlePressurePsi < CKPT_BOTTLE_LOW_PRESSURE_PSI,
  };
}
