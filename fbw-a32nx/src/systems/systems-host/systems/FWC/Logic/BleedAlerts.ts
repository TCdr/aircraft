// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { CrossBleedSelector } from './EngineFailAlerts';

/*
 * The AIR bleed cautions of the A320 (FCOM PRO-ABN-AIR, a320_fcom.txt l.69509-71070), from the flags the Rust
 * pneumatic system already writes (a320_systems/src/pneumatic.rs, docs/a320-simvars.md "Pneumatic"):
 * - AIR ENG 1(2) BLEED FAULT, l.69799-69855, and its BLEED NOT CLOSED subtitle, l.69942-70003
 * - AIR ENG 1+2 BLEED FAULT, l.70015-70075, and its LEFT LEAK, RIGHT LEAK, LEFT LEAK AND RIGHT LEAK subtitles,
 *   l.70087-70277
 * - AIR ENG 1(2) BLEED LO TEMP, l.70279-70399 (both variants); AIR ENG 1+2 BLEED LO TEMP, l.70401-70452
 * - AIR ENG 1(2) BLEED HI TEMP, l.70464-70520
 * - AIR ENG 1(2) BLEED NOT CLSD, l.70532-70563
 * - AIR BLEED 1(2) OFF, l.69676-69692
 * - AIR APU BLEED FAULT, l.69509-69534
 * - AIR X BLEED FAULT, l.71013-71070
 * The title colours (all amber, level 2) and the flight phase inhibition figures are images, read on the FCOM PDF
 * ("A320 Neo FCOM_1.pdf", PRO-ABN-AIR, pages given at each constant).
 *
 * Not modelled here because the Rust code has no input for them (see the report of the FCOM gap audit, 36-pneumatic):
 * BLEED ABNORM PR. The LEAK, LEAK DET FAULT, HP VALVE FAULT and BMC alerts are in FWC/Logic/BleedLeakMonitoringAlerts.
 */

/** l.70474: "This alert triggers when the precooler outlet temperature is above 240 °C." */
export const BLEED_HI_TEMP_THRESHOLD_CELSIUS = 240;

/**
 * The confirmation times of the alerts that compare a valve with its command. Design choices, the FCOM gives none:
 * - APU BLEED FAULT: 10 s, the delay of the amber APU valve of the BLEED page (FCOM DSC-36 l.57807-57808: "the APU bleed
 *   switch is ON for more than 10 s");
 * - X BLEED FAULT: 5 s, twice the travel time of the crossbleed valve (2.5 s, valve speed 0.4/s in pneumatic.rs);
 * - BLEED NOT CLSD: 10 s, so that a valve closing at engine shutdown or APU BLEED ON does not trigger it.
 */
export const APU_BLEED_FAULT_CONFIRM_SECONDS = 10;
export const X_BLEED_FAULT_CONFIRM_SECONDS = 5;
export const BLEED_NOT_CLOSED_CONFIRM_SECONDS = 10;

/** Flight phase inhibition figures (FCOM PDF PRO-ABN-AIR). The A320 FWC phases are 1 to 10. */
export const BleedPhaseInhibition = {
  /** ENG 1(2) BLEED FAULT (page 4330) and ENG 1+2 BLEED FAULT (page 4339) */
  bleedFault: [1, 3, 4, 5, 7, 8, 10],
  /** ENG 1(2) BLEED LO TEMP (pages 4348, 4350) and ENG 1+2 BLEED LO TEMP (page 4353) */
  bleedLoTemp: [3, 4, 5, 8],
  /** ENG 1(2) BLEED HI TEMP (page 4356) */
  bleedHiTemp: [1, 3, 4, 5, 7, 8, 10],
  /** ENG 1(2) BLEED NOT CLSD (page 4359) */
  bleedNotClosed: [3, 4, 5, 7, 8],
  /** BLEED 1(2) OFF (page 4322): shown in phases 2 and 6 only */
  bleedOff: [1, 3, 4, 5, 7, 8, 9, 10],
  /** APU BLEED FAULT (page 4318) */
  apuBleedFault: [3, 4, 5, 7, 8],
  /** X BLEED FAULT (page 4390) */
  crossBleedFault: [3, 4, 5, 7, 8],
};

/** What the FWC reads of one engine bleed system */
export interface EngineBleedInputs {
  /** The FADEC reports the engine running (L:A32NX_ENGINE_STATE On) */
  engineRunning: boolean;
  /** The engine is stopped (L:A32NX_ENGINE_STATE Off), not starting nor shutting down */
  engineStopped: boolean;
  /** L:A32NX_OVHD_PNEU_ENG_n_BLEED_PB_IS_AUTO */
  bleedPbAuto: boolean;
  /** L:A32NX_PNEU_ENG_n_OVERHEAT: the BMC overheat monitor (257 °C 55 s, 270 °C 15 s, 290 °C 5 s) */
  overheat: boolean;
  /** L:A32NX_PNEU_ENG_n_OVERPRESSURE: the BMC overpressure monitor */
  overpressure: boolean;
  /** L:A32NX_PNEU_ENG_n_LOW_TEMPERATURE: the bleed supplies air below 150 °C in flight with WING A-ICE ON */
  lowTemperature: boolean;
  /** L:A32NX_PNEU_ENG_n_BLEED_TEMPERATURE_SENSOR_TEMPERATURE: the precooler outlet temperature, -100 without output */
  bleedTemperatureCelsius: number;
  /** L:A32NX_PNEU_ENG_n_PR_VALVE_OPEN: the engine bleed (pressure regulating) valve is open */
  bleedValveOpen: boolean;
  /** L:A32NX_PNEU_ENG_n_STARTER_VALVE_OPEN */
  starterValveOpen: boolean;
  /** L:A32NX_FIRE_BUTTON_ENGn: the ENG FIRE pb is pushed (released out) */
  firePbPushed: boolean;
  /** L:A32NX_OVHD_COND_PACK_n_PB_IS_ON */
  packOn: boolean;
  /**
   * A leak is detected on the side of this engine: L:A32NX_PNEU_ENG_n_BLEED_LEAK (pylon) or
   * L:A32NX_PNEU_LEFT(RIGHT)_WING_LEAK (engine 1: left wing, engine 2: right wing), the AIR LEAK alerts
   */
  wingOrPylonLeak: boolean;
}

/** What the FWC reads for the bleed alerts */
export interface BleedInputs {
  engines: readonly [EngineBleedInputs, EngineBleedInputs];
  /** L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED: the WING ANTI ICE pb is ON */
  wingAntiIceOn: boolean;
  /** L:A32NX_KNOB_OVHD_AIRCOND_PACKFLOW_Position is LO */
  packFlowLo: boolean;
  /** L:A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position */
  crossBleedSelector: CrossBleedSelector;
  /** L:A32NX_PNEU_XBLEED_VALVE_FULLY_OPEN */
  crossBleedFullyOpen: boolean;
  /** L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED */
  crossBleedFullyClosed: boolean;
  /** L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE: the APU AVAIL light (it stays on during the APS3200 shutdown) */
  apuAvailable: boolean;
  /** L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON */
  apuMasterSwitchOn: boolean;
  /** L:A32NX_APU_N, the APU speed in percent (0 without a valid word) */
  apuSpeedPercent: number;
  /** L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON */
  apuBleedPbOn: boolean;
  /** L:A32NX_APU_BLEED_AIR_VALVE_OPEN */
  apuBleedValveOpen: boolean;
  /** L:A32NX_AUTOTHRUST_STATUS is not disengaged */
  autoThrustEngaged: boolean;
}

/** Engine index: 0 for engine 1, 1 for engine 2 */
export type EngineIndex = 0 | 1;

const opposite = (engine: EngineIndex): EngineIndex => (engine === 0 ? 1 : 0);

/**
 * l.69805-69811: ENG 1(2) BLEED FAULT "triggers when the engine 1(2) is running and: The engine bleed air pressure is
 * above 57 PSI (+3/-0), or The engine bleed air temperature is above: 257 °C for more than 55 s, 270 °C for more than
 * 15 s, 290 °C for more than 5 s." The BMC monitors of pneumatic.rs give the overpressure and overheat flags (their
 * overpressure threshold, 60 PSI for 15 s, is a Rust gap of its own, A5 of the audit).
 */
export function isEngineBleedFault(engine: EngineBleedInputs): boolean {
  return engine.engineRunning && (engine.overheat || engine.overpressure);
}

/**
 * l.69953-69959: ENG 1(2) BLEED FAULT / BLEED NOT CLOSED "triggers when the engine 1(2) is running, the engine 1(2) bleed
 * valve fails to close, and" the overpressure or overheat of the BLEED FAULT. The BMC closes the bleed valve on these
 * detections (FCOM DSC-36 l.57288-57299, pneumatic.rs): a valve still open is a valve that fails to close (the flyPad
 * failure "Engine n bleed valve stuck open").
 */
export function isEngineBleedFaultValveNotClosed(engine: EngineBleedInputs): boolean {
  return isEngineBleedFault(engine) && engine.bleedValveOpen;
}

/**
 * The bleed supply of a running engine is lost: its BLEED FAULT, or a wing or pylon leak on its side (the BMC closes
 * the bleed valve on a leak, l.57288-57299). ENG 1+2 BLEED FAULT "triggers when both engine bleed supply systems are
 * lost" (l.70025), with the LEAK subtitle of the leak sides (l.70098-70099, l.70159-70160, l.70232-70233).
 */
export function isEngineBleedSupplyLost(engine: EngineBleedInputs): boolean {
  return isEngineBleedFault(engine) || hasEngineSideLeak(engine);
}

/** A wing or pylon leak on the side of a running engine: "a left wing leak or a pylon leak on side 1" (l.70098-70099) */
export function hasEngineSideLeak(engine: EngineBleedInputs): boolean {
  return engine.engineRunning && engine.wingOrPylonLeak;
}

/**
 * l.70474: ENG 1(2) BLEED HI TEMP above 240 °C at the precooler outlet. Design choice: not shown while the BLEED FAULT of
 * the same engine is, which an overheat above 257 °C triggers, as the FAULT procedure covers the HI TEMP one.
 */
export function isEngineBleedHiTemp(engine: EngineBleedInputs): boolean {
  return engine.bleedTemperatureCelsius > BLEED_HI_TEMP_THRESHOLD_CELSIUS && !isEngineBleedFault(engine);
}

/**
 * An engine bleed that supplies air: the engine runs, its ENG BLEED pb is ON (AUTO), its ENG FIRE pb is not pushed, and
 * it has no BLEED FAULT. Used for "OPPOSITE BLEED AVAILABLE" (LO TEMP) and "only one bleed available" (X BLEED FAULT).
 */
export function isEngineBleedAvailable(engine: EngineBleedInputs): boolean {
  return engine.engineRunning && engine.bleedPbAuto && !engine.firePbPushed && !isEngineBleedFault(engine);
}

/**
 * The APU bleed closes an engine bleed valve (FCOM DSC-36 l.57299 "APU bleed being ON"). Design choice: as the BMC
 * of pneumatic.rs, engine 2 only while the crossbleed valve is open, as the APU air reaches the engine 2 duct through it.
 */
export function apuBleedClosesEngineBleed(inputs: BleedInputs, engine: EngineIndex): boolean {
  return inputs.apuBleedPbOn && inputs.apuBleedValveOpen && (engine === 0 || !inputs.crossBleedFullyClosed);
}

/**
 * l.70542-70544: BLEED NOT CLSD "triggers when the engine bleed valve fails to close: During engine start or when APU
 * BLEED pb-sw is set to ON; At engine shutdown or when APU BLEED pb-sw is set to OFF with engine not running."
 * The valve must be closed during a start (starter valve open), with the APU bleed on, or with the engine stopped.
 * Design choice: "engine shutdown" is the engine stopped (L:A32NX_ENGINE_STATE Off), as the valve closes only when the
 * spooling-down engine no longer gives 8 PSI (l.57285), not at the ENG MASTER OFF.
 */
export function isEngineBleedValveNotClosed(inputs: BleedInputs, engine: EngineIndex): boolean {
  const e = inputs.engines[engine];
  const mustBeClosed = e.starterValveOpen || apuBleedClosesEngineBleed(inputs, engine) || e.engineStopped;
  return mustBeClosed && e.bleedValveOpen;
}

/**
 * Whether the crossbleed valve is commanded open: OPEN and SHUT are manual, AUTO opens it while the APU bleed valve is
 * open (FCOM DSC-36 X BLEED selector; the BMC of pneumatic.rs).
 */
export function isCrossBleedValveCommandedOpen(inputs: BleedInputs): boolean {
  switch (inputs.crossBleedSelector) {
    case CrossBleedSelector.Open:
      return true;
    case CrossBleedSelector.Shut:
      return false;
    default:
      return inputs.apuBleedValveOpen;
  }
}

/** l.71023-71024: X BLEED FAULT "triggers when the crossbleed valve position disagrees with the X-BLEED selector position." */
export function isCrossBleedValveDisagree(inputs: BleedInputs): boolean {
  return isCrossBleedValveCommandedOpen(inputs) ? !inputs.crossBleedFullyOpen : !inputs.crossBleedFullyClosed;
}

/** The APU speed above which the ECB opens the APU bleed valve (electronic_control_box.rs) */
export const APU_BLEED_VALVE_MIN_SPEED_PERCENT = 95;

/**
 * The APU is running, for APU BLEED FAULT. Design choice: the APU AVAIL with the APU MASTER SW ON and the speed above
 * 95 %, the conditions in which the ECB opens the valve: the valve stays closed during the APU start, and closes at the
 * MASTER SW OFF and during a shutdown while the AVAIL light of the APS3200 stays on.
 */
export function isApuRunning(inputs: BleedInputs): boolean {
  return inputs.apuAvailable && inputs.apuMasterSwitchOn && inputs.apuSpeedPercent > APU_BLEED_VALVE_MIN_SPEED_PERCENT;
}

/**
 * l.69519-69520: APU BLEED FAULT "triggers when the APU is running and the position of the APU bleed valve disagrees
 * with the selected position of the APU BLEED pb-sw."
 */
export function isApuBleedValveDisagree(inputs: BleedInputs): boolean {
  return isApuRunning(inputs) && inputs.apuBleedPbOn !== inputs.apuBleedValveOpen;
}

/** The alert conditions that need a confirmation time or a memory (BleedAlerts keeps them) */
export interface BleedConfirmedConditions {
  apuBleedValveDisagree: boolean;
  crossBleedValveDisagree: boolean;
  engineBleedValveNotClosed: readonly [boolean, boolean];
  /** The BLEED FAULT of the engine with its bleed valve still open, confirmed (BLEED NOT CLOSED subtitle) */
  engineBleedFaultValveNotClosed: readonly [boolean, boolean];
  /** The bleed of the engine had an alert since its ENG BLEED pb was set OFF, see bleedOffInhibitMemory */
  bleedOffInhibited: readonly [boolean, boolean];
}

/** The bleed alerts, true when the alert is triggered (before the flight phase inhibition) */
export interface BleedAlertStates {
  engineBleedFault: [boolean, boolean];
  /** ENG 1(2) BLEED FAULT with the BLEED NOT CLOSED subtitle */
  engineBleedFaultNotClosed: [boolean, boolean];
  engine1And2BleedFault: boolean;
  /** ENG 1+2 BLEED FAULT with the LEFT LEAK subtitle */
  engine1And2BleedFaultLeftLeak: boolean;
  /** ENG 1+2 BLEED FAULT with the RIGHT LEAK subtitle */
  engine1And2BleedFaultRightLeak: boolean;
  /** ENG 1+2 BLEED FAULT with the LEFT LEAK AND RIGHT LEAK subtitle */
  engine1And2BleedFaultLeftAndRightLeak: boolean;
  engineBleedLoTemp: [boolean, boolean];
  engine1And2BleedLoTemp: boolean;
  engineBleedHiTemp: [boolean, boolean];
  engineBleedNotClosed: [boolean, boolean];
  bleedOff: [boolean, boolean];
  apuBleedFault: boolean;
  crossBleedFault: boolean;
}

/**
 * Whether the bleed of an engine has an alert (FAULT, LO TEMP, HI TEMP, NOT CLSD, or a LEAK on its side, whose
 * procedures ask for ENG BLEED OFF: l.70700-70710, l.70105-70118), to inhibit its BLEED OFF alert
 */
export function hasEngineBleedAlert(inputs: BleedInputs, engine: EngineIndex, notClosedConfirmed: boolean): boolean {
  const e = inputs.engines[engine];
  return isEngineBleedFault(e) || e.lowTemperature || isEngineBleedHiTemp(e) || notClosedConfirmed || e.wingOrPylonLeak;
}

/**
 * BLEED 1(2) OFF "triggers when the ENG 1(2) BLEED pb-sw is abnormally set to OFF" (l.69686). Design choice: the pb OFF is
 * normal once a bleed alert of that engine has asked for it (BLEED FAULT, LO TEMP, NOT CLSD: "ENG BLEED (AFFECTED) OFF"),
 * so the alert stays inhibited from such an alert until the pb is set back to AUTO, even when the alert condition is
 * gone (the LO TEMP flag, for example, needs the bleed valve open).
 * @returns the memory for the next update
 */
export function bleedOffInhibitMemory(previous: boolean, bleedPbAuto: boolean, engineBleedAlert: boolean): boolean {
  return !bleedPbAuto && (previous || engineBleedAlert);
}

/**
 * The alerts from the inputs and the confirmed conditions. ENG 1+2 BLEED FAULT (any subtitle) and ENG 1+2 BLEED LO TEMP
 * replace the single engine alerts (l.70025: "both engine bleed supply systems are lost", l.70411: "both engine bleeds
 * supply bleed air at a temperature below 150 °C"). The subtitle of ENG 1+2 BLEED FAULT names the leak sides: none
 * (l.70025-70026 "without wing leak or pylon leak on any side"), LEFT LEAK, RIGHT LEAK, LEFT LEAK AND RIGHT LEAK.
 * ENG 1(2) BLEED FAULT / BLEED NOT CLOSED replaces ENG 1(2) BLEED FAULT, and the NOT CLSD alert of the same valve
 * (design choice: its procedure already sets the ENG BLEED OFF).
 */
export function bleedAlertStates(inputs: BleedInputs, confirmed: BleedConfirmedConditions): BleedAlertStates {
  const [e1, e2] = inputs.engines;
  const fault: [boolean, boolean] = [isEngineBleedFault(e1), isEngineBleedFault(e2)];
  const bothLost = isEngineBleedSupplyLost(e1) && isEngineBleedSupplyLost(e2);
  const leftLeak = hasEngineSideLeak(e1);
  const rightLeak = hasEngineSideLeak(e2);
  const faultNotClosed: [boolean, boolean] = [
    fault[0] && !bothLost && confirmed.engineBleedFaultValveNotClosed[0],
    fault[1] && !bothLost && confirmed.engineBleedFaultValveNotClosed[1],
  ];
  const bothLoTemp = e1.lowTemperature && e2.lowTemperature;
  const bleedOff = (engine: EngineIndex): boolean => {
    const e = inputs.engines[engine];
    return e.engineRunning && !e.bleedPbAuto && !e.firePbPushed && !confirmed.bleedOffInhibited[engine];
  };

  return {
    engineBleedFault: [fault[0] && !bothLost && !faultNotClosed[0], fault[1] && !bothLost && !faultNotClosed[1]],
    engineBleedFaultNotClosed: faultNotClosed,
    engine1And2BleedFault: bothLost && !leftLeak && !rightLeak,
    engine1And2BleedFaultLeftLeak: bothLost && leftLeak && !rightLeak,
    engine1And2BleedFaultRightLeak: bothLost && rightLeak && !leftLeak,
    engine1And2BleedFaultLeftAndRightLeak: bothLost && leftLeak && rightLeak,
    engineBleedLoTemp: [e1.lowTemperature && !bothLoTemp, e2.lowTemperature && !bothLoTemp],
    engine1And2BleedLoTemp: bothLoTemp,
    engineBleedHiTemp: [isEngineBleedHiTemp(e1), isEngineBleedHiTemp(e2)],
    engineBleedNotClosed: [
      confirmed.engineBleedValveNotClosed[0] && !faultNotClosed[0],
      confirmed.engineBleedValveNotClosed[1] && !faultNotClosed[1],
    ],
    bleedOff: [bleedOff(0), bleedOff(1)],
    apuBleedFault: confirmed.apuBleedValveDisagree,
    crossBleedFault: confirmed.crossBleedValveDisagree,
  };
}

/* E/WD lines. Each function returns the indices of the lines to show in the codes of its alert (EwdMessages 3611xxx). */

/**
 * ENG 1(2) BLEED FAULT, l.69830-69845: 0 title, 1 -ENG n BLEED OFF, 2 -PACK FLOW LO, 3 -PACK n OFF, 4 -X BLEED OPEN.
 * "ENG BLEED (AFFECTED, IF NOT AUTOMATICALLY CLOSED) OFF": shown while the pb is ON and the bleed valve is not closed;
 * "If wing anti-ice is off and both packs are on: PACK FLOW LO"; "If wing anti-ice is on and both packs are on: PACK
 * (AFFECTED) OFF"; "X BLEED OPEN". The lines of actions done go.
 */
export function engineBleedFaultLines(inputs: BleedInputs, engine: EngineIndex): number[] {
  const e = inputs.engines[engine];
  const bothPacksOn = inputs.engines[0].packOn && inputs.engines[1].packOn;
  const lines = [0];
  if (e.bleedPbAuto && e.bleedValveOpen) {
    lines.push(1);
  }
  if (!inputs.wingAntiIceOn && bothPacksOn && !inputs.packFlowLo) {
    lines.push(2);
  }
  if (inputs.wingAntiIceOn && bothPacksOn) {
    lines.push(3);
  }
  if (inputs.crossBleedSelector !== CrossBleedSelector.Open) {
    lines.push(4);
  }
  return lines;
}

/**
 * ENG 1+2 BLEED FAULT, l.70046-70063 (PDF page 4340): 0 title, 1 -X BLEED AUTO, 2 -WING ANTI ICE OFF, 3 AVOID ICING
 * CONDITIONS, 4 -APU BLEED OFF ("If APU Bleed is ON and fails"), 5 -ENG 1 BLEED OFF THEN ON, 6 -ENG 2 BLEED OFF THEN ON,
 * 7 .IF UNSUCCESSFUL:, 8 -ENG 1 BLEED OFF, 9 -ENG 2 BLEED OFF, 10 -DES TO FL 100/MEA-MORA, 11 -BLEED 1+2 PROC APPLY.
 * The OFF THEN ON lines cannot be seen done and stay; the lines of actions done go.
 */
export function engine1And2BleedFaultLines(inputs: BleedInputs, apuBleedFault: boolean): number[] {
  const lines = [0];
  if (inputs.crossBleedSelector !== CrossBleedSelector.Auto) {
    lines.push(1);
  }
  if (inputs.wingAntiIceOn) {
    lines.push(2);
  }
  lines.push(3);
  if (inputs.apuBleedPbOn && apuBleedFault) {
    lines.push(4);
  }
  lines.push(5, 6, 7);
  if (inputs.engines[0].bleedPbAuto) {
    lines.push(8);
  }
  if (inputs.engines[1].bleedPbAuto) {
    lines.push(9);
  }
  lines.push(10, 11);
  return lines;
}

/**
 * ENG 1(2) BLEED FAULT / BLEED NOT CLOSED, l.69980-69991: 0 title, 1 BLEED NOT CLOSED (subtitle), 2 -ENG n BLEED OFF,
 * 3 -PACK FLOW LO, 4 -PACK n OFF, 5 -X BLEED SHUT, 6 -WING ANTI ICE OFF, 7 AVOID ICING CONDITIONS, 8 -APU BLEED OFF.
 * "ENG BLEED (AFFECTED) OFF" (while the pb-sw is ON: the valve does not close); "If wing anti-ice is off: PACK FLOW LO";
 * "PACK (AFFECTED) OFF"; "X BLEED SHUT"; "WING ANTI ICE OFF"; "AVOID ICING CONDITIONS"; "If engine 1 bleed is
 * affected: APU BLEED OFF". The lines of actions done go.
 */
export function engineBleedFaultNotClosedLines(inputs: BleedInputs, engine: EngineIndex): number[] {
  const e = inputs.engines[engine];
  const lines = [0, 1];
  if (e.bleedPbAuto) {
    lines.push(2);
  }
  if (!inputs.wingAntiIceOn && !inputs.packFlowLo) {
    lines.push(3);
  }
  if (e.packOn) {
    lines.push(4);
  }
  if (inputs.crossBleedSelector !== CrossBleedSelector.Shut) {
    lines.push(5);
  }
  if (inputs.wingAntiIceOn) {
    lines.push(6);
  }
  lines.push(7);
  if (engine === 0 && inputs.apuBleedPbOn) {
    lines.push(8);
  }
  return lines;
}

/** The leak sides of ENG 1+2 BLEED FAULT: its LEFT LEAK, RIGHT LEAK and LEFT LEAK AND RIGHT LEAK subtitles */
export type DualBleedFaultLeak = 'left' | 'right' | 'leftAndRight';

/**
 * ENG 1+2 BLEED FAULT with a LEAK subtitle. Lines 0 title, 1 subtitle, 2 -X BLEED SHUT, 3 -WING ANTI ICE OFF, 4 AVOID
 * ICING CONDITIONS, 5 -APU BLEED OFF, then:
 * - LEFT LEAK (l.70105-70118, "If APU bleed is ON"): 6 -ENG 2 BLEED OFF THEN ON, 7 .IF UNSUCCESSFUL:, 8 -ENG 1 BLEED OFF,
 *   9 -ENG 2 BLEED OFF, 10 -DES TO FL 100/MEA-MORA, 11 -BLEED 1+2 PROC APPLY;
 * - RIGHT LEAK (l.70181-70197, "If APU bleed is ON and fails"): 6 -ENG 1 BLEED OFF THEN ON, then as LEFT LEAK;
 * - LEFT LEAK AND RIGHT LEAK (l.70239-70250, "If APU bleed is ON"): 6 -ENG 1 BLEED OFF, 7 -ENG 2 BLEED OFF, 8 -DES TO
 *   FL 100/MEA-MORA, 9 -BLEED 1+2 PROC APPLY.
 * The OFF THEN ON lines cannot be seen done and stay; the lines of actions done go.
 */
export function engine1And2BleedFaultLeakLines(
  inputs: BleedInputs,
  leak: DualBleedFaultLeak,
  apuBleedFault: boolean,
): number[] {
  const lines = [0, 1];
  if (inputs.crossBleedSelector !== CrossBleedSelector.Shut) {
    lines.push(2);
  }
  if (inputs.wingAntiIceOn) {
    lines.push(3);
  }
  lines.push(4);
  const apuBleedOffAsked = leak === 'right' ? inputs.apuBleedPbOn && apuBleedFault : inputs.apuBleedPbOn;
  if (apuBleedOffAsked) {
    lines.push(5);
  }
  const bleedOffLines = leak === 'leftAndRight' ? [6, 7] : [8, 9];
  if (leak !== 'leftAndRight') {
    lines.push(6, 7);
  }
  if (inputs.engines[0].bleedPbAuto) {
    lines.push(bleedOffLines[0]);
  }
  if (inputs.engines[1].bleedPbAuto) {
    lines.push(bleedOffLines[1]);
  }
  lines.push(bleedOffLines[1] + 1, bleedOffLines[1] + 2);
  return lines;
}

/** LO TEMP "(OPPOSITE BLEED AVAILABLE)" (l.70279) or "(OPPOSITE BLEED NOT AVAILABLE)" (l.70346) */
export function isOppositeBleedAvailable(inputs: BleedInputs, engine: EngineIndex): boolean {
  return isEngineBleedAvailable(inputs.engines[opposite(engine)]);
}

/**
 * ENG 1(2) BLEED LO TEMP: 0 title, 1 -A/THR OFF, 2 -THR LEVER n ADVANCE, 3 .IF UNSUCCESSFUL:, 4 -X BLEED OPEN, 5 -ENG n
 * BLEED OFF, 6 -PACK n OFF, 7 -WING ANTI ICE OFF, 8 AVOID ICING CONDITIONS.
 * - Opposite bleed available, l.70312-70322: A/THR OFF, THR LEVER (AFFECTED ENGINE) ADVANCE, IF UNSUCCESSFUL: X BLEED
 *   OPEN, ENG BLEED (AFFECTED) OFF, ASSOCIATED PACK (IF OPPOSITE PACK ON) OFF.
 * - Opposite bleed not available, l.70364-70372: A/THR OFF, THR LEVER (AFFECTED ENGINE) ADVANCE, IF UNSUCCESSFUL: WING
 *   ANTI ICE OFF, AVOID ICING CONDITIONS.
 * The THR LEVER line cannot be seen done and stays; the other lines of actions done go.
 */
export function engineBleedLoTempLines(inputs: BleedInputs, engine: EngineIndex): number[] {
  const e = inputs.engines[engine];
  const lines = [0];
  if (inputs.autoThrustEngaged) {
    lines.push(1);
  }
  lines.push(2, 3);
  if (isOppositeBleedAvailable(inputs, engine)) {
    if (inputs.crossBleedSelector !== CrossBleedSelector.Open) {
      lines.push(4);
    }
    if (e.bleedPbAuto) {
      lines.push(5);
    }
    if (e.packOn && inputs.engines[opposite(engine)].packOn) {
      lines.push(6);
    }
  } else {
    if (inputs.wingAntiIceOn) {
      lines.push(7);
    }
    lines.push(8);
  }
  return lines;
}

/**
 * ENG 1+2 BLEED LO TEMP, l.70432-70440: 0 title, 1 -A/THR OFF, 2 -THR LEVERS ADVANCE, 3 .IF UNSUCCESSFUL:, 4 -WING ANTI
 * ICE OFF, 5 AVOID ICING CONDITIONS.
 */
export function engine1And2BleedLoTempLines(inputs: BleedInputs): number[] {
  return [0, ...(inputs.autoThrustEngaged ? [1] : []), 2, 3, ...(inputs.wingAntiIceOn ? [4] : []), 5];
}

/**
 * ENG 1(2) BLEED HI TEMP, l.70480-70490: 0 title, 1 -PACK 2(1) OFF, 2 -PACK 1(2) OR WAI OFF, 3 -PACK 2(1) OR WAI OFF.
 * "If wing anti-ice off: PACK 2 (1) OFF"; "If wing anti-ice on and opposite pack off: PACK 1 (2) OR WAI OFF"; "If wing
 * anti-ice on and affected pack off: PACK 2 (1) OR WAI OFF". The FCOM names the opposite pack for an ENG 1 alert with the
 * wing anti-ice off; it is kept as written. The lines of actions done go.
 */
export function engineBleedHiTempLines(inputs: BleedInputs, engine: EngineIndex): number[] {
  const affectedPackOn = inputs.engines[engine].packOn;
  const oppositePackOn = inputs.engines[opposite(engine)].packOn;
  const lines = [0];
  if (!inputs.wingAntiIceOn && oppositePackOn) {
    lines.push(1);
  }
  if (inputs.wingAntiIceOn && !oppositePackOn && affectedPackOn) {
    lines.push(2);
  }
  if (inputs.wingAntiIceOn && !affectedPackOn && oppositePackOn) {
    lines.push(3);
  }
  return lines;
}

/** ENG 1(2) BLEED NOT CLSD, l.70550: 0 title, 1 -ENG n BLEED OFF (goes when the pb is OFF) */
export function engineBleedNotClosedLines(inputs: BleedInputs, engine: EngineIndex): number[] {
  return [0, ...(inputs.engines[engine].bleedPbAuto ? [1] : [])];
}

/**
 * X BLEED FAULT: the manual opening does not work (selector OPEN, valve not open) and only one engine bleed supplies air,
 * the condition of the WING ANTI ICE lines and STATUS (l.71035, l.71057-71058).
 */
export function isCrossBleedManualOpeningLostWithOneBleed(inputs: BleedInputs): boolean {
  const manualOpeningInoperative = inputs.crossBleedSelector === CrossBleedSelector.Open && !inputs.crossBleedFullyOpen;
  const availableBleeds = inputs.engines.filter((e) => isEngineBleedAvailable(e)).length;
  return manualOpeningInoperative && availableBleeds === 1;
}

/**
 * X BLEED FAULT, l.71030-71038: 0 title, 1 -X BLEED MAN CTL (goes once the selector is out of AUTO), 2 -WING ANTI ICE
 * OFF, 3 AVOID ICING CONDITIONS ("If manual opening inoperative, and only one bleed available").
 */
export function crossBleedFaultLines(inputs: BleedInputs): number[] {
  const lines = [0];
  if (inputs.crossBleedSelector === CrossBleedSelector.Auto) {
    lines.push(1);
  }
  if (isCrossBleedManualOpeningLostWithOneBleed(inputs)) {
    if (inputs.wingAntiIceOn) {
      lines.push(2);
    }
    lines.push(3);
  }
  return lines;
}

/* STATUS (StatusMessages codes) */

/** The STATUS codes the bleed alerts use (StatusMessages) */
export const BleedStatusCodes = {
  avoidIcing: '700400001',
  ifSevereIceAccretion: '700500001',
  minSpeed: '700400002',
  maneuverWithCare: '700400003',
  ldgDistProc: '700400004',
  onePackOnlyIfWaiOn: '700200001',
  crossBleedManCtl: '360200001',
  wingAntiIce: '300300001',
  eng1Bleed: '360300001',
  eng2Bleed: '360300002',
  apuBleed: '360300003',
  crossBleed: '360300004',
  pack1: '210300001',
  pack2: '210300002',
  pack1And2: '210300003',
} as const;

const S = BleedStatusCodes;

/** AVOID ICING CONDITIONS; IF SEVERE ICE ACCRETION: MIN SPD VLS +10 / G DOT, MANEUVER WITH CARE, LDG DIST PROC APPLY */
const ICING_LIMITATIONS = [S.avoidIcing, S.ifSevereIceAccretion, S.minSpeed, S.maneuverWithCare, S.ldgDistProc];

const engineBleedCode = (engine: EngineIndex) => (engine === 0 ? S.eng1Bleed : S.eng2Bleed);
const packCode = (engine: EngineIndex) => (engine === 0 ? S.pack1 : S.pack2);

/** ENG 1(2) BLEED FAULT, l.69850-69855: ONE PACK ONLY IF WAI ON; INOP SYS ENG 1(2) BLEED, PACK 1(2) (If closed) */
export function engineBleedFaultStatus(inputs: BleedInputs, engine: EngineIndex): StatusLines {
  return {
    left: [S.onePackOnlyIfWaiOn],
    inopSys: [engineBleedCode(engine), ...(inputs.engines[engine].packOn ? [] : [packCode(engine)])],
  };
}

/**
 * ENG 1+2 BLEED FAULT, l.70067-70075, and its LEAK subtitles (l.70140-70146, l.70203-70209, l.70271-70277): the icing
 * limitations; INOP SYS WING A. ICE, ENG 1 BLEED, ENG 2 BLEED, APU BLEED, PACK 1+2
 */
export function engine1And2BleedFaultStatus(): StatusLines {
  return { left: [...ICING_LIMITATIONS], inopSys: [S.wingAntiIce, S.eng1Bleed, S.eng2Bleed, S.apuBleed, S.pack1And2] };
}

/**
 * ENG 1(2) BLEED LO TEMP: opposite bleed available, l.70329-70334: INOP SYS ENG 1(2) BLEED, PACK 1(2) (If selected OFF);
 * opposite bleed not available, l.70393-70399: the icing limitations, INOP SYS WING A. ICE.
 */
export function engineBleedLoTempStatus(inputs: BleedInputs, engine: EngineIndex): StatusLines {
  if (isOppositeBleedAvailable(inputs, engine)) {
    return {
      left: [],
      inopSys: [engineBleedCode(engine), ...(inputs.engines[engine].packOn ? [] : [packCode(engine)])],
    };
  }
  return { left: [...ICING_LIMITATIONS], inopSys: [S.wingAntiIce] };
}

/** ENG 1+2 BLEED LO TEMP (l.70444-70452) and ENG 1(2) BLEED HI TEMP (l.70509-70520): the icing limitations, INOP SYS WING A. ICE */
export function icingLimitationStatus(): StatusLines {
  return { left: [...ICING_LIMITATIONS], inopSys: [S.wingAntiIce] };
}

/**
 * ENG 1(2) BLEED FAULT / BLEED NOT CLOSED, l.69995-70003: the icing limitations; INOP SYS ENG 1(2) BLEED, PACK 1(2),
 * WING A. ICE
 */
export function engineBleedFaultNotClosedStatus(engine: EngineIndex): StatusLines {
  return { left: [...ICING_LIMITATIONS], inopSys: [engineBleedCode(engine), packCode(engine), S.wingAntiIce] };
}

/** ENG 1(2) BLEED NOT CLSD, l.70559-70563: ONE PACK ONLY IF WAI ON; INOP SYS ENG 1(2) BLEED */
export function engineBleedNotClosedStatus(engine: EngineIndex): StatusLines {
  return { left: [S.onePackOnlyIfWaiOn], inopSys: [engineBleedCode(engine)] };
}

/** APU BLEED FAULT, l.69534: INOP SYS APU BLEED (If valve closed) */
export function apuBleedFaultStatus(inputs: BleedInputs): StatusLines {
  return { left: [], inopSys: inputs.apuBleedValveOpen ? [] : [S.apuBleed] };
}

/**
 * X BLEED FAULT, l.71056-71070 (PDF page 4391): "If manual opening inoperative, and only one bleed available": the icing
 * limitations and INOP SYS WING A.ICE; then X BLEED MAN CTL and INOP SYS X BLEED.
 */
export function crossBleedFaultStatus(inputs: BleedInputs): StatusLines {
  const icing = isCrossBleedManualOpeningLostWithOneBleed(inputs);
  return {
    left: [...(icing ? ICING_LIMITATIONS : []), S.crossBleedManCtl],
    inopSys: [...(icing ? [S.wingAntiIce] : []), S.crossBleed],
  };
}

/* The FWC alert items */

/** An E/WD alert of the bleed system, in the form of the PseudoFWC ewdMessageFailures items */
export interface BleedEwdAlert {
  flightPhaseInhib: number[];
  simVarIsActive: Subscribable<boolean>;
  whichCodeToReturn: () => (number | null)[];
  codesToReturn: string[];
  memoInhibit: () => boolean;
  failure: number;
  sysPage: EcamSysPage;
  side: 'LEFT';
  inopSys: () => string[];
  statusInfo: () => string[];
}

/** The E/WD codes of an alert: its 7-digit key followed by the line number, 01 for the title */
export function bleedAlertCodes(key: string, lineCount: number): string[] {
  return Array.from({ length: lineCount }, (_, i) => `${key}${(i + 1).toString().padStart(2, '0')}`);
}

/** The alert keys (ATA 36), in the order of the EwdMessages codes */
export const BleedAlertKeys = {
  eng1BleedFault: '3611001',
  eng2BleedFault: '3611002',
  eng1And2BleedFault: '3611003',
  eng1BleedLoTemp: '3611004',
  eng2BleedLoTemp: '3611005',
  eng1And2BleedLoTemp: '3611006',
  eng1BleedHiTemp: '3611007',
  eng2BleedHiTemp: '3611008',
  eng1BleedNotClosed: '3611009',
  eng2BleedNotClosed: '3611010',
  bleed1Off: '3611011',
  bleed2Off: '3611012',
  apuBleedFault: '3611013',
  crossBleedFault: '3611014',
  eng1BleedFaultNotClosed: '3611015',
  eng2BleedFaultNotClosed: '3611016',
  eng1And2BleedFaultLeftLeak: '3611017',
  eng1And2BleedFaultRightLeak: '3611018',
  eng1And2BleedFaultLeftAndRightLeak: '3611019',
} as const;

/** The number of E/WD lines (title included) of each alert */
export const BleedAlertLineCounts: Record<string, number> = {
  [BleedAlertKeys.eng1BleedFault]: 5,
  [BleedAlertKeys.eng2BleedFault]: 5,
  [BleedAlertKeys.eng1And2BleedFault]: 12,
  [BleedAlertKeys.eng1BleedLoTemp]: 9,
  [BleedAlertKeys.eng2BleedLoTemp]: 9,
  [BleedAlertKeys.eng1And2BleedLoTemp]: 6,
  [BleedAlertKeys.eng1BleedHiTemp]: 4,
  [BleedAlertKeys.eng2BleedHiTemp]: 4,
  [BleedAlertKeys.eng1BleedNotClosed]: 2,
  [BleedAlertKeys.eng2BleedNotClosed]: 2,
  [BleedAlertKeys.bleed1Off]: 1,
  [BleedAlertKeys.bleed2Off]: 1,
  [BleedAlertKeys.apuBleedFault]: 1,
  [BleedAlertKeys.crossBleedFault]: 4,
  [BleedAlertKeys.eng1BleedFaultNotClosed]: 9,
  [BleedAlertKeys.eng2BleedFaultNotClosed]: 9,
  [BleedAlertKeys.eng1And2BleedFaultLeftLeak]: 12,
  [BleedAlertKeys.eng1And2BleedFaultRightLeak]: 12,
  [BleedAlertKeys.eng1And2BleedFaultLeftAndRightLeak]: 10,
};

/** A confirmation timer: true once the condition has held for the time, false as soon as it goes */
export class ConfirmTimer {
  private heldSeconds = 0;

  constructor(private readonly confirmSeconds: number) {}

  update(condition: boolean, deltaSeconds: number): boolean {
    this.heldSeconds = condition ? this.heldSeconds + deltaSeconds : 0;
    return condition && this.heldSeconds >= this.confirmSeconds;
  }
}

const ENGINE_OFF_INPUTS: EngineBleedInputs = {
  engineRunning: false,
  engineStopped: true,
  bleedPbAuto: true,
  overheat: false,
  overpressure: false,
  lowTemperature: false,
  bleedTemperatureCelsius: -100,
  bleedValveOpen: false,
  starterValveOpen: false,
  firePbPushed: false,
  packOn: true,
  wingOrPylonLeak: false,
};

/** The inputs of a cold and dark aircraft, before the first update */
export const NO_BLEED_INPUTS: BleedInputs = {
  engines: [ENGINE_OFF_INPUTS, ENGINE_OFF_INPUTS],
  wingAntiIceOn: false,
  packFlowLo: false,
  crossBleedSelector: CrossBleedSelector.Auto,
  crossBleedFullyOpen: false,
  crossBleedFullyClosed: true,
  apuAvailable: false,
  apuMasterSwitchOn: false,
  apuSpeedPercent: 0,
  apuBleedPbOn: false,
  apuBleedValveOpen: false,
  autoThrustEngaged: false,
};

/**
 * The bleed alerts of the FWC: the confirmation timers and memories, one Subject per alert, and the alert items the
 * PseudoFWC adds to its ewdMessageFailures. All are amber cautions (level 2) that call the BLEED page.
 */
export class BleedAlerts {
  private inputs: BleedInputs = NO_BLEED_INPUTS;

  private readonly apuBleedFaultTimer = new ConfirmTimer(APU_BLEED_FAULT_CONFIRM_SECONDS);

  private readonly crossBleedFaultTimer = new ConfirmTimer(X_BLEED_FAULT_CONFIRM_SECONDS);

  private readonly notClosedTimers = [
    new ConfirmTimer(BLEED_NOT_CLOSED_CONFIRM_SECONDS),
    new ConfirmTimer(BLEED_NOT_CLOSED_CONFIRM_SECONDS),
  ];

  /**
   * BLEED FAULT with the bleed valve still open. Design choice: the same 10 s as NOT CLSD and as the "bleed valve not
   * closed" monitor of the BMC (BLEED_VALVE_NOT_CLOSED_CONFIRMATION, pneumatic.rs), for the valve to close first.
   */
  private readonly faultNotClosedTimers = [
    new ConfirmTimer(BLEED_NOT_CLOSED_CONFIRM_SECONDS),
    new ConfirmTimer(BLEED_NOT_CLOSED_CONFIRM_SECONDS),
  ];

  private readonly bleedOffInhibited: [boolean, boolean] = [false, false];

  /** One Subject per alert key: the alert is triggered (ES2017 only, the Coherent runtime has no Object.fromEntries) */
  private readonly active = Object.values(BleedAlertKeys).reduce(
    (subjects, key) => {
      subjects[key] = Subject.create(false);
      return subjects;
    },
    {} as Record<string, Subject<boolean>>,
  );

  /** The current alerts, for the specs and the procedure lines */
  public states: BleedAlertStates = bleedAlertStates(NO_BLEED_INPUTS, {
    apuBleedValveDisagree: false,
    crossBleedValveDisagree: false,
    engineBleedValveNotClosed: [false, false],
    engineBleedFaultValveNotClosed: [false, false],
    bleedOffInhibited: [false, false],
  });

  /**
   * @param inputs the bleed inputs of this update
   * @param deltaSeconds the time since the last update, in seconds
   */
  update(inputs: BleedInputs, deltaSeconds: number): void {
    this.inputs = inputs;
    const notClosed: [boolean, boolean] = [
      this.notClosedTimers[0].update(isEngineBleedValveNotClosed(inputs, 0), deltaSeconds),
      this.notClosedTimers[1].update(isEngineBleedValveNotClosed(inputs, 1), deltaSeconds),
    ];
    for (const engine of [0, 1] as const) {
      this.bleedOffInhibited[engine] = bleedOffInhibitMemory(
        this.bleedOffInhibited[engine],
        inputs.engines[engine].bleedPbAuto,
        hasEngineBleedAlert(inputs, engine, notClosed[engine]),
      );
    }
    this.states = bleedAlertStates(inputs, {
      apuBleedValveDisagree: this.apuBleedFaultTimer.update(isApuBleedValveDisagree(inputs), deltaSeconds),
      crossBleedValveDisagree: this.crossBleedFaultTimer.update(isCrossBleedValveDisagree(inputs), deltaSeconds),
      engineBleedValveNotClosed: notClosed,
      engineBleedFaultValveNotClosed: [
        this.faultNotClosedTimers[0].update(isEngineBleedFaultValveNotClosed(inputs.engines[0]), deltaSeconds),
        this.faultNotClosedTimers[1].update(isEngineBleedFaultValveNotClosed(inputs.engines[1]), deltaSeconds),
      ],
      bleedOffInhibited: this.bleedOffInhibited,
    });

    const s = this.states;
    const K = BleedAlertKeys;
    this.active[K.eng1BleedFault].set(s.engineBleedFault[0]);
    this.active[K.eng2BleedFault].set(s.engineBleedFault[1]);
    this.active[K.eng1And2BleedFault].set(s.engine1And2BleedFault);
    this.active[K.eng1BleedLoTemp].set(s.engineBleedLoTemp[0]);
    this.active[K.eng2BleedLoTemp].set(s.engineBleedLoTemp[1]);
    this.active[K.eng1And2BleedLoTemp].set(s.engine1And2BleedLoTemp);
    this.active[K.eng1BleedHiTemp].set(s.engineBleedHiTemp[0]);
    this.active[K.eng2BleedHiTemp].set(s.engineBleedHiTemp[1]);
    this.active[K.eng1BleedNotClosed].set(s.engineBleedNotClosed[0]);
    this.active[K.eng2BleedNotClosed].set(s.engineBleedNotClosed[1]);
    this.active[K.bleed1Off].set(s.bleedOff[0]);
    this.active[K.bleed2Off].set(s.bleedOff[1]);
    this.active[K.apuBleedFault].set(s.apuBleedFault);
    this.active[K.crossBleedFault].set(s.crossBleedFault);
    this.active[K.eng1BleedFaultNotClosed].set(s.engineBleedFaultNotClosed[0]);
    this.active[K.eng2BleedFaultNotClosed].set(s.engineBleedFaultNotClosed[1]);
    this.active[K.eng1And2BleedFaultLeftLeak].set(s.engine1And2BleedFaultLeftLeak);
    this.active[K.eng1And2BleedFaultRightLeak].set(s.engine1And2BleedFaultRightLeak);
    this.active[K.eng1And2BleedFaultLeftAndRightLeak].set(s.engine1And2BleedFaultLeftAndRightLeak);
  }

  private item(
    key: string,
    flightPhaseInhib: number[],
    lines: () => number[],
    status: () => StatusLines,
  ): BleedEwdAlert {
    return {
      flightPhaseInhib,
      simVarIsActive: this.active[key],
      whichCodeToReturn: lines,
      codesToReturn: bleedAlertCodes(key, BleedAlertLineCounts[key]),
      memoInhibit: () => false,
      failure: 2,
      sysPage: EcamSysPage.BLEED,
      side: 'LEFT',
      inopSys: () => status().inopSys,
      statusInfo: () => status().left,
    };
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, BleedEwdAlert> = (() => {
    const K = BleedAlertKeys;
    const P = BleedPhaseInhibition;
    const none = (): StatusLines => ({ left: [], inopSys: [] });
    const items: Record<string, BleedEwdAlert> = {};
    const engineKeys = [
      {
        fault: K.eng1BleedFault,
        loTemp: K.eng1BleedLoTemp,
        hiTemp: K.eng1BleedHiTemp,
        notClosed: K.eng1BleedNotClosed,
        off: K.bleed1Off,
        faultNotClosed: K.eng1BleedFaultNotClosed,
      },
      {
        fault: K.eng2BleedFault,
        loTemp: K.eng2BleedLoTemp,
        hiTemp: K.eng2BleedHiTemp,
        notClosed: K.eng2BleedNotClosed,
        off: K.bleed2Off,
        faultNotClosed: K.eng2BleedFaultNotClosed,
      },
    ];
    for (const engine of [0, 1] as const) {
      const keys = engineKeys[engine];
      items[keys.fault] = this.item(
        keys.fault,
        P.bleedFault,
        () => engineBleedFaultLines(this.inputs, engine),
        () => engineBleedFaultStatus(this.inputs, engine),
      );
      items[keys.loTemp] = this.item(
        keys.loTemp,
        P.bleedLoTemp,
        () => engineBleedLoTempLines(this.inputs, engine),
        () => engineBleedLoTempStatus(this.inputs, engine),
      );
      items[keys.hiTemp] = this.item(
        keys.hiTemp,
        P.bleedHiTemp,
        () => engineBleedHiTempLines(this.inputs, engine),
        icingLimitationStatus,
      );
      items[keys.notClosed] = this.item(
        keys.notClosed,
        P.bleedNotClosed,
        () => engineBleedNotClosedLines(this.inputs, engine),
        () => engineBleedNotClosedStatus(engine),
      );
      items[keys.off] = this.item(keys.off, P.bleedOff, () => [0], none);
      // the phases of ENG 1(2) BLEED FAULT (FCOM PDF page 4336)
      items[keys.faultNotClosed] = this.item(
        keys.faultNotClosed,
        P.bleedFault,
        () => engineBleedFaultNotClosedLines(this.inputs, engine),
        () => engineBleedFaultNotClosedStatus(engine),
      );
    }
    // the phases of ENG 1+2 BLEED FAULT (FCOM PDF pages 4343, 4345, 4347)
    const leakItems: [string, DualBleedFaultLeak][] = [
      [K.eng1And2BleedFaultLeftLeak, 'left'],
      [K.eng1And2BleedFaultRightLeak, 'right'],
      [K.eng1And2BleedFaultLeftAndRightLeak, 'leftAndRight'],
    ];
    for (const [key, leak] of leakItems) {
      items[key] = this.item(
        key,
        P.bleedFault,
        () => engine1And2BleedFaultLeakLines(this.inputs, leak, this.states.apuBleedFault),
        engine1And2BleedFaultStatus,
      );
    }
    items[K.eng1And2BleedFault] = this.item(
      K.eng1And2BleedFault,
      P.bleedFault,
      () => engine1And2BleedFaultLines(this.inputs, this.states.apuBleedFault),
      engine1And2BleedFaultStatus,
    );
    items[K.eng1And2BleedLoTemp] = this.item(
      K.eng1And2BleedLoTemp,
      P.bleedLoTemp,
      () => engine1And2BleedLoTempLines(this.inputs),
      icingLimitationStatus,
    );
    items[K.apuBleedFault] = this.item(
      K.apuBleedFault,
      P.apuBleedFault,
      () => [0],
      () => apuBleedFaultStatus(this.inputs),
    );
    items[K.crossBleedFault] = this.item(
      K.crossBleedFault,
      P.crossBleedFault,
      () => crossBleedFaultLines(this.inputs),
      () => crossBleedFaultStatus(this.inputs),
    );
    return items;
  })();
}

/* Acquisition (not unit tested: SimVar reads only) */

const readBool = (name: string): boolean => SimVar.GetSimVarValue(name, 'bool') > 0;

function readEngineBleedInputs(engineNumber: 1 | 2): EngineBleedInputs {
  // L:A32NX_ENGINE_STATE: 0 off, 1 on, 2 starting, 3 restarting, 4 shutting down
  const engineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${engineNumber}`, 'enum');
  return {
    engineRunning: engineState === 1,
    engineStopped: engineState === 0,
    bleedPbAuto: readBool(`L:A32NX_OVHD_PNEU_ENG_${engineNumber}_BLEED_PB_IS_AUTO`),
    overheat: readBool(`L:A32NX_PNEU_ENG_${engineNumber}_OVERHEAT`),
    overpressure: readBool(`L:A32NX_PNEU_ENG_${engineNumber}_OVERPRESSURE`),
    lowTemperature: readBool(`L:A32NX_PNEU_ENG_${engineNumber}_LOW_TEMPERATURE`),
    bleedTemperatureCelsius: SimVar.GetSimVarValue(
      `L:A32NX_PNEU_ENG_${engineNumber}_BLEED_TEMPERATURE_SENSOR_TEMPERATURE`,
      'number',
    ),
    bleedValveOpen: readBool(`L:A32NX_PNEU_ENG_${engineNumber}_PR_VALVE_OPEN`),
    starterValveOpen: readBool(`L:A32NX_PNEU_ENG_${engineNumber}_STARTER_VALVE_OPEN`),
    firePbPushed: readBool(`L:A32NX_FIRE_BUTTON_ENG${engineNumber}`),
    packOn: readBool(`L:A32NX_OVHD_COND_PACK_${engineNumber}_PB_IS_ON`),
    wingOrPylonLeak:
      readBool(`L:A32NX_PNEU_ENG_${engineNumber}_BLEED_LEAK`) ||
      readBool(engineNumber === 1 ? 'L:A32NX_PNEU_LEFT_WING_LEAK' : 'L:A32NX_PNEU_RIGHT_WING_LEAK'),
  };
}

/** Reads the bleed inputs from the simvars */
export function readBleedInputs(): BleedInputs {
  return {
    engines: [readEngineBleedInputs(1), readEngineBleedInputs(2)],
    wingAntiIceOn: readBool('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED'),
    // 0 LO, 1 NORM, 2 HI
    packFlowLo: SimVar.GetSimVarValue('L:A32NX_KNOB_OVHD_AIRCOND_PACKFLOW_Position', 'number') === 0,
    crossBleedSelector: SimVar.GetSimVarValue('L:A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position', 'number'),
    crossBleedFullyOpen: readBool('L:A32NX_PNEU_XBLEED_VALVE_FULLY_OPEN'),
    crossBleedFullyClosed: readBool('L:A32NX_PNEU_XBLEED_VALVE_FULLY_CLOSED'),
    apuAvailable: readBool('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE'),
    apuMasterSwitchOn: readBool('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON'),
    apuSpeedPercent: Arinc429Word.fromSimVarValue('L:A32NX_APU_N').valueOr(0),
    apuBleedPbOn: readBool('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON'),
    apuBleedValveOpen: readBool('L:A32NX_APU_BLEED_AIR_VALVE_OPEN'),
    // 0 disengaged, 1 armed, 2 active
    autoThrustEngaged: SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_STATUS', 'enum') !== 0,
  };
}
