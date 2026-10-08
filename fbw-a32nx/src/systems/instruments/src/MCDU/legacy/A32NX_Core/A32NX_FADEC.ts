// @ts-strict-ignore
// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

/*
 * The igniters (L:A32NX_FADEC_IGNITER_A/B_ACTIVE_ENGn) are now written by the systems WASM, with the start sequence and the
 * igniter failures (a320_systems engine_failure.rs, systems::engine::engine_start).
 */

// FIXME move to systems host
export class A32NX_FADEC {
  private fadecTimer = -1;
  private dcEssPoweredInPreviousUpdate = false;
  private lastEngineState;
  private lastIgnitionState;

  constructor(private readonly engine: number) {}

  init() {
    this.updateSimVars();
  }

  update(deltaTime) {
    const dcEssIsPowered = this.isDcEssPowered();
    const ignitionState = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 2;
    const engineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${this.engine}`, 'Number');

    if (
      (this.dcEssPoweredInPreviousUpdate !== dcEssIsPowered && dcEssIsPowered === 1) ||
      (this.lastEngineState !== engineState && engineState === 4)
    ) {
      this.fadecTimer = 5 * 60;
    }
    if (this.lastIgnitionState !== ignitionState && !ignitionState) {
      this.fadecTimer = Math.max(30, this.fadecTimer);
    }
    this.fadecTimer -= deltaTime / 1000;
    this.updateSimVars();
    this.dcEssPoweredInPreviousUpdate = dcEssIsPowered;
  }

  updateSimVars() {
    this.lastIgnitionState = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 2;
    this.lastEngineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${this.engine}`, 'Number');
    SimVar.SetSimVarValue(`L:A32NX_FADEC_POWERED_ENG${this.engine}`, 'Bool', this.isPowered() ? 1 : 0);
  }

  isPowered() {
    if (SimVar.GetSimVarValue(`L:A32NX_FIRE_BUTTON_ENG${this.engine}`, 'Bool') === 1) {
      return false;
    }
    if (SimVar.GetSimVarValue(`TURB ENG N2:${this.engine}`, 'Percent') > 15) {
      return true;
    }
    if (SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') !== 1) {
      return true;
    }
    if (SimVar.GetSimVarValue(`L:A32NX_OVHD_FADEC_${this.engine}`, 'Bool')) {
      return true;
    }
    if (this.fadecTimer > 0) {
      return true;
    }
    return false;
  }

  isDcEssPowered() {
    // This will have to be revisited when implementing the FADEC. One shouldn't consider this reference
    // to DC ESS valuable: it might be powered by multiple buses or related to other things altogether.
    return SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'Bool');
  }
}
