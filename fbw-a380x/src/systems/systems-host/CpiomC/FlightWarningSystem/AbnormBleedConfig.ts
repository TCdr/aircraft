// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AIR ABNORM BLEED CONFIG of the A380X FWS (A380 FCOM PRO-ABN-ECAM-10-36, a380_fcom.txt l.167558-167674).
 * "One (or more) bleed is lost, and one of the following alerts has been triggered: AIR ENG 1(2)(3)(4) BLEED FAULT, AIR
 * ENG BLEED TEMP LO, ENG 1(2)(3)(4) SHUT DOWN, ENG 1(2)(3)(4) FIRE." (l.167564-167568). The FWS has no BLEED FAULT or
 * BLEED TEMP LO alert: the ENG SHUT DOWN and ENG FIRE triggers are simulated.
 * "The title of this alert (AIR ABNORM BLEED CONFIG) is not displayed on the EWD." (l.167569): the FWS has no title-less
 * procedure, so the lines show under the title, after the triggering alert (design choice, no aural of its own).
 * The three crossbleed valves of the model move together (pneumatic.rs CrossBleedValve, one signal).
 */

/** The aircraft state that the alert reads. Engines 1 to 4 at index 0 to 3. */
export interface AbnormBleedConfigInputs {
  /** ENG 1(2)(3)(4) SHUT DOWN alert condition */
  readonly engineShutDown: readonly boolean[];
  /** ENG 1(2)(3)(4) FIRE detected */
  readonly engineFire: readonly boolean[];
  /** ENG 1(2)(3)(4) BLEED pb in AUTO */
  readonly bleedPbAuto: readonly boolean[];
  /** The crossbleed valves are open (L:A32NX_PNEU_XBLEED_VALVE_L/C/R_OPEN) */
  readonly xbleedOpen: boolean;
  /** The XBLEED selector is set to OPEN */
  readonly xbleedSelectorOpen: boolean;
  /** The XBLEED selector is set to SHUT */
  readonly xbleedSelectorShut: boolean;
  /** The AIR FLOW selector is set to LO */
  readonly airFlowLo: boolean;
  /** The FWD CARGO TEMP REGUL pb is OFF */
  readonly fwdCargoTempRegulOff: boolean;
  readonly pack1On: boolean;
  readonly pack2On: boolean;
  readonly wingAntiIceOn: boolean;
}

/**
 * A bleed is inoperative: its engine is shut down or on fire, or its ENG BLEED pb is not in AUTO.
 * @param inputs the aircraft state
 * @returns per engine, whether its bleed is inoperative
 */
export function inoperativeBleeds(inputs: AbnormBleedConfigInputs): boolean[] {
  return [0, 1, 2, 3].map(
    (engine) => inputs.engineShutDown[engine] || inputs.engineFire[engine] || !inputs.bleedPbAuto[engine],
  );
}

/**
 * @param inputs the aircraft state
 * @returns whether the alert condition is true (l.167564-167568, with the simulated triggers)
 */
export function isAbnormBleedConfig(inputs: AbnormBleedConfigInputs): boolean {
  const triggered = inputs.engineShutDown.some((v) => v) || inputs.engineFire.some((v) => v);
  return triggered && inoperativeBleeds(inputs).some((v) => v);
}

/**
 * The lines of AIR ABNORM BLEED CONFIG (ata21-22-23.ts 211800056, a380_fcom.txt l.167585-167628):
 * after ENG SHUT DOWN, 0 XBLEED OPEN, 1 IF XBLEED OPEN, 2 IF MAX THR RQRD, 3 AIR FLOW LO, 4 FWD CARGO TEMP REGUL OFF,
 * 5 PACK 1 OFF, 6 PACK 2 OFF, 7 IF XBLEED STILL CLOSED, 8 WING A-ICE OFF, 9 ENGs A-ICE AS RQRD, 10 AVOID ICING CONDs;
 * after ENG FIRE, 11 XBLEED CLOSE, 12 WING A-ICE OFF, 13 AVOID ICING CONDs, 14 PACK 1 OFF, 15 PACK 2 OFF.
 * The XBLEED lines show "if the appropriate XBLEED valves did not open (close) automatically"; once shown they stay (and
 * tick) while the crew holds the selector at OPEN (SHUT).
 * Design choices: "PACK 1(2)" with two bleeds inoperative is the pack of the side with more lost bleeds (PACK 1 on a tie);
 * the shut down lines win when an engine is both shut down and on fire.
 * @param inputs the aircraft state
 * @returns which lines are shown and which are done
 */
export function abnormBleedConfigItems(inputs: AbnormBleedConfigInputs): { show: boolean[]; checked: boolean[] } {
  const bleeds = inoperativeBleeds(inputs);
  const lost = bleeds.filter((v) => v).length;
  const leftLost = (bleeds[0] ? 1 : 0) + (bleeds[1] ? 1 : 0);
  const rightLost = lost - leftLost;
  const outerBleedLost = bleeds[0] || bleeds[3];

  const shutDownCase = inputs.engineShutDown.some((v) => v);
  const fireCase = !shutDownCase && inputs.engineFire.some((v) => v);

  const oneBleedLost = shutDownCase && inputs.xbleedOpen && lost === 1;
  const twoBleedsLost = shutDownCase && inputs.xbleedOpen && lost >= 2;
  const outerBleedClosed = shutDownCase && outerBleedLost;
  const fireOuterBleed = fireCase && outerBleedLost;

  const show = [
    shutDownCase && (!inputs.xbleedOpen || inputs.xbleedSelectorOpen),
    shutDownCase,
    oneBleedLost,
    oneBleedLost,
    oneBleedLost,
    twoBleedsLost && leftLost >= rightLost,
    twoBleedsLost && rightLost > leftLost,
    outerBleedClosed,
    outerBleedClosed && !inputs.xbleedOpen,
    outerBleedClosed && !inputs.xbleedOpen,
    outerBleedClosed && !inputs.xbleedOpen,
    fireCase && (inputs.xbleedOpen || inputs.xbleedSelectorShut),
    fireOuterBleed,
    fireOuterBleed,
    fireCase && leftLost === 2,
    fireCase && rightLost === 2,
  ];
  const checked = [
    inputs.xbleedOpen,
    inputs.xbleedOpen,
    false,
    inputs.airFlowLo,
    inputs.fwdCargoTempRegulOff,
    !inputs.pack1On,
    !inputs.pack2On,
    !inputs.xbleedOpen,
    !inputs.wingAntiIceOn,
    false,
    false,
    !inputs.xbleedOpen,
    !inputs.wingAntiIceOn,
    false,
    !inputs.pack1On,
    !inputs.pack2On,
  ];
  return { show, checked };
}

/**
 * LIMITATIONS ALL PHASES and on PFD: "If the WING A-ICE is off: AVOID ICING CONDs" (l.167646-167656). Design choice:
 * with the bleed 1 or 4 lost, the case where the procedure turns the WING A-ICE off (l.167608-167613, l.167620-167622).
 * @param inputs the aircraft state
 * @returns the limitation codes
 */
export function abnormBleedConfigLimitations(inputs: AbnormBleedConfigInputs): string[] {
  const bleeds = inoperativeBleeds(inputs);
  return (bleeds[0] || bleeds[3]) && !inputs.wingAntiIceOn ? ['300400001'] : [];
}
