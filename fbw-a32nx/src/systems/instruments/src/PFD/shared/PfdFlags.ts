// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* Display rules of the PFD flags */

/** The flags flash for 9 s, then remain steady (V1 INOP excepted: always steady) */
export const PFD_FLAG_FLASH_SECONDS = 9;

/** The last FWC flight phase in which the V1 bug is displayed (phase 4: 80 kt, the V1BugElement rule) */
const LAST_V1_FLIGHT_PHASE = 4;

export interface V1InopInputs {
  /** the V1 the FMS holds, knots (0 or negative: none entered) */
  v1Knots: number;
  /** the FM that sends the V1 to this PFD is healthy (A32NX_FM1/2_HEALTHY_DISCRETE of either FM) */
  anyFmHealthy: boolean;
  fwcFlightPhase: number;
}

/**
 * V1 INOP flag (red, steady): replaces the digital V1 when the V1 signal is not valid. The V1 comes from the FMGC: the
 * signal is not valid when no FM is healthy (both FMs lost: the PFD reads the FM of the other side when only one is
 * lost). Shown only while a V1 was entered and the V1 is displayed (up to flight phase 4, as the V1 bug), like the V1
 * it replaces.
 * @param i the inputs
 * @returns whether V1 INOP replaces the V1 value (the V1 bug and value are then hidden)
 */
export function isV1InopShown(i: V1InopInputs): boolean {
  return i.v1Knots > 0 && i.fwcFlightPhase <= LAST_V1_FLIGHT_PHASE && !i.anyFmHealthy;
}

export interface LandingSystemFlagInputs {
  /** the LS pushbutton of this side is on (the ILS information is displayed) */
  lsSelected: boolean;
  /** the ILS receiver read by this PFD (MMR 1 for PFD 1, MMR 2 for PFD 2) is powered */
  ilsReceiverPowered: boolean;
  /** the DME interrogator read by this PFD (DME 1 for PFD 1, DME 2 for PFD 2) is powered */
  dmeInterrogatorPowered: boolean;
}

/**
 * ILS1 (ILS2) flag (red): replaces the ILS frequency indication on PFD 1 (PFD 2) when the ILS frequency, the LOC or
 * the G/S signal fails. The sim has no ILS receiver failure: the receiver fails when it loses its power (LS 1 is lost
 * with the AC ESS bus, ILS 2 with the AC bus 2).
 * @param i the inputs
 * @returns whether the ILS flag replaces the ILS ident and frequency
 */
export function isIlsFlagShown(i: LandingSystemFlagInputs): boolean {
  return i.lsSelected && !i.ilsReceiverPowered;
}

/**
 * DME1 (DME2) flag (red): replaces the DME distance indication on PFD 1 (PFD 2) when the DME distance is not valid. A
 * DME distance that is only not received (no DME at the station, out of range) is no computed data and stays blank.
 * The interrogator fails when it loses its power (DME 1 is lost with the AC ESS SHED bus while the CAPT PFD remains,
 * DME 2 with the AC bus 2).
 * @param i the inputs
 * @returns whether the DME flag replaces the DME distance
 */
export function isDmeFlagShown(i: LandingSystemFlagInputs): boolean {
  return i.lsSelected && !i.dmeInterrogatorPowered;
}

/**
 * The text of the ILS or DME flag of a PFD: ILS1/DME1 on PFD 1, ILS2/DME2 on PFD 2.
 * @param receiver ILS or DME
 * @param displayIndex 1 for the CAPT PFD, 2 for the F/O PFD
 * @returns the flag text
 */
export function landingSystemFlagText(receiver: 'ILS' | 'DME', displayIndex: number): string {
  return `${receiver}${displayIndex === 2 ? 2 : 1}`;
}

/** The A32NXElectricalSystemPublisher topics of the buses that power the PFD landing system receivers */
export type LandingSystemPowerTopic =
  | 'a32nx_elec_ac_ess_bus_is_powered'
  | 'a32nx_elec_ac_ess_shed_bus_is_powered'
  | 'a32nx_elec_ac_2_bus_is_powered';

/**
 * The electrical bus that powers the ILS receiver and the DME interrogator a PFD reads.
 * MMR 1 (LS 1): AC ESS, DME 1: AC ESS SHED; MMR 2 (ILS 2) and DME 2: AC 2.
 * @param displayIndex 1 for the CAPT PFD, 2 for the F/O PFD
 * @returns the bus topics of the A32NXElectricalSystemPublisher
 */
export function landingSystemPowerTopics(displayIndex: number): {
  ilsReceiver: LandingSystemPowerTopic;
  dmeInterrogator: LandingSystemPowerTopic;
} {
  return displayIndex === 2
    ? { ilsReceiver: 'a32nx_elec_ac_2_bus_is_powered', dmeInterrogator: 'a32nx_elec_ac_2_bus_is_powered' }
    : { ilsReceiver: 'a32nx_elec_ac_ess_bus_is_powered', dmeInterrogator: 'a32nx_elec_ac_ess_shed_bus_is_powered' };
}
