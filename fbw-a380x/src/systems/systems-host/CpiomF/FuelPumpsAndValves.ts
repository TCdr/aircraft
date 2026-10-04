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
  NXLogicConfirmNode,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/** A feed tank pump of the MSFS fuel system (flight_model.cfg [FUEL_SYSTEM]) */
export interface A380FeedPump {
  /** The feed tank, 1 to 4 */
  tank: number;
  /** MAIN or STBY */
  kind: 'MAIN' | 'STBY';
  /** The failure of the pump */
  failure: number;
  /**
   * The MSFS pump number (Pump.N), the index of FUELSYSTEM PUMP SWITCH and ACTIVE. Its switch stays ON (flight files),
   * the failure switches it off.
   */
  pump: number;
  /**
   * The circuit (circuit.N of systems.cfg, CIRCUIT_FUEL_PUMP:<pump Index>) of the pump. Its pb-sw connects it to the
   * bus (A:CIRCUIT CONNECTION ON).
   */
  circuit: number;
}

/** The feed tank pumps: Pump.1-8 Feed<n>TankPump1 (main) and Feed<n>TankPump2 (standby), Index 1-8 */
export const A380_FEED_PUMPS: readonly A380FeedPump[] = [
  { tank: 1, kind: 'MAIN', failure: A380Failure.FuelFeedTank1MainPump, pump: 1, circuit: 2 },
  { tank: 1, kind: 'STBY', failure: A380Failure.FuelFeedTank1StbyPump, pump: 2, circuit: 3 },
  { tank: 2, kind: 'MAIN', failure: A380Failure.FuelFeedTank2MainPump, pump: 3, circuit: 64 },
  { tank: 2, kind: 'STBY', failure: A380Failure.FuelFeedTank2StbyPump, pump: 4, circuit: 65 },
  { tank: 3, kind: 'MAIN', failure: A380Failure.FuelFeedTank3MainPump, pump: 5, circuit: 66 },
  { tank: 3, kind: 'STBY', failure: A380Failure.FuelFeedTank3StbyPump, pump: 6, circuit: 67 },
  { tank: 4, kind: 'MAIN', failure: A380Failure.FuelFeedTank4MainPump, pump: 7, circuit: 68 },
  { tank: 4, kind: 'STBY', failure: A380Failure.FuelFeedTank4StbyPump, pump: 8, circuit: 69 },
];

/** A crossfeed valve of the MSFS fuel system */
export interface A380CrossFeedValve {
  /** The crossfeed valve number, 1 to 4 */
  number: number;
  failure: number;
  /** The MSFS valve number (Valve.N), the index of FUELSYSTEM VALVE SWITCH and VALVE OPEN */
  valve: number;
  /**
   * The CROSSFEED pb-sw selection: the pb-sw toggles it and shows it (ON light, animation), this module copies it to the
   * MSFS valve unless the valve is jammed
   */
  selectionVar: string;
}

/** The L:var of the selection of a CROSSFEED 1(2)(3)(4) pb-sw */
export function crossFeedPbIsOnVar(valveNumber: number): string {
  return `L:A380X_OVHD_FUEL_CROSSFEED_${valveNumber}_PB_IS_ON`;
}

/** The crossfeed valves: Valve.46-49 CrossFeedValve1-4 (flight_model.cfg) */
export const A380_CROSSFEED_VALVES: readonly A380CrossFeedValve[] = [
  { number: 1, failure: A380Failure.FuelCrossFeedValve1Jammed, valve: 46, selectionVar: crossFeedPbIsOnVar(1) },
  { number: 2, failure: A380Failure.FuelCrossFeedValve2Jammed, valve: 47, selectionVar: crossFeedPbIsOnVar(2) },
  { number: 3, failure: A380Failure.FuelCrossFeedValve3Jammed, valve: 48, selectionVar: crossFeedPbIsOnVar(3) },
  { number: 4, failure: A380Failure.FuelCrossFeedValve4Jammed, valve: 49, selectionVar: crossFeedPbIsOnVar(4) },
];

/** The L:var that tells that a feed tank pump is ON and running at low pressure or failed */
export function feedPumpLowPressureVar(tank: number, kind: 'MAIN' | 'STBY'): string {
  return `L:A380X_FUEL_FEED_TK_${tank}_${kind}_PMP_LO_PR`;
}

/** The L:var that tells that a crossfeed valve is abnormally closed or open */
export function crossFeedValveAbnormalVar(valveNumber: number): string {
  return `L:A380X_FUEL_CROSSFEED_VLV_${valveNumber}_ABNORMAL`;
}

/**
 * Whether a feed tank pump is ON and "running at low pressure or is failed" (A380 FCOM DSC-28-20 FEED TK 1(2)(3)(4)
 * MAIN/STBY pb-sw FAULT light, a380_fcom.txt l.57805 and l.57821; it "goes off, when the flight crew sets the pb-sw to
 * OFF").
 * @param pbOn whether the pump pb-sw is ON (its circuit connected to the bus)
 * @param running whether MSFS runs the pump (FUELSYSTEM PUMP ACTIVE)
 */
export function isFeedPumpLowPressure(pbOn: boolean, running: boolean): boolean {
  return pbOn && !running;
}

/**
 * Whether a crossfeed valve position disagrees with its CROSSFEED pb-sw: "The CROSSFEED 1(2)(3)(4) pb-sw is set to ON and
 * the crossfeed valve remains closed", or "is deselected and the crossfeed valve is open" (A380 FCOM DSC-28-20
 * CROSSFEED pb-sw, a380_fcom.txt l.58063-58100). The automatic openings of the valves (electrical emergency
 * configuration, ground transfer) are not simulated.
 * @param openRatio the valve position, 0 (closed) to 1 (open)
 * @param pbOn whether the CROSSFEED pb-sw is ON
 */
export function isCrossFeedValveDisagree(openRatio: number, pbOn: boolean): boolean {
  return pbOn ? openRatio < 1 : openRatio > 0;
}

/** The failures this module reads */
export type FailureStates = Pick<FailuresConsumer, 'isActive'>;

/**
 * The A380 feed tank pump and crossfeed valve failures (ATA 28), on the MSFS fuel system (CPIOM-F fuel monitoring):
 * An MSFS pump or valve keeps running or moving with its electrical circuit switched off, so the failures hold the MSFS
 * pump and valve switches instead (FailableFuelSwitchesDriver):
 * - A failed feed pump stops: its MSFS pump switch is held off, while its pb-sw (the connection of the pump circuit to
 *   its bus) stays where the flight crew put it. The FAULT light of the pb-sw,
 *   the amber pump on the SD FUEL page and the FUEL FEED TK n MAIN (STBY) PMP FAULT alerts follow the low pressure
 *   computed here. The other pump of the tank, or the gravity feed pump of the MSFS fuel system when both are failed,
 *   still feeds the engine.
 * - A jammed crossfeed valve keeps its position whatever its CROSSFEED pb-sw is: the pb-sw only sets a selection L:var,
 *   which is copied to the MSFS valve switch unless the valve is jammed. The valve is abnormal once its position
 *   disagrees with its CROSSFEED pb-sw longer than its travel time.
 */
export class FuelPumpsAndValves implements Instrument {
  /** The crossfeed valves travel in 3 s (flight_model.cfg OpeningTime): a disagreement longer than 5 s is abnormal */
  private static readonly CROSSFEED_DISAGREE_CONFIRM_S = 5;

  private readonly pumps: FailableFuelSwitchesDriver;

  private readonly valves: FailableFuelSwitchesDriver;

  private readonly crossFeedDisagreeConfirms = A380_CROSSFEED_VALVES.map(
    () => new NXLogicConfirmNode(FuelPumpsAndValves.CROSSFEED_DISAGREE_CONFIRM_S, true),
  );

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failures: FailureStates,
    fuelPumps: FuelSwitchAccess = msfsFuelPumpAccess,
    fuelValves: FuelSwitchAccess = msfsFuelValveAccess,
  ) {
    const isFailureActive = (failure: number) => this.failures.isActive(failure);
    this.pumps = new FailableFuelSwitchesDriver(
      A380_FEED_PUMPS.map(({ failure, pump }): FailableFuelSwitch => ({ failure, index: pump, effect: 'off' })),
      isFailureActive,
      fuelPumps,
    );
    this.valves = new FailableFuelSwitchesDriver(
      A380_CROSSFEED_VALVES.map(
        ({ failure, valve, selectionVar }): FailableFuelSwitch => ({
          failure,
          index: valve,
          effect: 'jam',
          selectionVar,
        }),
      ),
      isFailureActive,
      fuelValves,
    );
  }

  public init(): void {
    // nothing to initialise: the CROSSFEED selections are taken from the MSFS valve switches on the first update
  }

  public onUpdate(): void {
    const deltaTime = this.sysHost.deltaTime;
    this.pumps.update(deltaTime);
    this.valves.update(deltaTime);

    for (const { tank, kind, pump, circuit } of A380_FEED_PUMPS) {
      const lowPressure = isFeedPumpLowPressure(
        SimVar.GetSimVarValue(`A:CIRCUIT CONNECTION ON:${circuit}`, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, SimVarValueType.Bool) > 0,
      );
      SimVar.SetSimVarValue(feedPumpLowPressureVar(tank, kind), SimVarValueType.Bool, lowPressure);
    }

    A380_CROSSFEED_VALVES.forEach(({ number, valve, selectionVar }, index) => {
      const disagree = isCrossFeedValveDisagree(
        SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE OPEN:${valve}`, SimVarValueType.PercentOver100),
        SimVar.GetSimVarValue(selectionVar, SimVarValueType.Bool) > 0,
      );
      const abnormal = this.crossFeedDisagreeConfirms[index].write(disagree, deltaTime);
      SimVar.SetSimVarValue(crossFeedValveAbnormalVar(number), SimVarValueType.Bool, abnormal);
    });
  }
}
