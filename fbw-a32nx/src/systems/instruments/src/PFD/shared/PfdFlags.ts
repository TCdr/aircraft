// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Display rules of PFD flags (A320 FCOM DSC-31-40 FLAGS AND MESSAGES DISPLAYED ON PFD).
 * l.47908: "All flags, except, V1 INOP which is steady, flash for 9 s, then remain steady."
 */

/** l.47908: the flags flash for 9 s, then remain steady (V1 INOP excepted) */
export const PFD_FLAG_FLASH_SECONDS = 9;

/** The last FWC flight phase in which the V1 bug is displayed (phase 4: 80 kt, the V1BugElement rule) */
const LAST_V1_FLIGHT_PHASE = 4;

/** Inputs of the V1 INOP flag */
export interface V1InopInputs {
  /** the V1 the FMS holds, knots (0 or negative: none entered) */
  v1Knots: number;
  /** the FM that sends the V1 to this PFD is healthy (A32NX_FM1/2_HEALTHY_DISCRETE of either FM) */
  anyFmHealthy: boolean;
  /** the FWC flight phase */
  fwcFlightPhase: number;
}

/**
 * V1 INOP flag (red, steady), l.47815-47816: "When the V1 signal is not valid, a V1 INOP flag replaces the digital
 * value." The V1 comes from the FMGC: the signal is not valid when no FM is healthy (both FMs lost: the PFD reads the
 * FM of the other side when only one is lost). Shown only while a V1 was entered and the V1 is displayed (up to
 * flight phase 4, as the V1 bug), like the V1 it replaces.
 * @param i the inputs
 * @returns whether V1 INOP replaces the V1 value (the V1 bug and value are then hidden)
 */
export function isV1InopShown(i: V1InopInputs): boolean {
  return i.v1Knots > 0 && i.fwcFlightPhase <= LAST_V1_FLIGHT_PHASE && !i.anyFmHealthy;
}

/** Inputs of the ILS and DME flags of one PFD */
export interface LandingSystemFlagInputs {
  /** the LS pushbutton of this side is on (the ILS information is displayed) */
  lsSelected: boolean;
  /** the ILS receiver read by this PFD (MMR 1 for PFD 1, MMR 2 for PFD 2) is powered */
  ilsReceiverPowered: boolean;
  /** the DME interrogator read by this PFD (DME 1 for PFD 1, DME 2 for PFD 2) is powered */
  dmeInterrogatorPowered: boolean;
}

/**
 * ILS1 (ILS2) flag (red), l.47872-47874: "If an ILS frequency fails, or if either the LOC or G/S signals fail, an
 * ILS1 (on PFD1) or ILS2 (on PFD2) flag replaces the ILS frequency indication." The sim has no ILS receiver failure:
 * the receiver fails when it loses its power (ELEC AC ESS BUS FAULT lists LS 1, l.75990; ELEC AC BUS 2 FAULT lists
 * ILS 2, l.75774).
 * @param i the inputs
 * @returns whether the ILS flag replaces the ILS ident and frequency
 */
export function isIlsFlagShown(i: LandingSystemFlagInputs): boolean {
  return i.lsSelected && !i.ilsReceiverPowered;
}

/**
 * DME1 (DME2) flag (red), l.47868-47870: "When the DME distance is not valid, a DME1 (on PFD1) or DME2 (on PFD2) flag
 * replaces the DME distance indication." A DME distance that is only not received (no DME at the station, out of
 * range) is no computed data and stays blank, as before. The interrogator fails when it loses its power (ELEC AC ESS
 * BUS SHED lists DME 1, l.76069, while the CAPT PFD remains; ELEC AC BUS 2 FAULT lists DME 2, l.75780).
 * @param i the inputs
 * @returns whether the DME flag replaces the DME distance
 */
export function isDmeFlagShown(i: LandingSystemFlagInputs): boolean {
  return i.lsSelected && !i.dmeInterrogatorPowered;
}

/**
 * The text of the ILS or DME flag of a PFD: ILS1/DME1 on PFD 1, ILS2/DME2 on PFD 2 (l.47869, l.47873).
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
 * MMR 1 (LS 1): AC ESS (l.75990), DME 1: AC ESS SHED (l.76069); MMR 2 (ILS 2) and DME 2: AC 2 (l.75774, l.75780).
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
