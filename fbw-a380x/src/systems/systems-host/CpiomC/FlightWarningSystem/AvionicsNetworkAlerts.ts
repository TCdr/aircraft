// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATA 42 AVIONICS NETWORK alerts of the A380X FWS, from the AFDX switch and IOM failures of the Rust ADCN model
 * (a380_systems avionics_data_communication_network.rs, flyPad failures 42001-42019 and 42101-42108).
 * Not simulated: AVIONICS NETWORK MULTIPLE CABLE FAULT (no cable model), and the procedure lines that depend on which
 * switches or IOMs failed: the sim does not map the aircraft systems to the IOM pairs and switch ports.
 */

/** The 16 AFDX switches of the Rust ADCN: network A 1-7, 9 and network B 11-17, 19 (paired as n and n + 10) */
export const AFDX_SWITCHES_NETWORK_A = [1, 2, 3, 4, 5, 6, 7, 9] as const;
export const AFDX_SWITCHES_NETWORK_B = [11, 12, 13, 14, 15, 16, 17, 19] as const;

/**
 * The four IOM pairs: each avionics system that uses IOMs is connected to a redundant pair. Design choice (the real
 * pairing is not known): A1+A2, A3+A4, A5+A6, A7+A8, the two IOMs of a pair on different switches and power supplies
 * in the Rust ADCN (A1/A3/A5/A7 on DC ESS, A2/A4/A6/A8 on DC 2), as a redundant pair would be.
 */
const IOM_PAIRS = [
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

/** ALL SWITCHES FAULT: flight phases 4 to 7, 9 and 10 */
export const ALL_SWITCHES_FAULT_PHASE_INHIBITION = [4, 5, 6, 7, 9, 10];

/** DOUBLE IOM FAULT and DOUBLE SWITCH FAULT: flight phases 2 to 11 */
export const DOUBLE_FAULT_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The four MULTIPLE IOM / SWITCH FAULT alerts: flight phases 3 to 7, 9 and 10 */
export const MULTIPLE_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/**
 * LIMITATIONS ON ECAM of ALL SWITCHES FAULT, LAND ANSA from the procedure recommendation.
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
 * Switches:
 * - A single switch failure gives a maintenance message only, no ECAM alert.
 * - ALL SWITCHES FAULT: all the switches of both networks failed; it replaces the others.
 * - MULTIPLE SWITCH FAULT (NETWORK DEGRADED): one or more switches failed on each of the two networks.
 * - On one network only: DOUBLE SWITCH FAULT for two specific switches, MULTIPLE SWITCH FAULT (REDUNDANCY DEGRADED)
 *   for two or more. Design choice (the specific pairs, an MEL matter, are not known): two failed switches give
 *   DOUBLE SWITCH FAULT, three or more MULTIPLE SWITCH FAULT.
 * IOMs:
 * - A single IOM failure gives a maintenance message only, no ECAM alert.
 * - MULTIPLE IOM FAULT (NETWORK DEGRADED): one or more IOM pairs fully lost.
 * - Otherwise, one IOM failed in several pairs (each pair keeps one IOM): two IOMs give DOUBLE IOM FAULT (the specific
 *   combination is not known either), three or more MULTIPLE IOM FAULT (REDUNDANCY DEGRADED).
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
