// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATA 42 AVIONICS NETWORK alerts of the A380X FWS (A380 FCOM DSC-42-20, a380_fcom.txt l.94964-95104, and
 * PRO-ABN-ECAM-10-42, l.169102-169800, airbus-a380-fcom PDF p.5701-5718), from the AFDX switch and IOM failures of the
 * Rust ADCN model (a380_systems avionics_data_communication_network.rs, flyPad failures 42001-42019 and 42101-42108).
 * Not simulated: AVIONICS NETWORK MULTIPLE CABLE FAULT (no cable model), and the lines that depend on which switches or
 * IOMs failed ("Depending on the affected ...", l.169547, 169741, 169767): the sim does not map the aircraft systems to
 * the IOM pairs and switch ports.
 */

/** The 16 AFDX switches of the Rust ADCN: network A 1-7, 9 and network B 11-17, 19 (paired as n and n + 10) */
export const AFDX_SWITCHES_NETWORK_A = [1, 2, 3, 4, 5, 6, 7, 9] as const;
export const AFDX_SWITCHES_NETWORK_B = [11, 12, 13, 14, 15, 16, 17, 19] as const;

/**
 * The four IOM pairs: "The IOMs are grouped in pairs. Each avionics system that uses IOMs is connected to a pair of IOMs,
 * to ensure redundancy." (l.94880-94882). The FCOM does not number them: the pairs here are A1+A2, A3+A4, A5+A6, A7+A8,
 * the two IOMs of a pair on different switches and power supplies in the Rust ADCN (A1/A3/A5/A7 on DC ESS, A2/A4/A6/A8
 * on DC 2), as a redundant pair would be.
 */
export const IOM_PAIRS = [
  ['A1', 'A2'],
  ['A3', 'A4'],
  ['A5', 'A6'],
  ['A7', 'A8'],
] as const;

/** The alert ids (ata35-36-42.ts) */
export const AVIONICS_NETWORK_ALERT_IDS = {
  allSwitchesFault: '420800001',
  doubleIomFault: '420800002',
  doubleSwitchFault: '420800003',
  multipleIomFaultNetworkDegraded: '420800004',
  multipleIomFaultRedundancyDegraded: '420800005',
  multipleSwitchFaultNetworkDegraded: '420800006',
  multipleSwitchFaultRedundancyDegraded: '420800007',
} as const;

/** ALL SWITCHES FAULT: flight phases 4 to 7, 9 and 10 (PDF p.5701) */
export const ALL_SWITCHES_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];

/** DOUBLE IOM FAULT and DOUBLE SWITCH FAULT: flight phases 2 to 11 (PDF p.5708, 5709) */
export const DOUBLE_FAULT_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The four MULTIPLE IOM / SWITCH FAULT alerts: flight phases 3 to 7, 9 and 10 (PDF p.5711, 5715, 5716, 5718) */
export const MULTIPLE_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/**
 * LIMITATIONS ON ECAM of ALL SWITCHES FAULT (l.169307-169320), LAND ANSA from the procedure recommendation.
 * ALL PHASES: A/THR NOT USABLE, XPDR MODE A ONLY, ATC COM VOICE ONLY, MAN PRESS : DO NOT USE.
 */
export const ALL_SWITCHES_FAULT_LIMITATIONS_ALL_PHASES = ['2', '420400001', '420400002', '460400001', '210400003'];

/**
 * APPR AND LDG: AVOID HI DESCENT V/S, MAX SPEED : 220 KT, JETTISON NOT USABLE, L/G GRVTY EXTN ONLY, CAT 1 ONLY,
 * A-SKID NOT USABLE ON ALL L/Gs, LDG DIST AFFECTED, N/W STEER NOT USABLE.
 */
export const ALL_SWITCHES_FAULT_LIMITATIONS_APPR_LDG = [
  '210400004',
  '320400001',
  '420400003',
  '320400002',
  '420400004',
  '420400005',
  '800400002',
  '420400006',
];

export interface AvionicsNetworkInputs {
  /** The failed AFDX switches, by switch id (1-7, 9, 11-17, 19) */
  readonly switchFailed: (switchId: number) => boolean;
  /** The failed IOMs, by IOM name (A1-A8) */
  readonly iomFailed: (iomName: string) => boolean;
}

export interface AvionicsNetworkAlerts {
  readonly allSwitchesFault: boolean;
  readonly doubleSwitchFault: boolean;
  readonly multipleSwitchFaultNetworkDegraded: boolean;
  readonly multipleSwitchFaultRedundancyDegraded: boolean;
  readonly doubleIomFault: boolean;
  readonly multipleIomFaultNetworkDegraded: boolean;
  readonly multipleIomFaultRedundancyDegraded: boolean;
}

/**
 * The AVIONICS NETWORK alerts from the failed switches and IOMs. A failed switch or IOM is one with its failure set (the
 * flyPad failure or its _FAILURE L:var); an unpowered one is not counted, its electrical alerts tell the crew.
 * Switches (DSC-42-20 l.94966-95005, PRO-ABN-ECAM-10-42):
 * - "A single switch failure will trigger a message for maintenance. It is not associated with any ECAM alert."
 *   (l.94972-94973)
 * - ALL SWITCHES FAULT: "All the switches of both avionics networks are failed" (l.169111); it replaces the others.
 * - MULTIPLE SWITCH FAULT (NETWORK DEGRADED): "One or more switches are failed on both avionics networks" (l.169708).
 * - On one network only, "Two specific switches are failed, on the same avionics network" gives DOUBLE SWITCH FAULT
 *   (l.169461) and "Two or more switches are failed on the same avionics network" MULTIPLE SWITCH FAULT (REDUNDANCY
 *   DEGRADED) (l.169791). The FCOM does not list the "specific combination of two switches ... identified ... for MEL
 *   purposes" (l.169468): here two failed switches give DOUBLE SWITCH FAULT, three or more MULTIPLE SWITCH FAULT.
 * IOMs (l.95019-95050):
 * - "A single IOM failure will trigger a message for maintenance. It is not associated with any ECAM alert." (l.95026)
 * - MULTIPLE IOM FAULT (NETWORK DEGRADED): "One, or more pair of IOM s is failed" (l.169521).
 * - Otherwise, one IOM failed in several pairs: two IOMs give DOUBLE IOM FAULT ("Two specific IOM s are failed. On each
 *   affected IOM pair, one redundant IOM remains available", l.169429-169433, the MMEL combination is not listed either),
 *   three or more MULTIPLE IOM FAULT (REDUNDANCY DEGRADED) ("Two or more IOM s are failed. For each affected pair of IOM,
 *   one IOM is available", l.169670).
 * @param inputs the failed switches and IOMs
 * @returns the alerts
 */
export function avionicsNetworkAlerts(inputs: AvionicsNetworkInputs): AvionicsNetworkAlerts {
  const failedOnNetworkA = AFDX_SWITCHES_NETWORK_A.filter((id) => inputs.switchFailed(id)).length;
  const failedOnNetworkB = AFDX_SWITCHES_NETWORK_B.filter((id) => inputs.switchFailed(id)).length;
  const allSwitchesFault =
    failedOnNetworkA === AFDX_SWITCHES_NETWORK_A.length && failedOnNetworkB === AFDX_SWITCHES_NETWORK_B.length;
  const bothNetworksAffected = failedOnNetworkA > 0 && failedOnNetworkB > 0;
  // the failed switches when only one network is affected (0 when both are)
  const failedOnOneNetworkOnly = bothNetworksAffected ? 0 : failedOnNetworkA + failedOnNetworkB;

  const failedIomsPerPair = IOM_PAIRS.map((pair) => pair.filter((iom) => inputs.iomFailed(iom)).length);
  const pairLost = failedIomsPerPair.some((failed) => failed === 2);
  const failedIoms = failedIomsPerPair.reduce((sum, failed) => sum + failed, 0);

  return {
    allSwitchesFault,
    doubleSwitchFault: failedOnOneNetworkOnly === 2,
    multipleSwitchFaultNetworkDegraded: bothNetworksAffected && !allSwitchesFault,
    multipleSwitchFaultRedundancyDegraded: failedOnOneNetworkOnly >= 3,
    doubleIomFault: !pairLost && failedIoms === 2,
    multipleIomFaultNetworkDegraded: pairLost,
    multipleIomFaultRedundancyDegraded: !pairLost && failedIoms >= 3,
  };
}

/**
 * @param switchId the AFDX switch id
 * @returns its flyPad failure id (A380Failure.AfdxSwitch<id> = 42000 + id)
 */
export function afdxSwitchFlyPadFailure(switchId: number): number {
  return 42000 + switchId;
}

/**
 * @param iomName the IOM name, A1 to A8
 * @returns its flyPad failure id (A380Failure.IomA<n> = 42100 + n)
 */
export function iomFlyPadFailure(iomName: string): number {
  return 42100 + Number(iomName.slice(1));
}

/**
 * @param switchId the AFDX switch id
 * @param flyPadFailureActive the flyPad failure 42000 + id is active
 * @param readBool reads a Bool L:var
 * @returns whether the switch is failed: its flyPad failure or L:A32NX_AFDX_SWITCH_<id>_FAILURE (a380-simvars.md)
 */
export function isAfdxSwitchFailed(
  switchId: number,
  flyPadFailureActive: boolean,
  readBool: (name: string) => boolean,
): boolean {
  return flyPadFailureActive || readBool(`L:A32NX_AFDX_SWITCH_${switchId}_FAILURE`);
}

/**
 * @param iomName the IOM name, A1 to A8
 * @param flyPadFailureActive the flyPad failure 42100 + number is active
 * @param readBool reads a Bool L:var
 * @returns whether the IOM is failed: its flyPad failure or L:A32NX_IOM_<name>_FAILURE (a380-simvars.md)
 */
export function isIomFailed(
  iomName: string,
  flyPadFailureActive: boolean,
  readBool: (name: string) => boolean,
): boolean {
  return flyPadFailureActive || readBool(`L:A32NX_IOM_${iomName}_FAILURE`);
}
