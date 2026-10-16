// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The red SMOKE indications of the COND SD page (FCOM gap report 2026-10-10, A380X ATA 21 rows #23 and #28, ATA 26
 * row #9), fed by the Smoke Detection Function of systems.wasm (L:A32NX_SMOKE_<zone>_DETECTED, fbw-common
 * fire_protection/smoke_detection.rs). "l." = line of references/manuals/a380_fcom.txt.
 */

/**
 * Cargo SMOKE INDICATION (DSC-21-10-20 l.6015-6016, DSC-26-60-20 l.53984-53985): "Smoke is detected in the indicated
 * area (aft and bulk cargo compartment)." The COND page has a forward cargo and an aft/bulk cargo area: the aft and
 * the bulk cargo compartments share the SMOKE of the aft area.
 * @param fwdCargoSmoke L:A32NX_SMOKE_FWD_CARGO_DETECTED
 * @param aftCargoSmoke L:A32NX_SMOKE_AFT_CARGO_DETECTED
 * @param bulkCargoSmoke L:A32NX_SMOKE_BULK_CARGO_DETECTED
 * @returns the SMOKE of the forward and of the aft/bulk cargo area
 */
export function cargoSmokeIndications(
  fwdCargoSmoke: boolean,
  aftCargoSmoke: boolean,
  bulkCargoSmoke: boolean,
): { fwd: boolean; aftBulk: boolean } {
  return { fwd: fwdCargoSmoke, aftBulk: aftCargoSmoke || bulkCargoSmoke };
}

/**
 * Avionics SMOKE INDICATION (DSC-21-20-90 l.6962-6970): "Smoke is detected in the L circuit of the main avionics bay."
 * / "... of the upper avionics bay." One red legend per bay that names the affected circuit(s): L SMOKE, R SMOKE or
 * L R SMOKE (design choice: the FCOM figure is not in the text).
 * @param leftCircuitSmoke smoke in the L circuit of the bay (L:A32NX_SMOKE_L_<bay>_AVNCS_DETECTED)
 * @param rightCircuitSmoke smoke in the R circuit of the bay (L:A32NX_SMOKE_R_<bay>_AVNCS_DETECTED)
 * @returns the legend, or null without smoke
 */
export function avionicsBaySmokeLegend(leftCircuitSmoke: boolean, rightCircuitSmoke: boolean): string | null {
  if (leftCircuitSmoke && rightCircuitSmoke) {
    return 'L R SMOKE';
  }
  if (leftCircuitSmoke) {
    return 'L SMOKE';
  }
  return rightCircuitSmoke ? 'R SMOKE' : null;
}
