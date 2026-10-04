// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  FailableFuelSwitch,
  FailableFuelSwitchesDriver,
  FailuresConsumer,
  FuelSwitchAccess,
  msfsFuelPumpAccess,
  msfsFuelValveAccess,
} from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';

/** A wing tank pump of the MSFS fuel system (flight_model.cfg [FUEL_SYSTEM]) */
export interface A320TankPump {
  /** The failure of the pump */
  failure: number;
  /** The MSFS pump number (Pump.N), the index of FUELSYSTEM PUMP SWITCH and FUELSYSTEM PUMP ACTIVE */
  pump: number;
  /** The MSFS line from the pump outlet to the engine feed junction (Line.N) */
  outletLine: number;
}

/** The wing tank pumps: L TK PUMP 1, L TK PUMP 2, R TK PUMP 1, R TK PUMP 2 */
export const A320_TANK_PUMPS: readonly A320TankPump[] = [
  // Pump.2 LeftInnerTankPump1, Line.7 PumpLeft1ToJuncLeft
  { failure: A320Failure.LeftTankPump1, pump: 2, outletLine: 7 },
  // Pump.5 LeftInnerTankPump2, Line.9 PumpLeft2ToJuncLeft
  { failure: A320Failure.LeftTankPump2, pump: 5, outletLine: 9 },
  // Pump.3 RightInnerTankPump1, Line.8 PumpRight1ToJuncRight
  { failure: A320Failure.RightTankPump1, pump: 3, outletLine: 8 },
  // Pump.6 RightInnerTankPump2, Line.10 PumpRight2ToJuncRight
  { failure: A320Failure.RightTankPump2, pump: 6, outletLine: 10 },
];

/**
 * The selection of a L (R) TK PUMPS 1(2) pb-sw, by MSFS pump number: the pb-sw toggles it and shows it (OFF light,
 * animation), this module copies it to the MSFS pump switch unless the pump is failed.
 */
export function tankPumpPbIsOnVar(pump: number): string {
  return `L:A32NX_OVHD_FUEL_PUMP_${pump}_PB_IS_ON`;
}

/** The MSFS valve of the X FEED valve (Valve.3 CrossFeedValve of flight_model.cfg, OpeningTime 3 s) */
export const A320_CROSSFEED_VALVE = 3;

/**
 * The X FEED pb-sw selection: the pb-sw toggles it and shows it (ON light, animation), this module copies it to the MSFS
 * valve unless the valve is jammed. The OPEN light shows the valve position (FUELSYSTEM VALVE OPEN:3).
 */
export const A320_CROSSFEED_PB_IS_ON_VAR = 'L:A32NX_OVHD_FUEL_XFEED_PB_IS_ON';

/** Below this pump outlet pressure, in psi, the pump delivery pressure is low (as the pb-sw FAULT light always had) */
export const TANK_PUMP_LOW_PRESSURE_PSI = 6;

/**
 * Whether a wing tank pump is ON with a low delivery pressure: the condition of its FAULT light, of the amber LO on the SD
 * FUEL page and of the FUEL L(R) TK PUMP 1(2) LO PR caution (A320 FCOM DSC-28-20 "L (R) TK PUMPS 1(2) pb-sw", l.42737:
 * "Amber light and ECAM caution come on, when the delivery pressure drops. It does not come on when OFF is selected").
 * The pump does not deliver when it is failed (its MSFS switch held off), when its tank is empty, or when its outlet
 * pressure is low.
 * @param switchOn whether the pump pb-sw is ON (its selection L:var, tankPumpPbIsOnVar)
 * @param active whether MSFS runs the pump (FUELSYSTEM PUMP ACTIVE)
 * @param outletPressurePsi the pressure of the pump outlet line
 */
export function isTankPumpLowPressure(switchOn: boolean, active: boolean, outletPressurePsi: number): boolean {
  return switchOn && (!active || outletPressurePsi < TANK_PUMP_LOW_PRESSURE_PSI);
}

/** The L:var that tells that a wing tank pump is ON with a low delivery pressure */
export function tankPumpLowPressureVar(pump: number): string {
  return `L:A32NX_FUEL_PUMP_${pump}_LO_PR`;
}

/** The failures this module reads */
export type FailureStates = Pick<FailuresConsumer, 'update' | 'isActive'>;

/**
 * The A320 fuel pump and valve failures (ATA 28), on the MSFS fuel system. An MSFS pump or valve keeps running or moving
 * with its electrical circuit off, so the pb-sw of a wing tank pump and the X FEED pb-sw only set a selection L:var, and
 * this module drives the MSFS pump and valve switches from them (FailableFuelSwitchesDriver):
 * - A failed wing tank pump stops: its MSFS pump switch is held off while the pb-sw stays where the flight crew put it.
 *   The pump pressure drops, so the FAULT light, the amber LO on the SD FUEL page and the FUEL L(R) TK PUMP 1(2) LO PR
 *   caution come on while the pb-sw is ON (see isTankPumpLowPressure).
 * - A jammed X FEED valve keeps its position whatever the X FEED pb-sw is: its MSFS valve switch is held where the valve
 *   was. The FWC gives FUEL X FEED VALVE FAULT once the valve position disagrees with the pb-sw.
 */
export class FuelPumpsAndValves implements Instrument {
  /** How often the pump states are computed, in milliseconds */
  private static readonly UPDATE_PERIOD_MS = 100;

  private readonly pumps: FailableFuelSwitchesDriver;

  private readonly valves: FailableFuelSwitchesDriver;

  private lastUpdateTime: number | null = null;

  private timeSinceUpdate = 0;

  private hasUpdated = false;

  constructor(
    private readonly failures: FailureStates = new FailuresConsumer(),
    fuelPumps: FuelSwitchAccess = msfsFuelPumpAccess,
    fuelValves: FuelSwitchAccess = msfsFuelValveAccess,
  ) {
    const isFailureActive = (failure: number) => this.failures.isActive(failure);
    this.pumps = new FailableFuelSwitchesDriver(
      A320_TANK_PUMPS.map(
        ({ failure, pump }): FailableFuelSwitch => ({
          failure,
          index: pump,
          effect: 'off',
          selectionVar: tankPumpPbIsOnVar(pump),
        }),
      ),
      isFailureActive,
      fuelPumps,
    );
    this.valves = new FailableFuelSwitchesDriver(
      [
        {
          failure: A320Failure.CrossFeedValveJammed,
          index: A320_CROSSFEED_VALVE,
          effect: 'jam',
          selectionVar: A320_CROSSFEED_PB_IS_ON_VAR,
        },
      ],
      isFailureActive,
      fuelValves,
    );
  }

  public init(): void {
    // nothing to initialise: the pb-sw selections are taken from the MSFS switches on the first update
  }

  public onUpdate(): void {
    const now = Date.now();
    const deltaTime = this.lastUpdateTime === null ? 0 : now - this.lastUpdateTime;
    this.lastUpdateTime = now;
    this.update(deltaTime);
  }

  /** @param deltaTime the time since the last update, in milliseconds */
  public update(deltaTime: number): void {
    this.timeSinceUpdate += deltaTime;
    if (this.hasUpdated && this.timeSinceUpdate < FuelPumpsAndValves.UPDATE_PERIOD_MS) {
      return;
    }
    const elapsed = this.timeSinceUpdate;
    this.timeSinceUpdate = 0;
    this.hasUpdated = true;

    this.failures.update();
    this.pumps.update(elapsed);
    this.valves.update(elapsed);

    for (const { pump, outletLine } of A320_TANK_PUMPS) {
      const lowPressure = isTankPumpLowPressure(
        SimVar.GetSimVarValue(tankPumpPbIsOnVar(pump), SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM LINE FUEL PRESSURE:${outletLine}`, SimVarValueType.PSI),
      );
      SimVar.SetSimVarValue(tankPumpLowPressureVar(pump), SimVarValueType.Bool, lowPressure);
    }
  }
}
