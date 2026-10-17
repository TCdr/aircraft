// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380 manual fuel transfers, selected with the INR(MID)(OUTR) TK XFR and TRIM TK XFR pb-sws of the FUEL overhead
 * panel, on the MSFS fuel system of flight_model.cfg [FUEL_SYSTEM] (the Pump.N, Valve.N and Junction.N numbers below).
 */

/** 1 (released) AUTO, 0 MAN */
export const OUTR_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_OUTRTK_XFR_PB_IS_AUTO';
/** 1 (released) AUTO, 0 MAN */
export const MID_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_MIDTK_XFR_PB_IS_AUTO';
/** 1 (released) AUTO, 0 MAN */
export const INR_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_INRTK_XFR_PB_IS_AUTO';
/** 1 (released) AUTO, 0 FWD (the manual forward transfer) */
export const TRIM_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_TRIMTK_XFR_PB_IS_AUTO';

/** The four transfer pb-sws, all set to their normal position AUTO at flight load */
export const FUEL_XFR_PB_IS_AUTO_VARS: readonly string[] = [
  OUTR_TK_XFR_PB_IS_AUTO_VAR,
  MID_TK_XFR_PB_IS_AUTO_VAR,
  INR_TK_XFR_PB_IS_AUTO_VAR,
  TRIM_TK_XFR_PB_IS_AUTO_VAR,
];

/** Which manual transfers the flight crew selected (true: MAN, or FWD for the trim tank) */
export interface ManualTransferSelection {
  outer: boolean;
  mid: boolean;
  inner: boolean;
  trimForward: boolean;
}

/** Every transfer pb-sw in AUTO */
export const NO_MANUAL_TRANSFER: Readonly<ManualTransferSelection> = {
  outer: false,
  mid: false,
  inner: false,
  trimForward: false,
};

function isAnyManualTransferSelected(selection: ManualTransferSelection): boolean {
  return selection.outer || selection.mid || selection.inner || selection.trimForward;
}

/** A transfer pump that a manual transfer runs: its MSFS pump and the circuit that its pb-sw connects */
export interface ManualTransferPump {
  /** The MSFS pump number (Pump.N), the index of the FUELSYSTEM_PUMP_ON/OFF events and FUELSYSTEM PUMP SWITCH */
  pump: number;
  /** The circuit (circuit.N of systems.cfg, CIRCUIT_FUEL_PUMP:<pump Index>) connected by the pump pb-sw */
  circuit: number;
}

// The transfer pumps (flight_model.cfg Pump.N, systems.cfg circuit.N), checked against the files by the spec
/** Pump.9 LeftOuterTankPump */
export const L_OUTR_TK_PUMP: ManualTransferPump = { pump: 9, circuit: 70 };
/** Pump.14 RightOuterTankPump */
export const R_OUTR_TK_PUMP: ManualTransferPump = { pump: 14, circuit: 75 };
/** Pump.11 LeftMidTankPumpAft */
export const L_MID_TK_AFT_PUMP: ManualTransferPump = { pump: 11, circuit: 72 };
/** Pump.16 RightMidTankPumpAft */
export const R_MID_TK_AFT_PUMP: ManualTransferPump = { pump: 16, circuit: 77 };
/** Pump.17 LeftInnerTankPumpAft */
export const L_INR_TK_AFT_PUMP: ManualTransferPump = { pump: 17, circuit: 74 };
/** Pump.18 RightInnerTankPumpAft */
export const R_INR_TK_AFT_PUMP: ManualTransferPump = { pump: 18, circuit: 79 };
/** Pump.19 TrimTankPumpLeft */
export const TRIM_TK_L_PUMP: ManualTransferPump = { pump: 19, circuit: 80 };
/** Pump.20 TrimTankPumpRight */
export const TRIM_TK_R_PUMP: ManualTransferPump = { pump: 20, circuit: 81 };

/**
 * Every transfer pump of the MSFS fuel system (Pump.9-20: outer, mid fwd/aft, inner fwd/aft and trim tank pumps). While
 * the manual transfers are in control, the pumps of no selected transfer are stopped: with the INR TK XFR pb-sw in MAN,
 * all automatic transfers are inhibited.
 */
export const ALL_TRANSFER_PUMPS: readonly number[] = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/**
 * The transfer valves of the MSFS fuel system that the automatic transfers (the flight_model.cfg triggers fired by
 * CpiomF/LegacyFuel) open and close: Valve.5-45 (feed tank fwd and aft transfer valves, transfer tank fwd and aft
 * transfer valves, trim tank inlet valve 1, trim line isolation valves) and Valve.59 (trim tank inlet valve 2). Not the
 * crossfeed (46-49), APU (50-51), emergency outer transfer (52-53), refuel/defuel (54-56) and jettison (57-58) valves,
 * which the flight crew or other modules control. Valve.37 and 40 (left and right inner tank aft transfer valves 2) are
 * left out: they are open in the flight files and only the InnerTankLeft(Right)Empty triggers close them, as the refuel
 * logic of CpiomF/LegacyFuel does (VALVES_TO_SKIP).
 */
export const ALL_TRANSFER_VALVES: readonly number[] = [
  5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35,
  36, 38, 39, 41, 42, 43, 44, 45, 59,
];

/** Valve.37 LeftInnerAftTransferValve2, Valve.40 RightInnerAftTransferValve2: opened when needed, never closed here */
export const INNER_TANK_AFT_INLET_VALVES: readonly number[] = [37, 40];

/** flight_model.cfg Trigger.1-46 */
const NUMBER_OF_FUEL_TRIGGERS = 46;

/** The MSFS pumps, valves and junction options that make up the selected manual transfers */
export interface FuelLineup {
  /** Pump.N */
  pumps: number[];
  /** Valve.N */
  valves: number[];
  /** [Junction.N, option] */
  junctions: [number, number][];
}

/** Every transfer pump stopped, every transfer valve closed */
const EMPTY_LINEUP: Readonly<FuelLineup> = { pumps: [], valves: [], junctions: [] };

// Junctions of flight_model.cfg and the options used by the manual transfers
/** Junction.7 FwdGalleryJunction, option 1: to the feed tank fwd transfer valves 1 (the outer tank transfer route) */
const FWD_GALLERY_TO_FEED_TANK_VALVES_1: [number, number] = [7, 1];
/** Junction.8 FeedTanks2_3Junction1, option 1: to FeedTank2(3)FwdTransferValve1_1 */
const FEED_TANKS_2_3_JUNCTION_1_TO_VALVES_1_1: [number, number] = [8, 1];
/** Junction.10 AftGalleryJunction1, option 1: to the L and R inner tank aft transfer valves 1 (into the inner tanks) */
const AFT_GALLERY_TO_INNER_TANKS: [number, number] = [10, 1];
/** Junction.10 AftGalleryJunction1, option 3: to AftGalleryJunction2 (towards the feed tanks) */
const AFT_GALLERY_TO_AFT_GALLERY_JUNCTION_2: [number, number] = [10, 3];
/** Junction.11 AftGalleryJunction2, option 1: to the feed tank aft transfer valves 1 */
const AFT_GALLERY_JUNCTION_2_TO_FEED_TANK_VALVES_1: [number, number] = [11, 1];

/**
 * Valve.5 FeedTank1FwdTransferValve1, Valve.6 FeedTank2FwdTransferValve1_1, Valve.7 FeedTank3FwdTransferValve1_1,
 * Valve.10 FeedTank4FwdTransferValve1
 */
const FEED_TANK_FWD_TRANSFER_VALVES_1: readonly number[] = [5, 6, 7, 10];
/** Valve.23-26 FeedTank1(2)(3)(4)AftTransferValve1 */
const FEED_TANK_AFT_TRANSFER_VALVES_1: readonly number[] = [23, 24, 25, 26];
/** Valve.31 LeftInnerAftTransferValve1, Valve.34 RightInnerAftTransferValve1 (then Valve.37/40 into the inner tanks) */
const INNER_TANK_AFT_TRANSFER_VALVES_1: readonly number[] = [31, 34];
/** Valve.45 TrimLineIsolationValveAft: the trim line to the aft gallery */
const TRIM_LINE_ISOLATION_VALVE_AFT = 45;

/**
 * The MSFS lineup of the selected manual transfers.
 *
 * - OUTR TK XFR MAN: with both outer tank pump pb-sws ON, the outer tank pumps transfer the fuel through the
 *   forward gallery into the feed tanks. With an outer tank pump pb-sw OFF the transfer is by gravity through the
 *   emergency outer tank transfer valves, which CpiomF/FuelEmerOuterTransfer opens. The gravity flow through the
 *   galleries into FEED TK 2 and 3 is not simulated (the MSFS lines out of the outer tanks go to the pumps and the
 *   emergency valves only).
 * - INR (MID) TK XFR MAN: the L(R) INR(MID) TK AFT pumps transfer the fuel through the aft gallery into the feed tanks.
 * - TRIM TK XFR FWD: the trim tank pumps transfer the fuel through the trim tank isolation valve and the aft gallery
 *   into the inner tanks.
 *
 * The inner and mid transfers and the trim tank forward transfer share the aft gallery (Junction.10 has one option at a
 * time). The crew procedures normally set the inner and mid manual transfers back to AUTO before the trim tank forward
 * transfer, but select them all together when all feed tank levels are low. Design choice: with an inner or mid manual
 * transfer selected, the aft gallery goes to the feed tanks and the trim tank fuel goes there too (where the next inner
 * tank transfer would take it anyway).
 *
 * A pump whose pb-sw is OFF does not run. A transfer stops when its tank is empty (the MSFS pumps need fuel in their
 * tank), as on the aircraft; the feed tanks only receive fuel (no lineup opens a valve out of a feed tank).
 * @param selection the selected manual transfers
 * @param isPumpPbOn whether the pb-sw of a pump is ON (its circuit connected)
 */
export function manualTransferLineup(
  selection: ManualTransferSelection,
  isPumpPbOn: (pump: ManualTransferPump) => boolean,
): FuelLineup {
  const pumps: number[] = [];
  const valves: number[] = [];
  const junctions: [number, number][] = [];
  const runPumps = (...transferPumps: ManualTransferPump[]): void => {
    for (const transferPump of transferPumps) {
      if (isPumpPbOn(transferPump)) {
        pumps.push(transferPump.pump);
      }
    }
  };

  if (selection.outer && isPumpPbOn(L_OUTR_TK_PUMP) && isPumpPbOn(R_OUTR_TK_PUMP)) {
    runPumps(L_OUTR_TK_PUMP, R_OUTR_TK_PUMP);
    valves.push(...FEED_TANK_FWD_TRANSFER_VALVES_1);
    junctions.push(FWD_GALLERY_TO_FEED_TANK_VALVES_1, FEED_TANKS_2_3_JUNCTION_1_TO_VALVES_1_1);
  }

  const aftGalleryToFeedTanks = selection.inner || selection.mid;
  if (selection.inner) {
    runPumps(L_INR_TK_AFT_PUMP, R_INR_TK_AFT_PUMP);
  }
  if (selection.mid) {
    runPumps(L_MID_TK_AFT_PUMP, R_MID_TK_AFT_PUMP);
  }
  if (selection.trimForward) {
    runPumps(TRIM_TK_L_PUMP, TRIM_TK_R_PUMP);
    valves.push(TRIM_LINE_ISOLATION_VALVE_AFT);
    if (!aftGalleryToFeedTanks) {
      valves.push(...INNER_TANK_AFT_TRANSFER_VALVES_1, ...INNER_TANK_AFT_INLET_VALVES);
      junctions.push(AFT_GALLERY_TO_INNER_TANKS);
    }
  }
  if (aftGalleryToFeedTanks) {
    valves.push(...FEED_TANK_AFT_TRANSFER_VALVES_1);
    junctions.push(AFT_GALLERY_TO_AFT_GALLERY_JUNCTION_2, AFT_GALLERY_JUNCTION_2_TO_FEED_TANK_VALVES_1);
  }

  return { pumps, valves, junctions };
}

/**
 * Whether a manual outer tank transfer is done by gravity through the emergency outer tank transfer valves: OUTR TK XFR
 * in MAN with any outer tank pump pb-sw OFF, which makes the emergency outer tank transfer valves open automatically.
 * @param outerTransferMan whether the OUTR TK XFR pb-sw is in MAN
 * @param leftOuterPumpPbOn whether the L OUTR TK pb-sw is ON
 * @param rightOuterPumpPbOn whether the R OUTR TK pb-sw is ON
 */
export function isOuterTransferByGravity(
  outerTransferMan: boolean,
  leftOuterPumpPbOn: boolean,
  rightOuterPumpPbOn: boolean,
): boolean {
  return outerTransferMan && (!leftOuterPumpPbOn || !rightOuterPumpPbOn);
}

/** Identifies a lineup, to see when it changes */
function lineupKey(lineup: FuelLineup): string {
  const sorted = (numbers: number[]) => numbers.slice().sort((a, b) => a - b);
  return `${sorted(lineup.pumps).join(',')}|${sorted(lineup.valves).join(',')}|${lineup.junctions
    .map(([junction, option]) => `${junction}.${option}`)
    .sort()
    .join(',')}`;
}

/** Reads and commands the MSFS fuel system for the manual transfers */
export interface ManualTransferFuelSystem {
  /** Reads the *_PB_IS_AUTO L:var */
  isTransferPbAuto(pbVar: string): boolean;
  /** Writes the *_PB_IS_AUTO L:var */
  setTransferPbAuto(pbVar: string, auto: boolean): void;
  /** A:CIRCUIT CONNECTION ON of the pump circuit */
  isPumpPbOn(circuit: number): boolean;
  /** FUELSYSTEM TRIGGER STATUS */
  isTriggerActive(trigger: number): boolean;
  /** FUELSYSTEM_TRIGGER_OFF */
  setTriggerOff(trigger: number): void;
  /** FUELSYSTEM PUMP SWITCH */
  isPumpOn(pump: number): boolean;
  setPump(pump: number, on: boolean): void;
  /** FUELSYSTEM VALVE SWITCH */
  isValveOpen(valve: number): boolean;
  setValve(valve: number, open: boolean): void;
  /** FUELSYSTEM JUNCTION SETTING */
  junctionOption(junction: number): number;
  /** FUELSYSTEM_JUNCTION_SET */
  setJunction(junction: number, option: number): void;
}

enum ManualTransferPhase {
  /** No manual transfer: the automatic transfers (CpiomF/LegacyFuel) are in control */
  Idle,
  /** The automatic transfer triggers were switched off, waiting for MSFS to apply it */
  Entering,
  Active,
  /** The last manual transfer was deselected: pumps stopped and valves closed, waiting for MSFS to apply it */
  Leaving,
}

/**
 * The manual fuel transfers of the FQMS simulation (CPIOM-F), driven from CpiomF/LegacyFuel.
 *
 * While no transfer pb-sw is in MAN (FWD), nothing is commanded and the automatic transfers run as before. When one is
 * selected, the automatic transfers stop until the manual transfer pb-sw is deselected (on the aircraft some, or all
 * with INR TK XFR in MAN, are inhibited during a manual transfer). The MSFS triggers of the automatic transfers are
 * switched off, then every transfer pump and transfer valve is set to the lineup of the selected manual transfers
 * (manualTransferLineup), again whenever that lineup changes (a pb-sw selected or deselected, a pump pb-sw switched).
 * When the last one is deselected, every transfer pump is stopped and every transfer valve closed, and the automatic
 * transfers start again from all their triggers off, as after a refuel. Fuel jettison and refuel suspend the manual
 * transfers.
 */
export class FuelManualTransfer {
  /** How long MSFS takes to apply the trigger, pump and valve commands, in milliseconds */
  public static readonly COMMAND_SETTLE_TIME_MS = 500;

  private phase = ManualTransferPhase.Idle;

  private settleTimeLeftMs = 0;

  /** The key of the lineup last commanded, null while none is */
  private commandedLineupKey: string | null = null;

  constructor(private readonly fuelSystem: ManualTransferFuelSystem) {}

  /**
   * Sets the transfer pb-sws to their normal position, AUTO (fuel transfers are fully automatic in normal operation).
   * Their L:vars are in no flight file: without this they read 0, MAN, at every flight load.
   */
  public init(): void {
    for (const pbVar of FUEL_XFR_PB_IS_AUTO_VARS) {
      this.fuelSystem.setTransferPbAuto(pbVar, true);
    }
  }

  public readSelection(): ManualTransferSelection {
    return {
      outer: !this.fuelSystem.isTransferPbAuto(OUTR_TK_XFR_PB_IS_AUTO_VAR),
      mid: !this.fuelSystem.isTransferPbAuto(MID_TK_XFR_PB_IS_AUTO_VAR),
      inner: !this.fuelSystem.isTransferPbAuto(INR_TK_XFR_PB_IS_AUTO_VAR),
      trimForward: !this.fuelSystem.isTransferPbAuto(TRIM_TK_XFR_PB_IS_AUTO_VAR),
    };
  }

  /**
   * @param deltaTimeMs the time since the last update, in milliseconds
   * @param suspended whether a fuel jettison or a refuel is in progress: no manual transfer then
   * @returns whether the manual transfers control the transfer pumps and valves (the automatic transfers wait)
   */
  public update(deltaTimeMs: number, suspended: boolean): boolean {
    const selection = suspended ? NO_MANUAL_TRANSFER : this.readSelection();
    const selected = isAnyManualTransferSelected(selection);
    this.settleTimeLeftMs -= deltaTimeMs;

    switch (this.phase) {
      case ManualTransferPhase.Idle:
        if (!selected) {
          return false;
        }
        this.switchAutomaticTransferTriggersOff();
        this.phase = ManualTransferPhase.Entering;
        this.settleTimeLeftMs = FuelManualTransfer.COMMAND_SETTLE_TIME_MS;
        return true;

      case ManualTransferPhase.Entering:
        if (this.settleTimeLeftMs > 0) {
          return true;
        }
        this.phase = ManualTransferPhase.Active;
        return this.updateActive(selection, selected);

      case ManualTransferPhase.Active:
        return this.updateActive(selection, selected);

      case ManualTransferPhase.Leaving:
        if (selected) {
          // Selected again before the end of the settle time
          this.phase = ManualTransferPhase.Active;
          return this.updateActive(selection, selected);
        }
        if (this.settleTimeLeftMs > 0) {
          return true;
        }
        this.phase = ManualTransferPhase.Idle;
        this.commandedLineupKey = null;
        return false;
    }
  }

  private updateActive(selection: ManualTransferSelection, selected: boolean): boolean {
    const lineup = selected
      ? manualTransferLineup(selection, ({ circuit }) => this.fuelSystem.isPumpPbOn(circuit))
      : EMPTY_LINEUP;
    const key = lineupKey(lineup);
    if (key !== this.commandedLineupKey) {
      this.commandLineup(lineup);
      this.commandedLineupKey = key;
    }
    if (!selected) {
      this.phase = ManualTransferPhase.Leaving;
      this.settleTimeLeftMs = FuelManualTransfer.COMMAND_SETTLE_TIME_MS;
    }
    return true;
  }

  /** Only the triggers go off: the valves they opened and the pumps they started stay as they are */
  private switchAutomaticTransferTriggersOff(): void {
    for (let trigger = 1; trigger <= NUMBER_OF_FUEL_TRIGGERS; trigger++) {
      if (this.fuelSystem.isTriggerActive(trigger)) {
        this.fuelSystem.setTriggerOff(trigger);
      }
    }
  }

  /**
   * Sets every transfer pump and transfer valve to a lineup: the pumps and valves of the lineup on and open, the others
   * stopped and closed (Valve.37 and 40 are only opened). Only the switches that differ are commanded, once per lineup
   * change, so that a failed pump held off by CpiomF/FuelPumpsAndValves is not fought.
   */
  private commandLineup(lineup: FuelLineup): void {
    for (const pump of ALL_TRANSFER_PUMPS) {
      const on = lineup.pumps.includes(pump);
      if (this.fuelSystem.isPumpOn(pump) !== on) {
        this.fuelSystem.setPump(pump, on);
      }
    }
    for (const valve of ALL_TRANSFER_VALVES) {
      const open = lineup.valves.includes(valve);
      if (this.fuelSystem.isValveOpen(valve) !== open) {
        this.fuelSystem.setValve(valve, open);
      }
    }
    for (const valve of INNER_TANK_AFT_INLET_VALVES) {
      if (lineup.valves.includes(valve) && !this.fuelSystem.isValveOpen(valve)) {
        this.fuelSystem.setValve(valve, true);
      }
    }
    for (const [junction, option] of lineup.junctions) {
      if (this.fuelSystem.junctionOption(junction) !== option) {
        this.fuelSystem.setJunction(junction, option);
      }
    }
  }
}
