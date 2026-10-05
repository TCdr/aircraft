// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ENG 1(2) FAIL and ENG 1(2) SHUT DOWN (A320 FCOM PRO-ABN-ENG, a320_fcom.txt l.79757-79881 and l.81056-81291; the
 * CFM56 FCOM 18 SEP 12 PRO-ABN-70 P 7-8/54, PDF pages 2147-2148, has the same procedure). Both are amber cautions: the
 * FCOM shows their title in amber, and their flight phase inhibition figures (2019 FCOM PDF pages 2262 and 2297) inhibit
 * no flight phase.
 */

/**
 * ENG 1(2) FAIL triggers "when the engine core speed is below idle" (l.79767). The FADEC computes the idle N2 of the
 * current conditions (L:A32NX_ENGINE_IDLE_N2). Design choice: the core is below idle 3 % N2 under that idle, so that a
 * running engine at idle never triggers the alert; a flamed out engine runs down to its windmilling N2 within seconds.
 */
export const ENGINE_CORE_BELOW_IDLE_MARGIN_PERCENT = 3;

/** l.79849-79851: "IF NO ENG RELIGHT AFTER 30 S: ... The 30 s countdown starts as soon as the ENG 1(2) FAIL alert is triggered." */
export const ENG_FAIL_RELIGHT_WAIT_SECONDS = 30;

export function isEngineCoreBelowIdle(n2Percent: number, idleN2Percent: number): boolean {
  return n2Percent < idleN2Percent - ENGINE_CORE_BELOW_IDLE_MARGIN_PERCENT;
}

export interface EngineFailInputs {
  masterOn: boolean;
  firePbPushed: boolean;
  /** The FADEC reports the engine running (ENGINE_STATE On) */
  engineRunning: boolean;
  n2Percent: number;
  idleN2Percent: number;
}

/**
 * ENG 1(2) FAIL, l.79767: "This alert triggers when the engine core speed is below idle, with the ENG MASTER lever set to
 * ON, and ENG FIRE pb not pushed." The alert is armed once the engine has run at idle or above (as the A380X FWS does), so
 * that an engine start, below idle with its master ON, does not trigger it. The ENG MASTER OFF disarms it: the ENG SHUT
 * DOWN alert takes over, and the MASTER ON of a relight attempt does not bring the FAIL back.
 */
export class EngineFailMonitor {
  private armed = false;

  private active = false;

  private activeForSeconds = 0;

  update(inputs: EngineFailInputs, deltaTimeSeconds: number): void {
    const coreBelowIdle = isEngineCoreBelowIdle(inputs.n2Percent, inputs.idleN2Percent);
    if (!inputs.masterOn) {
      this.armed = false;
    } else if (inputs.engineRunning && !coreBelowIdle) {
      this.armed = true;
    }

    const active = this.armed && inputs.masterOn && !inputs.firePbPushed && coreBelowIdle;
    this.activeForSeconds = active && this.active ? this.activeForSeconds + deltaTimeSeconds : 0;
    this.active = active;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** The 30 s of the relight attempt after the trigger of the alert have elapsed */
  get relightWaitElapsed(): boolean {
    return this.active && this.activeForSeconds >= ENG_FAIL_RELIGHT_WAIT_SECONDS;
  }
}

/**
 * ENG 1(2) SHUT DOWN, l.81066-81067: "This alert triggers when ENG master is at off in phases 3 to 8, or ENG FIRE pb is
 * pushed in phases 1, 2, 9 and 10."
 */
export function isEngineShutDown(masterOn: boolean, firePbPushed: boolean, flightPhase: number): boolean {
  const masterOffPhase = flightPhase >= 3 && flightPhase <= 8;
  const firePbPhase = flightPhase === 1 || flightPhase === 2 || flightPhase === 9 || flightPhase === 10;
  return (!masterOn && masterOffPhase) || (firePbPushed && firePbPhase);
}

/**
 * The lines of ENG 1(2) FAIL, by index in its codes (EwdMessages 7700101/7700102):
 * 0 title, 1 -ENG MODE SEL IGN, 2 -THR LEVER n IDLE, 3 .IF NO RELIGHT AFT 30S:, 4 -ENG MASTER n OFF, 5 .IF DAMAGE:,
 * 6 -ENG n FIRE P/B PUSH, 7 -AGENT1 AFTER 10S DISCH, 8 -AGENT 1 DISCH, 9 .IF NO DAMAGE:, 10 -ENG n RELIGHT CONSIDER.
 */
export interface EngineFailLineInputs {
  flightPhase: number;
  engModeSelIgn: boolean;
  thrLeverIdle: boolean;
  relightWaitElapsed: boolean;
}

/**
 * The "Before takeoff or after landing" procedure of ENG 1(2) FAIL applies in the FWC flight phases 1-3 (before the 80 kt
 * of the takeoff roll) and 8-10 (from touchdown); the "In flight" procedure in phases 4-7. Design choice: the FCOM does
 * not give the phases; from 80 kt the takeoff continues after an engine failure at V1.
 */
export function isEngineFailGroundProcedure(flightPhase: number): boolean {
  return flightPhase <= 3 || flightPhase >= 8;
}

/**
 * l.79797-79881. Before takeoff or after landing (see isEngineFailGroundProcedure): THR LEVER IDLE, ENG MASTER OFF, IF DAMAGE: FIRE P/B PUSH,
 * AGENT 1 DISCH, IF NO DAMAGE: RELIGHT CONSIDER. In flight: ENG MODE SEL IGN, THR LEVER IDLE, then "IF NO ENG RELIGHT
 * AFTER 30 S": ENG MASTER OFF, IF DAMAGE: FIRE P/B PUSH, AGENT 1 (AFTER 10 SECONDS IN FLIGHT) DISCH, IF NO DAMAGE:
 * RELIGHT CONSIDER. LAND ASAP is the separate LAND ASAP memo.
 * Design choice: in flight the lines that follow the 30 s condition appear once the 30 s have elapsed, so the condition
 * line ends the procedure during the relight attempt. The lines of actions done (selector at IGN, lever at idle) go.
 */
export function engineFailLines(inputs: EngineFailLineInputs): number[] {
  const thrLeverLine = inputs.thrLeverIdle ? [] : [2];
  if (isEngineFailGroundProcedure(inputs.flightPhase)) {
    return [0, ...thrLeverLine, 4, 5, 6, 8, 9, 10];
  }
  const afterWait = inputs.relightWaitElapsed ? [4, 5, 6, 7, 9, 10] : [];
  return [0, ...(inputs.engModeSelIgn ? [] : [1]), ...thrLeverLine, 3, ...afterWait];
}

/** The X BLEED selector positions (L:A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position) */
export enum CrossBleedSelector {
  Shut = 0,
  Auto = 1,
  Open = 2,
}

/**
 * The lines of ENG 1(2) SHUT DOWN, by index in its codes (EwdMessages 7700111/7700112):
 * 0 title, 1 -PACK 1 OFF, 2 -PACK 2 OFF, 3 -X BLEED OPEN, 4 -ENG MODE SEL IGN, 5 .IF NO FUEL LEAK:, 6 -IMBALANCE MONITOR,
 * 7 -TCAS MODE SEL TA, 8 -X BLEED SHUT, 9 -WING ANTI ICE OFF, 10 AVOID ICING CONDITIONS.
 */
export interface EngineShutDownLineInputs {
  engineNumber: 1 | 2;
  wingAntiIceOn: boolean;
  elecEmerConfig: boolean;
  firePbPushed: boolean;
  pack1On: boolean;
  pack2On: boolean;
  crossBleedSelector: CrossBleedSelector;
  engModeSelIgn: boolean;
  tcasModeTa: boolean;
}

/**
 * l.81087-81123: (wing anti-ice ON) in Elec Emer config PACK 1 OFF, otherwise PACK (AFFECTED SIDE) OFF, and if the ENG
 * FIRE pb is not pushed X BLEED OPEN; ENG MODE SEL IGN; IF NO FUEL LEAK: IMBALANCE MONITOR; TCAS MODE SEL TA; (ENG FIRE pb
 * pushed) X BLEED SHUT, WING ANTI ICE OFF, AVOID ICING CONDITIONS. The lowercase conditions are computed (not shown), the
 * uppercase one is shown. The "If REV unlocked" lines are not modelled (no reverser failure). The lines of actions done go.
 */
export function engineShutDownLines(inputs: EngineShutDownLineInputs): number[] {
  const lines = [0];
  if (inputs.wingAntiIceOn) {
    const packToSwitchOff = inputs.elecEmerConfig ? 1 : inputs.engineNumber;
    const packOn = packToSwitchOff === 1 ? inputs.pack1On : inputs.pack2On;
    if (packOn) {
      lines.push(packToSwitchOff === 1 ? 1 : 2);
    }
    if (!inputs.firePbPushed && inputs.crossBleedSelector !== CrossBleedSelector.Open) {
      lines.push(3);
    }
  }
  if (!inputs.engModeSelIgn) {
    lines.push(4);
  }
  lines.push(5, 6);
  if (!inputs.tcasModeTa) {
    lines.push(7);
  }
  if (inputs.firePbPushed) {
    if (inputs.crossBleedSelector !== CrossBleedSelector.Shut) {
      lines.push(8);
    }
    if (inputs.wingAntiIceOn) {
      lines.push(9);
    }
    lines.push(10);
  }
  return lines;
}

/** The STATUS page codes of ENG 1(2) SHUT DOWN (StatusMessages) */
export interface EngineShutDownStatus {
  left: string[];
  inopSys: string[];
}

/**
 * The STATUS of ENG 1(2) SHUT DOWN, l.81168-81264 (2019 FCOM PDF pages 2300-2301):
 * - If the ENG FIRE pb is pushed: AVOID ICING CONDITIONS; IF SEVERE ICE ACCRETION: MIN SPD VLS + 10/G DOT, MANEUVER WITH
 *   CARE, LDG DIST PROC APPLY.
 * - If the wing anti-ice is off and the ENG FIRE pb is not pushed: IF PERF PERMITS: X BLEED OPEN.
 * - IF NO ENG 1(2) DAMAGE: CONSIDER ENG 1(2) RELIGHT; CAT 3 SINGLE ONLY; ONE PACK ONLY IF WAI ON.
 * - INOP SYS: CAT 3 DUAL, ENG 1(2) BLEED, PACK 1(2), MAIN GALLEY, GEN 1(2), G ENG 1 PUMP or Y ENG 2 PUMP, WING A. ICE (if
 *   the ENG FIRE pb is pushed).
 * Not modelled: the "If REV unlocked" lines (no reverser failure), the A321 lines, and AFT CRG HEAT and STEEP APPR, which
 * the FCOM marks as options.
 */
export function engineShutDownStatus(
  engineNumber: 1 | 2,
  firePbPushed: boolean,
  wingAntiIceOn: boolean,
): EngineShutDownStatus {
  const left: string[] = [];
  if (firePbPushed) {
    left.push('700400001', '700500001', '700400002', '700400003', '700400004');
  } else if (!wingAntiIceOn) {
    left.push('700500002', '700400005');
  }
  left.push(engineNumber === 1 ? '700500003' : '700500004', engineNumber === 1 ? '700400006' : '700400007');
  left.push('220200001', '700200001');

  const inopSys = [
    '220300001',
    engineNumber === 1 ? '360300001' : '360300002',
    engineNumber === 1 ? '210300001' : '210300002',
    '240300001',
    engineNumber === 1 ? '240300002' : '240300003',
    engineNumber === 1 ? '290300001' : '290300002',
  ];
  if (firePbPushed) {
    inopSys.push('300300001');
  }
  return { left, inopSys };
}
