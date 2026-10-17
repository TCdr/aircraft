// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * AIR ABNORM BLEED CONFIG of the A380X FWS: one or more bleeds are lost after AIR ENG 1(2)(3)(4) BLEED FAULT, AIR ENG
 * BLEED TEMP LO, ENG 1(2)(3)(4) SHUT DOWN or ENG 1(2)(3)(4) FIRE. The FWS has no BLEED TEMP LO alert: the BLEED FAULT
 * (BleedMonitoringAlerts.ts), ENG SHUT DOWN and ENG FIRE triggers are simulated.
 * On the aircraft the EWD does not show this alert's title. Design choice: the FWS has no title-less procedure, so the
 * lines show under the title, after the triggering alert, with no aural of their own.
 * The three crossbleed valves of the model move together (pneumatic.rs CrossBleedValve, one signal).
 */

/** The aircraft state that the alert reads. Engines 1 to 4 at index 0 to 3. */
export interface AbnormBleedConfigInputs {
  /** ENG 1(2)(3)(4) SHUT DOWN alert condition */
  readonly engineShutDown: readonly boolean[];
  readonly engineFire: readonly boolean[];
  /** AIR ENG 1(2)(3)(4) BLEED FAULT (BleedMonitoringAlerts isEngineBleedFault): the bleed is lost */
  readonly bleedFault: readonly boolean[];
  readonly bleedPbAuto: readonly boolean[];
  /** The crossbleed valves are open (L:A32NX_PNEU_XBLEED_VALVE_L/C/R_OPEN) */
  readonly xbleedOpen: boolean;
  readonly xbleedSelectorOpen: boolean;
  readonly xbleedSelectorShut: boolean;
  readonly airFlowLo: boolean;
  readonly fwdCargoTempRegulOff: boolean;
  readonly pack1On: boolean;
  readonly pack2On: boolean;
  readonly wingAntiIceOn: boolean;
}

/**
 * A bleed is inoperative: its engine is shut down or on fire, its bleed is lost (BLEED FAULT), or its ENG BLEED pb is
 * not in AUTO.
 * @param inputs the aircraft state
 * @returns per engine, whether its bleed is inoperative
 */
export function inoperativeBleeds(inputs: AbnormBleedConfigInputs): boolean[] {
  return [0, 1, 2, 3].map(
    (engine) =>
      inputs.engineShutDown[engine] ||
      inputs.engineFire[engine] ||
      inputs.bleedFault[engine] ||
      !inputs.bleedPbAuto[engine],
  );
}

/**
 * @param inputs the aircraft state
 * @returns whether the alert condition is true (with the simulated triggers)
 */
export function isAbnormBleedConfig(inputs: AbnormBleedConfigInputs): boolean {
  const triggered =
    inputs.engineShutDown.some((v) => v) || inputs.engineFire.some((v) => v) || inputs.bleedFault.some((v) => v);
  return triggered && inoperativeBleeds(inputs).some((v) => v);
}

/**
 * The lines of AIR ABNORM BLEED CONFIG (ata21-22-23.ts 211800056):
 * after ENG SHUT DOWN or BLEED FAULT, 0 XBLEED OPEN, 1 IF XBLEED OPEN, 2 IF MAX THR RQRD, 3 AIR FLOW LO,
 * 4 FWD CARGO TEMP REGUL OFF, 5 PACK 1 OFF, 6 PACK 2 OFF, 7 IF XBLEED STILL CLOSED, 8 WING A-ICE OFF,
 * 9 ENGs A-ICE AS RQRD, 10 AVOID ICING CONDs;
 * after ENG FIRE, 11 XBLEED CLOSE, 12 WING A-ICE OFF, 13 AVOID ICING CONDs, 14 PACK 1 OFF, 15 PACK 2 OFF.
 * The XBLEED lines show when the XBLEED valves did not open (close) automatically; once shown they stay (and tick)
 * while the crew holds the selector at OPEN (SHUT).
 * The lines 2 to 4 need one bleed inoperative and one engine shut down: not after a BLEED FAULT alone (its engine
 * still runs).
 * Design choices: "PACK 1(2)" with two bleeds inoperative is the pack of the side with more lost bleeds (PACK 1 on a
 * tie); the shut down (and bleed fault) lines win when an engine is both shut down and on fire.
 * @param inputs the aircraft state
 * @returns which lines are shown and which are done
 */
export function abnormBleedConfigItems(inputs: AbnormBleedConfigInputs): { show: boolean[]; checked: boolean[] } {
  const bleeds = inoperativeBleeds(inputs);
  const lost = bleeds.filter((v) => v).length;
  const leftLost = (bleeds[0] ? 1 : 0) + (bleeds[1] ? 1 : 0);
  const rightLost = lost - leftLost;
  const outerBleedLost = bleeds[0] || bleeds[3];

  // The shut down case also covers AIR ENG BLEED FAULT (and BLEED TEMP LO, not simulated)
  const engineShutDown = inputs.engineShutDown.some((v) => v);
  const shutDownCase = engineShutDown || inputs.bleedFault.some((v) => v);
  const fireCase = !shutDownCase && inputs.engineFire.some((v) => v);

  const oneBleedLost = engineShutDown && inputs.xbleedOpen && lost === 1;
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
 * LIMITATIONS ALL PHASES and on PFD: AVOID ICING CONDs when the WING A-ICE is off. Design choice: only with the bleed
 * 1 or 4 lost, the case where the procedure turns the WING A-ICE off.
 * @param inputs the aircraft state
 * @returns the limitation codes
 */
export function abnormBleedConfigLimitations(inputs: AbnormBleedConfigInputs): string[] {
  const bleeds = inoperativeBleeds(inputs);
  return (bleeds[0] || bleeds[3]) && !inputs.wingAntiIceOn ? ['300400001'] : [];
}
