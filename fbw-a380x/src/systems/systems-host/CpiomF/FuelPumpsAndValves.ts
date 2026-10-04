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

/**
 * A transfer pump of the MSFS fuel system (flight_model.cfg [FUEL_SYSTEM]). The FQMS starts and stops it: the MSFS
 * triggers fired by CpiomF/LegacyFuel (StartPump/StopPump) set its MSFS pump switch. Its pb-sw connects its circuit to
 * the bus (A:CIRCUIT CONNECTION ON).
 */
export interface A380TransferPump {
  /** The name of its pb-sw and ECAM alert, e.g. L OUTR TK, L MID TK FWD, TRIM TK L */
  name: string;
  /** The failure of the pump */
  failure: number;
  /** The MSFS pump number (Pump.N), the index of FUELSYSTEM PUMP SWITCH and ACTIVE */
  pump: number;
  /** The circuit (circuit.N of systems.cfg, CIRCUIT_FUEL_PUMP:<pump Index>) that its pb-sw connects */
  circuit: number;
  /** The MSFS tank the pump is in (Tank.N, the index of FUELSYSTEM TANK QUANTITY) */
  tank: number;
  /** The L:var of the FAULT light of its pb-sw (isTransferPumpFaulty, confirmed) */
  faultVar: string;
}

/**
 * The transfer pumps that the FBW fuel transfers run (flight_model.cfg Trigger.1-46 StartPump): outer, mid fwd, inner fwd
 * and trim tank pumps. The aft gallery pumps (MID/INR TK AFT) are never started in the simulation, so they have no
 * failure.
 */
export const A380_TRANSFER_PUMPS: readonly A380TransferPump[] = [
  // Pump.9 LeftOuterTankPump (Index 9), Tank.1 LeftOuter
  {
    name: 'L OUTR TK',
    failure: A380Failure.FuelLeftOuterTankPump,
    pump: 9,
    circuit: 70,
    tank: 1,
    faultVar: 'L:A380X_FUEL_L_OUTR_TK_PMP_FAULT',
  },
  // Pump.14 RightOuterTankPump (Index 14), Tank.10 RightOuter
  {
    name: 'R OUTR TK',
    failure: A380Failure.FuelRightOuterTankPump,
    pump: 14,
    circuit: 75,
    tank: 10,
    faultVar: 'L:A380X_FUEL_R_OUTR_TK_PMP_FAULT',
  },
  // Pump.10 LeftMidTankPumpFwd (Index 10), Tank.3 LeftMid
  {
    name: 'L MID TK FWD',
    failure: A380Failure.FuelLeftMidTankFwdPump,
    pump: 10,
    circuit: 71,
    tank: 3,
    faultVar: 'L:A380X_FUEL_L_MID_TK_FWD_PMP_FAULT',
  },
  // Pump.15 RightMidTankPumpFwd (Index 15), Tank.8 RightMid
  {
    name: 'R MID TK FWD',
    failure: A380Failure.FuelRightMidTankFwdPump,
    pump: 15,
    circuit: 76,
    tank: 8,
    faultVar: 'L:A380X_FUEL_R_MID_TK_FWD_PMP_FAULT',
  },
  // Pump.12 LeftInnerTankPumpFwd (Index 12), Tank.4 LeftInner
  {
    name: 'L INR TK FWD',
    failure: A380Failure.FuelLeftInnerTankFwdPump,
    pump: 12,
    circuit: 73,
    tank: 4,
    faultVar: 'L:A380X_FUEL_L_INR_TK_FWD_PMP_FAULT',
  },
  // Pump.13 RightInnerTankPumpFwd (Index 17), Tank.7 RightInner
  {
    name: 'R INR TK FWD',
    failure: A380Failure.FuelRightInnerTankFwdPump,
    pump: 13,
    circuit: 78,
    tank: 7,
    faultVar: 'L:A380X_FUEL_R_INR_TK_FWD_PMP_FAULT',
  },
  // Pump.19 TrimTankPumpLeft (Index 19), Tank.11 Trim
  {
    name: 'TRIM TK L',
    failure: A380Failure.FuelTrimTankLeftPump,
    pump: 19,
    circuit: 80,
    tank: 11,
    faultVar: 'L:A380X_FUEL_TRIM_TK_L_PMP_FAULT',
  },
  // Pump.20 TrimTankPumpRight (Index 20), Tank.11 Trim
  {
    name: 'TRIM TK R',
    failure: A380Failure.FuelTrimTankRightPump,
    pump: 20,
    circuit: 81,
    tank: 11,
    faultVar: 'L:A380X_FUEL_TRIM_TK_R_PMP_FAULT',
  },
];

/**
 * A tank holding less than this, in gallons, is empty: the FQMS stops its transfer pumps (LegacyFuel fires the
 * xxxTankEmpty triggers below 0.1 gal)
 */
export const TRANSFER_TANK_EMPTY_GAL = 0.1;

/**
 * Whether a transfer pump is faulty, the FAULT light of its pb-sw: it "Comes on: When the transfer pump is failed, or is
 * abnormally on [...] The FAULT light goes off, when the flight crew sets the [...] pb-sw to OFF" (A380 FCOM DSC-28-20,
 * a380_fcom.txt l.57853-57869 and l.57914-57930), and the "Failed, or Running, when the associated tank is empty" part
 * of the triggering conditions of its FUEL ... PMP FAULT alert (PRO-ABN-ECAM-10-28, l.151638-151640, l.153692-153700).
 * A failed pump is faulty whether or not the FQMS runs it at that time (the FCOM says "failed", not "at low pressure"
 * as for the feed pumps, l.57802): the fault shows as soon as the pump fails, not only during a transfer. A pump that
 * MSFS does not run in an empty tank is no fault.
 * @param pbOn whether the pump pb-sw is ON (its circuit connected to the bus)
 * @param failed whether the pump is failed (its flyPad failure)
 * @param running whether MSFS runs the pump (FUELSYSTEM PUMP ACTIVE)
 * @param tankQuantityGal the fuel in the tank of the pump, in gallons
 */
export function isTransferPumpFaulty(
  pbOn: boolean,
  failed: boolean,
  running: boolean,
  tankQuantityGal: number,
): boolean {
  const runningEmpty = running && tankQuantityGal < TRANSFER_TANK_EMPTY_GAL;
  return pbOn && (failed || runningEmpty);
}

/**
 * What an MSFS fuel trigger does to a transfer pump when it changes (flight_model.cfg [FUEL_SYSTEM] Trigger.N
 * EffectTrue / EffectFalse StartPump / StopPump): CpiomF/LegacyFuel, the FQMS of the simulation, toggles the triggers
 */
export interface FqmsPumpEffect {
  /** The trigger (Trigger.N, the index of FUELSYSTEM TRIGGER STATUS and FUELSYSTEM_TRIGGER_* events) */
  trigger: number;
  /** The trigger change that applies the effect: true for EffectTrue (becomes active), false for EffectFalse */
  whenActive: boolean;
  /** The MSFS pump (Pump.N) */
  pump: number;
  /** StartPump (true) or StopPump (false) */
  start: boolean;
}

/**
 * The effects of some triggers on some pumps (every trigger on every pump, in this order)
 * @param triggers the triggers
 * @param whenActive true for EffectTrue, false for EffectFalse
 * @param start StartPump (true) or StopPump (false)
 * @param pumps the pumps
 */
function fqmsPumpEffects(triggers: number[], whenActive: boolean, start: boolean, pumps: number[]): FqmsPumpEffect[] {
  const effects: FqmsPumpEffect[] = [];
  for (const trigger of triggers) {
    for (const pump of pumps) {
      effects.push({ trigger, whenActive, pump, start });
    }
  }
  return effects;
}

/**
 * The StartPump and StopPump effects of the triggers on the transfer pumps of A380_TRANSFER_PUMPS, in the order of
 * flight_model.cfg (checked against it by FuelPumpsAndValves.spec.ts)
 */
export const A380_FQMS_PUMP_EFFECTS: readonly FqmsPumpEffect[] = [
  // Trigger.1-4 InnerandMidTanksXferFeed1-4Start: the inner tank fwd pumps
  ...fqmsPumpEffects([1, 2, 3, 4], true, true, [12, 13]),
  // Trigger.11 InnerTankLeftEmpty: the left mid tank fwd pump instead of the left inner tank fwd pump, and back
  ...fqmsPumpEffects([11], true, false, [12]),
  ...fqmsPumpEffects([11], true, true, [10]),
  ...fqmsPumpEffects([11], false, false, [10]),
  ...fqmsPumpEffects([11], false, true, [12]),
  // Trigger.12 InnerTankRightEmpty: the same on the right
  ...fqmsPumpEffects([12], true, false, [13]),
  ...fqmsPumpEffects([12], true, true, [15]),
  ...fqmsPumpEffects([12], false, false, [15]),
  ...fqmsPumpEffects([12], false, true, [13]),
  // Trigger.22 / 23 MidTankLeft(Right)Empty
  ...fqmsPumpEffects([22], true, false, [10]),
  ...fqmsPumpEffects([23], true, false, [15]),
  // Trigger.24-27 TrimTankTransferToFeedTank1-4
  ...fqmsPumpEffects([24, 25, 26, 27], true, true, [19, 20]),
  // Trigger.34 TrimTankEmpty
  ...fqmsPumpEffects([34], true, false, [19, 20]),
  // Trigger.35-38 OuterTanksTransferToFeedTank...Start
  ...fqmsPumpEffects([35, 36, 37, 38], true, true, [9, 14]),
  // Trigger.43 / 44 CGControlTransferStart / End
  ...fqmsPumpEffects([43], true, true, [19, 20]),
  ...fqmsPumpEffects([44], true, false, [19, 20]),
  // Trigger.45 / 46 OuterTankLeft(Right)Empty
  ...fqmsPumpEffects([45], true, false, [9]),
  ...fqmsPumpEffects([46], true, false, [14]),
];

/** The triggers of A380_FQMS_PUMP_EFFECTS */
const FQMS_PUMP_TRIGGERS: readonly number[] = A380_FQMS_PUMP_EFFECTS.map(({ trigger }) => trigger).filter(
  (trigger, index, triggers) => triggers.indexOf(trigger) === index,
);

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
 * - A failed transfer pump (outer, mid fwd, inner fwd, trim tank) stops: its MSFS pump switch is held off whatever the
 *   FQMS commands, so the fuel of its tank stays there (the other pumps of the same transfer still run: the FQMS
 *   shut-off of the symmetric pump is not simulated). Its FAULT light and alerts follow isTransferPumpFaulty: they show
 *   as soon as it fails, with or without a transfer. While it is failed, the FQMS commands (the trigger edges of
 *   A380_FQMS_PUMP_EFFECTS) are followed, so that the repaired pump returns to what the FQMS wants now.
 */
export class FuelPumpsAndValves implements Instrument {
  /** The crossfeed valves travel in 3 s (flight_model.cfg OpeningTime): a disagreement longer than 5 s is abnormal */
  private static readonly CROSSFEED_DISAGREE_CONFIRM_S = 5;

  private readonly pumps: FailableFuelSwitchesDriver;

  private readonly valves: FailableFuelSwitchesDriver;

  /** The transfer pumps, in the order of A380_TRANSFER_PUMPS */
  private readonly transferPumps: FailableFuelSwitchesDriver;

  /**
   * A transfer pump seen faulty longer than this, in seconds, is faulty (design choice: the time for the FQMS to stop the
   * pump of a tank that just became empty)
   */
  public static readonly TRANSFER_PUMP_FAULT_CONFIRM_S = 2;

  private readonly transferPumpFaultConfirms = A380_TRANSFER_PUMPS.map(
    () => new NXLogicConfirmNode(FuelPumpsAndValves.TRANSFER_PUMP_FAULT_CONFIRM_S, true),
  );

  private readonly crossFeedDisagreeConfirms = A380_CROSSFEED_VALVES.map(
    () => new NXLogicConfirmNode(FuelPumpsAndValves.CROSSFEED_DISAGREE_CONFIRM_S, true),
  );

  /** The FUELSYSTEM TRIGGER STATUS of the FQMS_PUMP_TRIGGERS at the last update, null before the first update */
  private fqmsTriggerStates: boolean[] | null = null;

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
    this.transferPumps = new FailableFuelSwitchesDriver(
      A380_TRANSFER_PUMPS.map(({ failure, pump }): FailableFuelSwitch => ({ failure, index: pump, effect: 'off' })),
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
    this.followFqmsCommandsOfFailedTransferPumps();
    this.transferPumps.update(deltaTime);
    this.valves.update(deltaTime);

    for (const { tank, kind, pump, circuit } of A380_FEED_PUMPS) {
      const lowPressure = isFeedPumpLowPressure(
        SimVar.GetSimVarValue(`A:CIRCUIT CONNECTION ON:${circuit}`, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, SimVarValueType.Bool) > 0,
      );
      SimVar.SetSimVarValue(feedPumpLowPressureVar(tank, kind), SimVarValueType.Bool, lowPressure);
    }

    A380_TRANSFER_PUMPS.forEach(({ failure, pump, circuit, tank, faultVar }, index) => {
      const faulty = isTransferPumpFaulty(
        SimVar.GetSimVarValue(`A:CIRCUIT CONNECTION ON:${circuit}`, SimVarValueType.Bool) > 0,
        this.failures.isActive(failure),
        SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL),
      );
      SimVar.SetSimVarValue(
        faultVar,
        SimVarValueType.Bool,
        this.transferPumpFaultConfirms[index].write(faulty, deltaTime),
      );
    });

    A380_CROSSFEED_VALVES.forEach(({ number, valve, selectionVar }, index) => {
      const disagree = isCrossFeedValveDisagree(
        SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE OPEN:${valve}`, SimVarValueType.PercentOver100),
        SimVar.GetSimVarValue(selectionVar, SimVarValueType.Bool) > 0,
      );
      const abnormal = this.crossFeedDisagreeConfirms[index].write(disagree, deltaTime);
      SimVar.SetSimVarValue(crossFeedValveAbnormalVar(number), SimVarValueType.Bool, abnormal);
    });
  }

  /**
   * Gives the FQMS commands to the failed transfer pumps: the MSFS triggers toggled by CpiomF/LegacyFuel start and stop
   * the transfer pumps (A380_FQMS_PUMP_EFFECTS). A StopPump does not move the switch of a failed pump, which is already
   * held off, so the driver would switch the repaired pump back on although the FQMS stopped it (the trim tank pumps at
   * the end of a CG control transfer would then empty the trim tank). Each trigger change applies its effects here.
   */
  private followFqmsCommandsOfFailedTransferPumps(): void {
    const triggerStates = FQMS_PUMP_TRIGGERS.map(
      (trigger) => SimVar.GetSimVarValue(`A:FUELSYSTEM TRIGGER STATUS:${trigger}`, SimVarValueType.Bool) > 0,
    );
    const previousStates = this.fqmsTriggerStates;
    this.fqmsTriggerStates = triggerStates;
    if (previousStates === null) {
      return;
    }

    FQMS_PUMP_TRIGGERS.forEach((trigger, triggerIndex) => {
      const active = triggerStates[triggerIndex];
      if (active === previousStates[triggerIndex]) {
        return;
      }
      for (const effect of A380_FQMS_PUMP_EFFECTS) {
        if (effect.trigger !== trigger || effect.whenActive !== active) {
          continue;
        }
        const pumpIndex = A380_TRANSFER_PUMPS.findIndex(({ pump }) => pump === effect.pump);
        if (pumpIndex >= 0 && this.failures.isActive(A380_TRANSFER_PUMPS[pumpIndex].failure)) {
          this.transferPumps.setAutomaticSelection(pumpIndex, effect.start);
        }
      }
    });
  }
}
