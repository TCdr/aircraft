// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The FADEC, thrust lever and thrust reverser alerts: ENG 1(2) FADEC A(B) FAULT, FADEC FAULT, FADEC HI TEMP, THR LEVER
 * FAULT, THR LEVER DISAGREE, REVERSE UNLOCKED, REVERSER FAULT and REV PRESSURIZED. All are amber cautions. Their
 * triggers come from systems.wasm (a320_systems engine_control_failure.rs and the hydraulic
 * reversers), which writes the FADEC status:
 * - L:A32NX_ENGINE_n_FADEC_CHANNEL_A_FAULT / _B_FAULT / _FADEC_FAULT / _FADEC_HI_TEMP
 * - L:A32NX_ENGINE_n_THR_LEVER_FAULT / _THR_LEVER_DISAGREE / _THR_LEVER_RATING (ThrustLeverRating)
 * - L:A32NX_REVERSER_n_UNLOCKED / _FAULT / _PRESSURIZED, L:A32NX_ENGINE_n_FADEC_AUTO_IDLE
 *
 * Flight phase inhibitions:
 * FADEC A(B) FAULT 3, 4, 5, 7, 8; FADEC FAULT 4, 5, 7, 8; FADEC HI TEMP 3, 4, 5, 7, 8; REV PRESSURIZED 4, 5, 8;
 * REVERSE UNLOCKED 4(a), 5(a), 8; REVERSER FAULT 3(a), 4(a), 5(a); THR LEVER DISAGREE and THR LEVER FAULT 4(a), 5(a).
 * (a): not inhibited when the FADEC automatically sets the engine thrust to idle.
 */

/** The engine rating the FADEC selects with a failed thrust lever (a320_systems ThrustLeverRating) */
export enum ThrustLeverRating {
  Normal = 0,
  Idle = 1,
  TakeOff = 2,
  Climb = 3,
}

/** The phases 4 (80 kt to lift off) and 5 (lift off to 1500 ft) */
function isTakeoffPhase(flightPhase: number): boolean {
  return flightPhase === 4 || flightPhase === 5;
}

/**
 * Whether an alert with the "(a)" flight phase inhibition is shown: inhibited in its phases unless the FADEC
 * automatically sets the engine at idle.
 */
function isShownWithIdleException(
  active: boolean,
  flightPhase: number,
  inhibitedPhases: readonly number[],
  fadecAutoIdle: boolean,
): boolean {
  return active && (!inhibitedPhases.includes(flightPhase) || fadecAutoIdle);
}

/** REVERSE UNLOCKED, THR LEVER FAULT and THR LEVER DISAGREE: inhibited in phases 4 and 5 unless the FADEC selects idle */
export function isShownInTakeoffUnlessAutoIdle(active: boolean, flightPhase: number, fadecAutoIdle: boolean): boolean {
  return active && (!isTakeoffPhase(flightPhase) || fadecAutoIdle);
}

/** REVERSER FAULT: inhibited in phases 3, 4 and 5 unless the FADEC selects idle */
export function isReverserFaultShown(active: boolean, flightPhase: number, fadecAutoIdle: boolean): boolean {
  return isShownWithIdleException(active, flightPhase, [3, 4, 5], fadecAutoIdle);
}

/** The ground lines of the procedures apply in the FWC flight phases 1-3 and 8-10 (as ENG 1(2) FAIL, design choice) */
function isGroundProcedure(flightPhase: number): boolean {
  return flightPhase <= 3 || flightPhase >= 8;
}

/**
 * ENG 1(2) FADEC FAULT, by index in its codes:
 * 0 title, 1 THR LVR n NOT ABOVE IDLE, 2 -THR LEVER n IDLE, 3 -ENG n PARAMETERS CHECK, 4 .IF ABN ENG OPERATION:,
 * 5 -ENG MASTER n OFF.
 * On ground: THR LVR (AFFECTED) NOT ABOVE IDLE, ENG PARAMETERS CHECK, IF ABN ENG OPERATION: ENG MASTER OFF. In flight:
 * THR LEVER IDLE, ENG PARAMETERS CHECK, IF ABN ENG OPERATION: ENG MASTER OFF. The lever line goes once at idle.
 */
export function fadecFaultLines(flightPhase: number, thrLeverIdle: boolean): number[] {
  if (isGroundProcedure(flightPhase)) {
    return [0, 1, 3, 4, 5];
  }
  return [0, ...(thrLeverIdle ? [] : [2]), 3, 4, 5];
}

/** STATUS of ENG 1(2) FADEC FAULT: on the ground, THR LVR 1(2) NOT ABOVE IDLE */
export function fadecFaultStatus(engineNumber: 1 | 2, onGround: boolean): string[] {
  return onGround ? [engineNumber === 1 ? '700400050' : '700400051'] : [];
}

/**
 * ENG 1(2) FADEC HI TEMP, by index in its codes:
 * 0 title, 1 FADEC OVHT, 2 -THR LEVER n IDLE, 3 -ENG MASTER n OFF, 4 -ENG MODE SEL NORM, 5 -FADEC GND PWR CHECK OFF,
 * 6 -ENG n PARAMETERS CHECK, 7 .IF ABN ENG OPERATION:.
 * FADEC OVHT shows when the ECU temperature is above 105 C. Design choice: the flyPad overheat failure is an ECU
 * temperature above 105 C, so FADEC OVHT is always shown. On the ground: THR LEVER IDLE, ENG MASTER OFF, ENG MODE SEL
 * NORM, FADEC GND PWR CHECK OFF. In flight: ENG PARAMETERS CHECK, IF ABN ENG OPERATION: THR LEVER IDLE, ENG MASTER OFF.
 */
export function fadecHiTempLines(flightPhase: number, thrLeverIdle: boolean, engModeSelNorm: boolean): number[] {
  const thrLeverLine = thrLeverIdle ? [] : [2];
  if (isGroundProcedure(flightPhase)) {
    return [0, 1, ...thrLeverLine, 3, ...(engModeSelNorm ? [] : [4]), 5];
  }
  return [0, 1, 6, 7, ...thrLeverLine, 3];
}

export interface ThrustLeverLineInputs {
  flightPhase: number;
  rating: ThrustLeverRating;
  thrLeverIdle: boolean;
  athrEngaged: boolean;
}

/**
 * ENG 1(2) THR LEVER FAULT, by index in its codes:
 * 0 title, 1 ENG n AT IDLE, 2 -THR LEVER n IDLE, 3 -A/THR KEEP ON, 4 ENG n HI PWR IN MAN THR, 5 .BEFORE SLATS IN:,
 * 6 -A/THR ON, 7 HI PWR ONLY, 8 ENG n IDLE POWER ONLY.
 * - On the ground: ENG (AFFECTED) IDLE POWER ONLY (the FADEC selects idle power automatically), THR LEVER IDLE.
 * - In flight, FADEC at idle (approach with slats extended): ENG AT IDLE, THR LEVER IDLE.
 * - In flight at CLB or TO/FLX: A/THR engaged: A/THR KEEP ON; A/THR not engaged: ENG HI PWR IN MAN THR (inhibited
 *   when the FADEC commands the affected engine at idle); lever angle frozen in TO or FLX: BEFORE SLATS IN: A/THR ON,
 *   HI PWR ONLY.
 * LAND ASAP is the separate LAND ASAP memo.
 */
export function thrustLeverFaultLines(inputs: ThrustLeverLineInputs): number[] {
  const thrLeverLine = inputs.thrLeverIdle ? [] : [2];
  if (isGroundProcedure(inputs.flightPhase)) {
    return [0, 8, ...thrLeverLine];
  }
  if (inputs.rating === ThrustLeverRating.Idle) {
    return [0, 1, ...thrLeverLine];
  }
  if (inputs.athrEngaged) {
    return [0, 3];
  }
  return [0, 4, ...(inputs.rating === ThrustLeverRating.TakeOff ? [5, 6, 7] : [])];
}

/**
 * ENG 1(2) THR LEVER DISAGREE, by index in its codes:
 * 0 title, 1 ENG n IDLE POWER ONLY, 2 -THR LEVER n IDLE, 3 ENG n TO, FLX OR DRT TO, 4 AVAIL MAX POWER: CLB,
 * 5 -A/THR KEEP ON, 6 -A/THR ON, 7 ENG n AT IDLE.
 * - On ground: ENG IDLE POWER ONLY, THR LEVER IDLE. During takeoff: ENG TO, FLX, OR DRT TO.
 * - In cruise (slats retracted): AVAIL MAX POWER: CLB, A/THR KEEP ON (engaged) or A/THR ON (not engaged).
 * - In approach (slats extended): ENG AT IDLE, THR LEVER IDLE.
 */
export function thrustLeverDisagreeLines(inputs: ThrustLeverLineInputs): number[] {
  const thrLeverLine = inputs.thrLeverIdle ? [] : [2];
  switch (inputs.rating) {
    case ThrustLeverRating.TakeOff:
      return [0, 3];
    case ThrustLeverRating.Climb:
      return [0, 4, inputs.athrEngaged ? 5 : 6];
    case ThrustLeverRating.Idle:
      return isGroundProcedure(inputs.flightPhase) ? [0, 1, ...thrLeverLine] : [0, 7, ...thrLeverLine];
    default:
      return [0];
  }
}

/** The STATUS of THR LEVER FAULT and THR LEVER DISAGREE (StatusMessages codes) */
export interface ThrustLeverStatus {
  left: string[];
  inopSys: string[];
}

/**
 * THR LEVER FAULT STATUS: WHEN SLATS OUT: ENG 1(2) AT IDLE (while the slats are not extended); INOP SYS
 * REVERSER 1(2), ENG 1(2) THR.
 * THR LEVER DISAGREE STATUS: WHEN SLATS OUT: ENG (AFFECTED) AT IDLE (TLA at or below MCT and slats not extended),
 * ENG (affected) AVAIL MAX PWR: CLB, ON GND ENG (affected) MAX PWR: IDLE; INOP SYS ENG 1(2) THR.
 * With the onside EIU failed, "WHEN MN < 0.47" replaces "WHEN SLATS OUT": the FADEC no longer receives the slats
 * position.
 * Design choice: "WHEN SLATS OUT" is shown while the FADEC has not yet selected idle.
 */
export function thrustLeverStatus(
  engineNumber: 1 | 2,
  leverLost: boolean,
  rating: ThrustLeverRating,
  onsideEiuFailed = false,
): ThrustLeverStatus {
  const engine1 = engineNumber === 1;
  const left: string[] = [];
  if (rating !== ThrustLeverRating.Idle) {
    left.push(onsideEiuFailed ? '700500090' : '700500050', engine1 ? '700400052' : '700400053');
  }
  if (!leverLost) {
    left.push(engine1 ? '700400054' : '700400055', engine1 ? '700400056' : '700400057');
  }
  const inopSys = leverLost ? [engine1 ? '780300001' : '780300002'] : [];
  inopSys.push(engine1 ? '730300001' : '730300002');
  return { left, inopSys };
}

/**
 * ENG 1(2) REVERSE UNLOCKED, by index in its codes:
 * 0 title, 1 ENG n AT IDLE, 2 -THR LEVER n IDLE, 3 -ENG MASTER n OFF, 4 -MAX SPEED 300/.78, 5 .IF BUFFET:,
 * 6 -MAX SPEED 240 KT.
 * On ground: ENG AT IDLE (only when the FADEC automatically sets the engine at idle), THR LEVER IDLE, ENG
 * MASTER OFF. In flight: ENG AT IDLE, THR LEVER IDLE, MAX SPEED 300/.78, IF BUFFET: MAX SPEED 240 KT, ENG MASTER OFF.
 * Not modelled: the RUD TRIM FULL, CONTROL HDG WITH ROLL lines for a reverser actually deployed (the doors stay in
 * the stowed position: no deployment). LAND ASAP is the separate LAND ASAP memo.
 */
export function reverseUnlockedLines(flightPhase: number, fadecAutoIdle: boolean, thrLeverIdle: boolean): number[] {
  const lines = [0, ...(fadecAutoIdle ? [1] : []), ...(thrLeverIdle ? [] : [2])];
  if (isGroundProcedure(flightPhase)) {
    return [...lines, 3];
  }
  return [...lines, 4, 5, 6, 3];
}

/**
 * The STATUS of a reverser unlocked in flight: the MAX SPEED 300/0.78 limitation for an unlocked reverser of the
 * ENG 1(2) SHUT DOWN STATUS, the procedure associated with REVERSE UNLOCKED. Design choice: shown while the reverser is
 * unlocked in flight, whether the engine is shut down or not.
 */
export function reverseUnlockedStatus(onGround: boolean): string[] {
  return onGround ? [] : ['700400058'];
}

/**
 * ENG 1(2) REVERSER FAULT: the procedure lines are only for a reverser position fault with the reverser
 * pressurized. The flyPad reverser fault (the reverser does not deploy) is no position fault: crew awareness, its title
 * only. STATUS INOP SYS REVERSER 1(2).
 */
export function reverserFaultInopSys(engineNumber: 1 | 2): string[] {
  return [engineNumber === 1 ? '780300001' : '780300002'];
}

/**
 * ENG 1(2) REV PRESSURIZED, by index in its codes: 0 title, 1 -THR LEVER n IDLE, 2 THR LVR n NOT ABOVE
 * IDLE. In flight: THR LEVER IDLE (gone once at idle). On ground: THR LVR NOT ABOVE IDLE.
 */
export function revPressurizedLines(flightPhase: number, thrLeverIdle: boolean): number[] {
  if (isGroundProcedure(flightPhase)) {
    return [0, 2];
  }
  return [0, ...(thrLeverIdle ? [] : [1])];
}
