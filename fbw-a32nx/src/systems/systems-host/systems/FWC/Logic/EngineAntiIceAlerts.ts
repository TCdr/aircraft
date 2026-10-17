// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * ANTI ICE ENG 1(2) VALVE CLSD and ANTI ICE ENG 1(2) VALVE OPEN: the valve is abnormally closed / open. Both cautions
 * are inhibited in flight phases 3, 4, 5, 7 and 8.
 *
 * The valve is the engine anti-ice valve of the systems model (systems ice_rain_protection engine_anti_ice.rs): it opens
 * with the ENG ANTI ICE pb-sw ON when the engine supplies air, and without electrical power.
 */

/**
 * Design choice (no documented value): the time the valve position must disagree with the pb-sw before the caution,
 * longer than the 2 s the valve takes to transit (the pb-sw FAULT light comes on briefly while the valve transits).
 */
export const ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS = 5;

export interface EngineAntiIceValveInputs {
  /** The ENG ANTI ICE pb-sw is ON (L:A32NX_BUTTON_OVHD_ANTI_ICE_ENG_n_POSITION) */
  pbOn: boolean;
  /** The valve is not fully closed (L:A32NX_PNEU_ENG_n_ANTI_ICE_VALVE_OPEN) */
  valveOpen: boolean;
  /** The engine core runs at or above its minimum idle */
  engineRunning: boolean;
}

/**
 * The engine anti-ice valve cautions of one engine.
 *
 * Design choice: VALVE CLSD is only abnormal with the engine running, since the valve closes automatically when no air
 * is available (engine not running): a pb-sw ON before the engine start lights the FAULT light of
 * the pb-sw, not the caution. VALVE OPEN needs no running engine: the valve only opens without engine air when it is
 * jammed open.
 */
export class EngineAntiIceValveMonitor {
  private closedSeconds = 0;

  private openSeconds = 0;

  /** ANTI ICE ENG n VALVE CLSD */
  public valveClosed = false;

  /** ANTI ICE ENG n VALVE OPEN */
  public valveOpen = false;

  update(inputs: EngineAntiIceValveInputs, deltaTimeSeconds: number): void {
    const abnormallyClosed = inputs.pbOn && !inputs.valveOpen && inputs.engineRunning;
    const abnormallyOpen = !inputs.pbOn && inputs.valveOpen;

    this.closedSeconds = abnormallyClosed ? this.closedSeconds + deltaTimeSeconds : 0;
    this.openSeconds = abnormallyOpen ? this.openSeconds + deltaTimeSeconds : 0;

    this.valveClosed = this.closedSeconds >= ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS;
    this.valveOpen = this.openSeconds >= ENGINE_ANTI_ICE_VALVE_CONFIRM_TIME_SECONDS;
  }
}

/** The STATUS lines of the engine anti-ice valve cautions (see StatusMessages) */
const ENGINE_ANTI_ICE_STATUS_CODES = {
  /** AVOID ICING CONDITIONS (the line of the ENG SHUT DOWN STATUS) */
  avoidIcing: '700400001',
  thrustLimPenalty: '300400001',
  /** INOP SYS ENG 1 A. ICE, ENG 2 A. ICE */
  engineAntiIce: ['300300002', '300300003'],
};

/**
 * The STATUS of ANTI ICE ENG n VALVE CLSD: AVOID ICING CONDITIONS, INOP SYS ENG n A. ICE
 * @param engine 1 or 2
 */
export function engineAntiIceValveClosedStatus(engine: 1 | 2): { statusInfo: string[]; inopSys: string[] } {
  return {
    statusInfo: [ENGINE_ANTI_ICE_STATUS_CODES.avoidIcing],
    inopSys: [ENGINE_ANTI_ICE_STATUS_CODES.engineAntiIce[engine - 1]],
  };
}

/** The STATUS of ANTI ICE ENG n VALVE OPEN: THRUST LIM PENALTY */
export function engineAntiIceValveOpenStatus(): { statusInfo: string[]; inopSys: string[] } {
  return { statusInfo: [ENGINE_ANTI_ICE_STATUS_CODES.thrustLimPenalty], inopSys: [] };
}
