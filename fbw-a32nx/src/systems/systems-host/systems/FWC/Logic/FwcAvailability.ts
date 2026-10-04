// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The two flight warning computers of the A320. The A32NX computes the warnings in one PseudoFWC: these functions decide
 * which FWC is working, which FWC fault alert is shown and when the warning system is lost altogether.
 *
 * A320 FCOM references (texts in references/manuals/a320_fcom.txt):
 * - DSC-31-05-30 (line 45082): "The two identical FWCs generate alert messages, memos, aural alerts, and synthetic voice
 *   messages", the radio height and decision height callouts (line 45090), and drive the MASTER WARN / MASTER CAUT
 *   lights (line 45109).
 * - PRO-ABN-FWS FWS FWC 1(2) FAULT (line 86821): "This alert triggers when either FWC 1 or, FWC 2 is failed." Crew
 *   awareness; STATUS: CAT 3 SINGLE ONLY, INOP SYS CAT 3 DUAL, FWC 1(2) (lines 86846-86849).
 * - PRO-ABN-FWS FWS FWC 1 + 2 FAULT (line 86766): "This alert triggers when both FWC 1 and FWC 2 are failed";
 *   MONITOR SYS, MONITOR OVERHEAD PANEL; NOT AVAIL: ECAM WARN, ALTI ALERT, STATUS, A/CALL OUT, MEMO (lines 86773-86782);
 *   "ECAM Cautions and Warnings, aural warnings, master caution and warning lights are lost." (line 86806).
 * - Supplies: FWC 1 is lost with the AC ESS bus (ELEC AC ESS BUS FAULT INOP SYS, line 75992), FWC 2 with the AC BUS 2
 *   (ELEC AC BUS 2 FAULT INOP SYS, line 75763).
 */

/** The inputs of the two FWCs */
export interface FwcInputs {
  /** The flyPad failure of FWC 1 is active */
  fwc1Failed: boolean;
  /** The flyPad failure of FWC 2 is active */
  fwc2Failed: boolean;
  /** The supply of FWC 1 (AC ESS bus) is powered */
  fwc1Powered: boolean;
  /** The supply of FWC 2 (AC BUS 2) is powered */
  fwc2Powered: boolean;
}

/** What the two FWCs can do */
export interface FwcAvailability {
  /** FWC 1 is powered and not failed */
  fwc1Operative: boolean;
  /** FWC 2 is powered and not failed */
  fwc2Operative: boolean;
  /** At least one FWC works: it does all the warning functions alone */
  anyFwcOperative: boolean;
  /** FWS FWC 1 FAULT is shown (by FWC 2) */
  fwc1FaultAlert: boolean;
  /** FWS FWC 2 FAULT is shown (by FWC 1) */
  fwc2FaultAlert: boolean;
  /** FWS FWC 1+2 FAULT: no FWC is left, the display units show the fault and what is not available */
  fwc1And2FaultAlert: boolean;
}

/**
 * Which FWC works and which FWC fault alert is shown.
 *
 * The single FWC fault alert is raised by the remaining FWC, so only while that FWC works. It is raised by the FWC
 * failure, not by the loss of the FWC supply: that loss is shown by the electrical alert, whose INOP SYS list already
 * has the FWC (design choice, FCOM lines 75763 and 75992).
 *
 * The FWC 1+2 FAULT needs at least one FWC failure: without power on both supplies the whole cockpit is unpowered
 * (cold and dark) and nothing is shown, as before (design choice).
 * @param inputs the failures and supplies of the FWCs
 * @returns what the FWCs can do
 */
export function computeFwcAvailability(inputs: FwcInputs): FwcAvailability {
  const fwc1Operative = inputs.fwc1Powered && !inputs.fwc1Failed;
  const fwc2Operative = inputs.fwc2Powered && !inputs.fwc2Failed;
  const anyFwcOperative = fwc1Operative || fwc2Operative;

  return {
    fwc1Operative,
    fwc2Operative,
    anyFwcOperative,
    fwc1FaultAlert: inputs.fwc1Failed && fwc2Operative,
    fwc2FaultAlert: inputs.fwc2Failed && fwc1Operative,
    fwc1And2FaultAlert: !anyFwcOperative && (inputs.fwc1Failed || inputs.fwc2Failed),
  };
}

/** Whether two availabilities are the same, to notify the FWS only when one changes */
export function isSameFwcAvailability(a: FwcAvailability, b: FwcAvailability): boolean {
  return (
    a.fwc1Operative === b.fwc1Operative &&
    a.fwc2Operative === b.fwc2Operative &&
    a.anyFwcOperative === b.anyFwcOperative &&
    a.fwc1FaultAlert === b.fwc1FaultAlert &&
    a.fwc2FaultAlert === b.fwc2FaultAlert &&
    a.fwc1And2FaultAlert === b.fwc1And2FaultAlert
  );
}

/** Both FWCs off: the state before the first update */
export const FWC_AVAILABILITY_UNPOWERED: FwcAvailability = computeFwcAvailability({
  fwc1Failed: false,
  fwc2Failed: false,
  fwc1Powered: false,
  fwc2Powered: false,
});

/** The STATUS page codes (StatusMessages) of FWS FWC 1(2) FAULT */
export interface FwcFaultStatus {
  /** Left column: CAT 3 SINGLE ONLY */
  info: string[];
  /** Right column: CAT 3 DUAL and the failed FWC */
  inopSys: string[];
}

/**
 * The STATUS page of FWS FWC 1(2) FAULT (FCOM PRO-ABN-FWS, lines 86846-86849): CAT 3 SINGLE ONLY on the left,
 * CAT 3 DUAL and FWC 1(2) in the INOP SYS.
 * @param fwc the failed FWC
 * @returns the STATUS page codes
 */
export function fwcFaultStatus(fwc: 1 | 2): FwcFaultStatus {
  return {
    info: ['220200001'],
    inopSys: ['220300001', fwc === 1 ? '310300001' : '310300002'],
  };
}

/** The E/WD codes (EwdMessages) of FWS FWC 1 FAULT and FWS FWC 2 FAULT */
export const FWC_FAULT_EWD_CODES = { fwc1: '310050001', fwc2: '310051001' } as const;

/**
 * The E/WD of FWS FWC 1+2 FAULT (FCOM PRO-ABN-FWS, lines 86756-86782), as EwdMessages codes. The real display units
 * build it themselves since no FWC is left; the A32NX writes it from the PseudoFWC instead of the alerts and memos.
 */
export const FWC_1_AND_2_FAULT_EWD = {
  /** FWS FWC 1+2 FAULT, -MONITOR SYS, -MONITOR OVERHEAD PANEL */
  left: ['310052001', '310052002', '310052003'],
  /** NOT AVAIL: ECAM WARN, ALTI ALERT, STATUS, A/CALL OUT, MEMO */
  right: ['310052011', '310052012', '310052013', '310052014', '310052015', '310052016'],
} as const;
