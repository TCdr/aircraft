// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FadecEngineState } from './EngineFailAlerts';

/*
 * A380X FWS engine alerts before take-off (A380 FCOM PRO-ABN-ECAM-10-70, a380_fcom.txt):
 *
 * - ENG 1(2)(3)(4) OIL TEMP LO, l.172605-172628. l.172611-172614: "On ground, the engine oil temperature is less than
 *   50 °C: 30 s after the engine is running, or After the flight crew presses T.O CONFIG pb, or After the flight crew
 *   sets the takeoff power." Lines l.172627-172628: "THR LEVER 1(2)(3)(4) ... IDLE", "DELAY T.O FOR WARM UP".
 *   FCOM PDF page 5802: amber caution (MASTER CAUT, SC), ENGINE SD page, inhibited in phases 1 and 4 to 12.
 * - ENG THR LEVERS NOT SET, l.175146-175184. l.175152-175156: "Displayed during takeoff when either: one throttle lever
 *   is set between CL and FLEX MCT, or in case of disagreement between the thrust lever position and the takeoff thrust
 *   mode selected by the FADECs." Lines l.175175-175182: "If TOGA selected on FMS and thrust levers are at or below
 *   FLX/MCT: ALL THR LEVERS ... TOGA"; "If derate or flex takeoff selected on FMS and thrust levers are below FLX/MCT:
 *   THR LEVERS ... MCT/FLEX"; "If derated takeoff selected on FMS and thrust levers at TOGA: THR LEVERS ... MCT/FLEX".
 *   FCOM PDF page 5860: amber caution (MASTER CAUT, SC), inhibited in phases 1 and 4 to 12.
 *   Design choice: FBW has no derated take-off, so the derate case (TOGA not allowed) is left out.
 */

/** ENG OIL TEMP LO flight phase inhibition (FCOM PDF page 5802): shown in phases 2 and 3 only */
export const OIL_TEMP_LO_PHASE_INHIBITION = [1, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** ENG THR LEVERS NOT SET flight phase inhibition (FCOM PDF page 5860): shown in phases 2 and 3 only */
export const THR_LEVERS_NOT_SET_PHASE_INHIBITION = [1, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** l.172611: "the engine oil temperature is less than 50 °C" */
export const OIL_TEMP_LO_THRESHOLD_CELSIUS = 50;

/** l.172612: "30 s after the engine is running" */
const OIL_TEMP_LO_RUNNING_DELAY_MS = 30_000;

export interface OilTemperatureLowInputs {
  onGround: boolean;
  engineState: FadecEngineState;
  /** The oil temperature the FADEC computes (GENERAL ENG OIL TEMPERATURE:n), °C */
  oilTemperatureCelsius: number;
  /** The T.O CONFIG pb is pressed */
  toConfigPressed: boolean;
  /** The take-off power is set (the FWS take-off power of the flight phases) */
  takeoffPowerSet: boolean;
}

/**
 * ENG OIL TEMP LO of one engine.
 *
 * The oil temperature is monitored once the engine has been running (FADEC state ON) for 30 s, or earlier once the
 * crew pressed the T.O CONFIG pb or set the take-off power. Design choice: a T.O CONFIG press arms the monitor until the
 * engine stops (the FCOM says "after the flight crew presses", not "while").
 */
export class OilTemperatureLowMonitor {
  private runningTimeMs = 0;

  private toConfigPressedWhileRunning = false;

  private active = false;

  /**
   * @param inputs the engine and cockpit state
   * @param deltaTimeMs the frame time in milliseconds
   */
  update(inputs: OilTemperatureLowInputs, deltaTimeMs: number): void {
    const running = inputs.engineState === FadecEngineState.On;
    if (!running) {
      this.runningTimeMs = 0;
      this.toConfigPressedWhileRunning = false;
      this.active = false;
      return;
    }

    this.runningTimeMs += deltaTimeMs;
    this.toConfigPressedWhileRunning ||= inputs.toConfigPressed;

    const monitored =
      this.runningTimeMs >= OIL_TEMP_LO_RUNNING_DELAY_MS || this.toConfigPressedWhileRunning || inputs.takeoffPowerSet;
    this.active = inputs.onGround && monitored && inputs.oilTemperatureCelsius < OIL_TEMP_LO_THRESHOLD_CELSIUS;
  }

  get isActive(): boolean {
    return this.active;
  }
}

/*
 * Thrust lever angles of the A380X detents, degrees (A380FadecComputer: CL 25, FLX/MCT 35, TOGA 45; FwsCore
 * allThrottleClb / allThrottleMct / allThrottleToga use the same ranges).
 */
const CL_DETENT_TLA = 25;
const FLX_MCT_DETENT_TLA = 35;
const TOGA_DETENT_TLA = 45;

/** The thrust lever is at CL or between CL and FLX/MCT */
export function isLeverBetweenClAndFlxMct(tlaDegrees: number): boolean {
  return tlaDegrees >= CL_DETENT_TLA && tlaDegrees < FLX_MCT_DETENT_TLA;
}

/** The thrust lever is at FLX/MCT (up to TOGA) */
export function isLeverAtFlxMct(tlaDegrees: number): boolean {
  return tlaDegrees >= FLX_MCT_DETENT_TLA && tlaDegrees < TOGA_DETENT_TLA;
}

/**
 * The take-off thrust mode the FADECs select: FLEX when a FLEX TEMP is entered and is above the TAT, otherwise TOGA.
 * This is the rule of the FADEC computer (A380FadecComputer.cpp is_FLX_active: the PRIM FLEX TO TEMP is valid and
 * above TAT_degC, the sim TOTAL AIR TEMPERATURE); the FMS writes 0 for "no FLEX TEMP" (MfdFmsPerf.tsx, a 0 °C FLEX is
 * written as 0.1).
 */
export function isFlexTakeoffMode(flexTemperatureCelsius: number, totalAirTemperatureCelsius: number): boolean {
  return flexTemperatureCelsius !== 0 && flexTemperatureCelsius > totalAirTemperatureCelsius;
}

export interface ThrustLeversNotSetInputs {
  /** Thrust lever angles of engines 1-4, degrees */
  tlaDegrees: readonly number[];
  /** The FADEC state of engines 1-4 */
  engineStates: readonly FadecEngineState[];
  /** The take-off thrust mode of the FADECs is FLEX (isFlexTakeoffMode) */
  flexTakeoffMode: boolean;
}

/** The lines of ENG THR LEVERS NOT SET: 0 ALL THR LEVERS TOGA (TOGA mode), 1 THR LEVERS MCT/FLEX (FLEX mode) */
export function thrLeversNotSetItemsShown(flexTakeoffMode: boolean): boolean[] {
  return [!flexTakeoffMode, flexTakeoffMode];
}

/**
 * ENG THR LEVERS NOT SET: a thrust lever of a running engine is at CL or between CL and FLX/MCT, or at FLX/MCT while
 * the FADECs are in TOGA mode. The phase inhibition limits it to the phases 2 and 3; a lever below CL (taxi) is not a
 * take-off setting. Design choice: only the levers of running engines (FADEC state ON) count, as the A32NX FWC (engine
 * core at or above minimum idle).
 */
export function isThrustLeversNotSet(inputs: ThrustLeversNotSetInputs): boolean {
  return inputs.tlaDegrees.some(
    (tla, index) =>
      inputs.engineStates[index] === FadecEngineState.On &&
      (isLeverBetweenClAndFlxMct(tla) || (!inputs.flexTakeoffMode && isLeverAtFlxMct(tla))),
  );
}
