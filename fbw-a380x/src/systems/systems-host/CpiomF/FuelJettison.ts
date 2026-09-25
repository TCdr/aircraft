// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, Instrument, KeyEventManager, SimVarValueType } from '@microsoft/msfs-sdk';
import { UniversalConfigProvider, Units, UpdateThrottler } from '@flybywiresim/fbw-sdk';

/**
 * Fuel jettison, as controlled by the FQMS (A380 FCOM DSC-28-40 Fuel Jettison, DSC-28-20 JETTISON panel):
 * - Jettison starts when the JETTISON ARM and JETTISON ACTIVE pb-sw are both ON, with or without a jettison final gross
 *   weight (JTSN GW, entered on the FMS FUEL&LOAD page).
 * - Fuel is jettisoned from all the transfer tanks (inner, mid, outer and trim) simultaneously, never from the feed
 *   tanks, at about 5 512 lb/min. All fuel transfers stop meanwhile (see LegacyFuel).
 * - When the CG reaches the forward certified takeoff and landing limit, the trim tank jettison stops, and resumes when
 *   the CG is 0.5 % aft of it.
 * - The FQMS stops the jettison when the GW reaches the JTSN GW, or when the transfer tanks are empty: the ON and OPEN
 *   lights go off and the FUEL JETTISON COMPLETED procedure appears, until the flight crew sets both pb-sw OFF. The flight
 *   crew stops the jettison by setting either pb-sw OFF.
 *
 * The MSFS fuel system has no overboard outlet, so the jettisoned fuel is removed from the tanks directly. The jettison
 * valves of the fuel system are opened for the SD FUEL page.
 */
export class FuelJettison implements Instrument {
  /** FCOM DSC-28-40: 330 693 lb/h */
  private static readonly RATE_LB_PER_S = 330_693 / 3600;

  /** The transfer tanks of the MSFS fuel system: left outer, mid and inner, right inner, mid and outer, and the trim tank */
  private static readonly TRANSFER_TANKS = [1, 3, 4, 7, 8, 10];

  private static readonly TRIM_TANK = 11;

  private static readonly JETTISON_VALVES = [57, 58];

  /** Below this quantity in gallons, a tank is considered empty */
  private static readonly EMPTY_GALLONS = 0.5;

  /** FCOM: the trim tank jettison resumes when the CG is 0.5 % aft of the forward limit */
  private static readonly TRIM_RESUME_MARGIN = 0.5;

  /**
   * The takeoff and landing CG envelopes of the airframe (airframe.json5 performanceEnvelope mtow and mlw), polygons of
   * [CG % MAC, weight kg]; null until the airframe configuration is loaded.
   */
  private takeoffLandingEnvelopes: readonly (readonly number[][])[] | null = null;

  private readonly throttler = new UpdateThrottler(250);

  private keyEventManager?: KeyEventManager;

  /** The FQMS stopped the jettison (JTSN GW reached, or transfer tanks empty), until both pb-sw are OFF */
  private completed = false;

  private trimTankHeld = false;

  private valvesOpen: boolean | null = null;

  constructor(
    bus: EventBus,
    private readonly sysHost: BaseInstrument,
  ) {
    KeyEventManager.getManager(bus).then((manager) => (this.keyEventManager = manager));
  }

  init(): void {
    this.setOutputs(false);
    UniversalConfigProvider.fetchAirframeInfo(process.env.AIRCRAFT_PROJECT_PREFIX, process.env.AIRCRAFT_VARIANT).then(
      (airframe) => {
        const envelope = airframe?.designLimits?.performanceEnvelope;
        if (envelope?.mtow && envelope?.mlw) {
          this.takeoffLandingEnvelopes = [envelope.mtow, envelope.mlw];
        }
      },
    );
  }

  onUpdate(): void {
    const dt = this.throttler.canUpdate(this.sysHost.deltaTime);
    if (dt <= 0) {
      return;
    }

    const armOn = SimVar.GetSimVarValue('L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON', SimVarValueType.Bool);
    const activeOn = SimVar.GetSimVarValue('L:A380X_OVHD_FUEL_JETTISON_ACTIVE_PB_IS_ON', SimVarValueType.Bool);
    const powered = SimVar.GetSimVarValue('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', SimVarValueType.Bool);

    if (!armOn && !activeOn) {
      this.completed = false;
    }

    let jettisoning = armOn && activeOn && powered && !this.completed;
    if (jettisoning) {
      const grossWeightKg = Units.poundToKilogram(SimVar.GetSimVarValue('TOTAL WEIGHT', SimVarValueType.Pounds));
      const targetKg = SimVar.GetSimVarValue('L:A380X_FMS_JETTISON_GW', SimVarValueType.Number);
      const quantities = new Map(
        [...FuelJettison.TRANSFER_TANKS, FuelJettison.TRIM_TANK].map((tank) => [
          tank,
          SimVar.GetSimVarValue(`FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL),
        ]),
      );
      const transferTanksEmpty = [...quantities.values()].every((q) => q < FuelJettison.EMPTY_GALLONS);

      if ((targetKg > 0 && grossWeightKg <= targetKg) || transferTanksEmpty) {
        this.completed = true;
        jettisoning = false;
      } else {
        this.updateTrimTankHold(grossWeightKg);
        this.jettison(quantities, dt / 1000);
      }
    }

    this.setOutputs(jettisoning);
  }

  /** Removes the jettisoned fuel from the transfer tanks, in proportion to their content so they empty together */
  private jettison(quantities: Map<number, number>, seconds: number): void {
    const poundsPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', SimVarValueType.Pounds);
    if (!(poundsPerGallon > 0)) {
      return;
    }
    const tanks = [...quantities.keys()].filter(
      (tank) =>
        quantities.get(tank) >= FuelJettison.EMPTY_GALLONS && !(tank === FuelJettison.TRIM_TANK && this.trimTankHeld),
    );
    const total = tanks.reduce((sum, tank) => sum + quantities.get(tank), 0);
    if (total <= 0) {
      return;
    }
    const gallons = (FuelJettison.RATE_LB_PER_S * seconds) / poundsPerGallon;
    for (const tank of tanks) {
      const quantity = quantities.get(tank);
      const newQuantity = Math.max(0, quantity - (gallons * quantity) / total);
      SimVar.SetSimVarValue(`FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL, newQuantity);
    }
  }

  private updateTrimTankHold(grossWeightKg: number): void {
    if (this.takeoffLandingEnvelopes === null) {
      // The CG limits are not known yet: the trim tank fuel stays, the CG cannot move forward
      this.trimTankHeld = true;
      return;
    }
    const cg = SimVar.GetSimVarValue('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', SimVarValueType.Number);
    const forwardLimit = Math.max(
      ...this.takeoffLandingEnvelopes.map((envelope) => FuelJettison.forwardCgLimit(envelope, grossWeightKg)),
    );
    if (cg <= forwardLimit) {
      this.trimTankHeld = true;
    } else if (cg >= forwardLimit + FuelJettison.TRIM_RESUME_MARGIN) {
      this.trimTankHeld = false;
    }
  }

  /**
   * The forward (lowest) CG of an envelope polygon at a weight: the most forward crossing of the envelope edges at that
   * weight; outside the weight range of the envelope, the most forward CG at its nearest weight.
   * @param envelope polygon of [CG % MAC, weight kg]
   */
  private static forwardCgLimit(envelope: readonly number[][], weight: number): number {
    const weights = envelope.map(([, w]) => w);
    const w = Math.min(Math.max(weight, Math.min(...weights)), Math.max(...weights));
    let forward = Infinity;
    for (let i = 0; i < envelope.length; i++) {
      const [cg0, w0] = envelope[i];
      const [cg1, w1] = envelope[(i + 1) % envelope.length];
      if (w0 === w1) {
        if (w === w0) {
          forward = Math.min(forward, cg0, cg1);
        }
      } else if (w >= Math.min(w0, w1) && w <= Math.max(w0, w1)) {
        forward = Math.min(forward, cg0 + ((cg1 - cg0) * (w - w0)) / (w1 - w0));
      }
    }
    return forward;
  }

  private setOutputs(jettisoning: boolean): void {
    SimVar.SetSimVarValue('L:A380X_FUEL_JETTISON_IN_PROGRESS', SimVarValueType.Bool, jettisoning);
    SimVar.SetSimVarValue('L:A380X_FUEL_JETTISON_COMPLETED', SimVarValueType.Bool, this.completed);
    // OPEN light of the JETTISON ACTIVE pb-sw
    SimVar.SetSimVarValue('L:A380X_OVHD_FUEL_JETTISON_IS_OPEN', SimVarValueType.Bool, jettisoning);

    if (this.valvesOpen !== jettisoning && this.keyEventManager) {
      for (const valve of FuelJettison.JETTISON_VALVES) {
        this.keyEventManager.triggerKey('FUELSYSTEM_VALVE_SET', true, valve, jettisoning ? 1 : 0);
      }
      this.valvesOpen = jettisoning;
    }
  }
}
