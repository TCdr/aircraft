// @ts-strict-ignore
// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FuelUsedAccuracy } from '@shared/FuelUsedAccuracy';

/*
 * The igniters (L:A32NX_FADEC_IGNITER_A/B_ACTIVE_ENGn) are written by the systems WASM, with the start sequence and the
 * igniter failures (a320_systems engine_failure.rs, systems::engine::engine_start).
 */

/** Both FADEC channels are self powered by the FADEC alternator above this N2 on the CFM LEAP-1A. */
const FADEC_ALTERNATOR_MIN_N2_PERCENT = 8;

function isSimVarSet(name: string): boolean {
  return SimVar.GetSimVarValue(name, 'Bool') > 0;
}

/** What decides whether the FADEC channels of an engine are powered (L:A32NX_FADEC_CHANNEL_A/B_POWERED_ENGn) */
export interface FadecPowerInputs {
  firePbPushed: boolean;
  n2Percent: number;
  /**
   * ENG 1(2) FADEC ALTERNATOR: the FADEC alternator no longer supplies the FADEC
   * (L:A32NX_ENGINE_n_FADEC_ALTERNATOR_FAULT)
   */
  alternatorFailed: boolean;
  /** The aircraft is in flight (LGCIU 1): the aircraft network always supplies the FADEC */
  inFlight: boolean;
  engModeSelNorm: boolean;
  fadecGroundPowerOn: boolean;
  fadecTimerRunning: boolean;
  /**
   * Design choice: channel A on the DC ESS BUS, the channel that remains in the emergency electrical configuration;
   * channel B on the DC bus of its engine side.
   */
  channelABusPowered: boolean;
  channelBBusPowered: boolean;
}

export interface FadecChannelPower {
  channelA: boolean;
  channelB: boolean;
}

/** The FADEC channels lost by failure (flyPad FADEC channel A / B failures) */
export interface FadecChannelFailures {
  channelALost: boolean;
  channelBLost: boolean;
}

/**
 * The supply of the two FADEC channels. The FADEC alternator supplies both channels above 8 % N2 when it works.
 * Otherwise the aircraft network supplies each channel through its bus: always in flight, and on the ground while the
 * engine turns (the FADEC is only unpowered 5 min after the engine shutdown), the ENG MODE selector is out of NORM, the
 * ENG FADEC GND PWR pb is ON or the FADEC power-up timer runs. The ENG FIRE pb cuts the FADEC supply.
 */
export function fadecChannelPower(inputs: FadecPowerInputs): FadecChannelPower {
  if (inputs.firePbPushed) {
    return { channelA: false, channelB: false };
  }
  const engineTurns = inputs.n2Percent > FADEC_ALTERNATOR_MIN_N2_PERCENT;
  const alternatorSupplies = engineTurns && !inputs.alternatorFailed;
  const networkSupplies =
    inputs.inFlight || engineTurns || !inputs.engModeSelNorm || inputs.fadecGroundPowerOn || inputs.fadecTimerRunning;
  return {
    channelA: alternatorSupplies || (networkSupplies && inputs.channelABusPowered),
    channelB: alternatorSupplies || (networkSupplies && inputs.channelBBusPowered),
  };
}

/**
 * Whether the FADEC works and sends its engine data to the displays (E/WD and SD XX when not): one channel that is
 * powered and not failed is enough. A FADEC with both channels lost sends nothing: the engine indications are lost
 * and the crew checks the engine on the other system pages.
 */
export function isFadecPowered(power: FadecChannelPower, failures: FadecChannelFailures): boolean {
  return (power.channelA && !failures.channelALost) || (power.channelB && !failures.channelBLost);
}

// FIXME move to systems host
export class A32NX_FADEC {
  private fadecTimer = -1;
  private dcEssPoweredInPreviousUpdate = false;
  private lastEngineState;
  private lastIgnitionState;
  private readonly fuelUsedAccuracy = new FuelUsedAccuracy();

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
    const fadecPowered = this.updateSimVars();
    // The fuel used of the SD pages, of degraded accuracy after the fuel flow (sent by the powered FADEC) was lost in flight
    const fuelUsedDegraded = this.fuelUsedAccuracy.update(
      deltaTime / 1000,
      fadecPowered,
      !!SimVar.GetSimVarValue('SIM ON GROUND', 'Bool'),
      engineState,
    );
    SimVar.SetSimVarValue(`L:A32NX_FUEL_USED_DEGRADED:${this.engine}`, 'Bool', fuelUsedDegraded ? 1 : 0);
    this.dcEssPoweredInPreviousUpdate = dcEssIsPowered;
  }

  /** @returns whether the FADEC is powered and sends its engine data */
  updateSimVars(): boolean {
    this.lastIgnitionState = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 2;
    this.lastEngineState = SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${this.engine}`, 'Number');
    const power = this.channelPower();
    SimVar.SetSimVarValue(`L:A32NX_FADEC_CHANNEL_A_POWERED_ENG${this.engine}`, 'Bool', power.channelA ? 1 : 0);
    SimVar.SetSimVarValue(`L:A32NX_FADEC_CHANNEL_B_POWERED_ENG${this.engine}`, 'Bool', power.channelB ? 1 : 0);
    const powered = isFadecPowered(power, this.channelFailures());
    SimVar.SetSimVarValue(`L:A32NX_FADEC_POWERED_ENG${this.engine}`, 'Bool', powered ? 1 : 0);
    return powered;
  }

  private channelPower(): FadecChannelPower {
    return fadecChannelPower({
      firePbPushed: SimVar.GetSimVarValue(`L:A32NX_FIRE_BUTTON_ENG${this.engine}`, 'Bool') === 1,
      n2Percent: SimVar.GetSimVarValue(`TURB ENG N2:${this.engine}`, 'Percent'),
      alternatorFailed: isSimVarSet(`L:A32NX_ENGINE_${this.engine}_FADEC_ALTERNATOR_FAULT`),
      inFlight:
        !isSimVarSet('L:A32NX_LGCIU_1_LEFT_GEAR_COMPRESSED') && !isSimVarSet('L:A32NX_LGCIU_1_RIGHT_GEAR_COMPRESSED'),
      engModeSelNorm: SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'Enum') === 1,
      fadecGroundPowerOn: isSimVarSet(`L:A32NX_OVHD_FADEC_${this.engine}`),
      fadecTimerRunning: this.fadecTimer > 0,
      channelABusPowered: this.isDcEssPowered() > 0,
      channelBBusPowered: isSimVarSet(`L:A32NX_ELEC_DC_${this.engine}_BUS_IS_POWERED`),
    });
  }

  /** The FADEC channel faults the systems WASM writes: one channel lost, or both (ENG FADEC FAULT) */
  private channelFailures(): FadecChannelFailures {
    const bothLost = isSimVarSet(`L:A32NX_ENGINE_${this.engine}_FADEC_FAULT`);
    return {
      channelALost: bothLost || isSimVarSet(`L:A32NX_ENGINE_${this.engine}_FADEC_CHANNEL_A_FAULT`),
      channelBLost: bothLost || isSimVarSet(`L:A32NX_ENGINE_${this.engine}_FADEC_CHANNEL_B_FAULT`),
    };
  }

  isDcEssPowered() {
    return SimVar.GetSimVarValue('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'Bool');
  }
}
