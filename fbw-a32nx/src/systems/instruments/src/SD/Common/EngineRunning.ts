// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The engine signals of the SD page colours:
 * - HYD page engine pump legend and BLEED page engine number: white, amber with the engine N2 below idle.
 * - ELEC page GEN 1(2) number with the GEN pb-sw OFF: white with the engine running, amber if not.
 *
 * Design choices:
 * - N2 below idle: the FADEC N2 (L:A32NX_ENGINE_N2:n) more than 3 % below the idle N2 of the current conditions
 *   (L:A32NX_ENGINE_IDLE_N2), the margin of the FWC ENG 1(2) FAIL alert (systems-host FWC/Logic/EngineFailAlerts.ts), so
 *   that an engine running at idle stays white.
 * - Engine running: the FADEC engine state is ON (L:A32NX_ENGINE_STATE:n = 1, the start sequence has ended).
 */

/** How far below the idle N2 the engine core is below idle, in percent N2 */
const ENGINE_N2_BELOW_IDLE_MARGIN_PERCENT = 3;

/**
 * The unit to read the FADEC N1/N2 L:vars in (L:A32NX_ENGINE_N1:n, L:A32NX_ENGINE_N2:n, L:A32NX_ENGINE_IDLE_N1,
 * L:A32NX_ENGINE_IDLE_N2). L:vars hold plain percent: read as number. The FADEC writes them with the unit "number"
 * (fadec_a32nx FadecSimData_A32NX.hpp), and MSFS 2024 converts such an L:var read in 'percent' as a ratio: 68.2 % N2
 * comes back as 6820, which shrinks the fixed margins (3 % N2, 2 % N1) to hundredths of a percent.
 */
export const FADEC_N_LVAR_UNIT = 'number';

/** L:A32NX_ENGINE_STATE ON (fadec_a32nx EngineControlA32NX.h) */
const FADEC_ENGINE_STATE_ON = 1;

export function isEngineN2BelowIdle(n2Percent: number, idleN2Percent: number): boolean {
  return n2Percent < idleN2Percent - ENGINE_N2_BELOW_IDLE_MARGIN_PERCENT;
}

export function isEngineRunning(engineState: number): boolean {
  return engineState === FADEC_ENGINE_STATE_ON;
}
