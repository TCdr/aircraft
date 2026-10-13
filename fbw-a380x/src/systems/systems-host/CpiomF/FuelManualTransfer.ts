// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380 manual fuel transfers, selected with the INR(MID)(OUTR) TK XFR and TRIM TK XFR pb-sws of the FUEL overhead panel
 * (A380 FCOM DSC-28-20, a380_fcom.txt l.57938-58035; DSC-28-40 MANUAL TRANSFERS, l.59862-59965), on the MSFS fuel system
 * of flight_model.cfg [FUEL_SYSTEM] (the Pump.N, Valve.N and Junction.N numbers below).
 */

/** The OUTR TK XFR pb-sw: 1 (released) AUTO, 0 MAN */
export const OUTR_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_OUTRTK_XFR_PB_IS_AUTO';
/** The MID TK XFR pb-sw: 1 (released) AUTO, 0 MAN */
export const MID_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_MIDTK_XFR_PB_IS_AUTO';
/** The INR TK XFR pb-sw: 1 (released) AUTO, 0 MAN */
export const INR_TK_XFR_PB_IS_AUTO_VAR = 'L:A380X_OVHD_FUEL_INRTK_XFR_PB_IS_AUTO';
/** The TRIM TK XFR pb-sw: 1 (released) AUTO, 0 FWD (the manual forward transfer, PRO-ABN l.149134, l.152772) */
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

/** No manual transfer selected: every transfer pb-sw in AUTO */
export const NO_MANUAL_TRANSFER: Readonly<ManualTransferSelection> = {
  outer: false,
  mid: false,
  inner: false,
  trimForward: false,
};

/** Whether any manual transfer is selected */
export function isAnyManualTransferSelected(selection: ManualTransferSelection): boolean {
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
/** Pump.9 LeftOuterTankPump (L OUTR TK pb-sw) */
export const L_OUTR_TK_PUMP: ManualTransferPump = { pump: 9, circuit: 70 };
/** Pump.14 RightOuterTankPump (R OUTR TK pb-sw) */
export const R_OUTR_TK_PUMP: ManualTransferPump = { pump: 14, circuit: 75 };
/** Pump.11 LeftMidTankPumpAft (L MID TK AFT pb-sw) */
export const L_MID_TK_AFT_PUMP: ManualTransferPump = { pump: 11, circuit: 72 };
/** Pump.16 RightMidTankPumpAft (R MID TK AFT pb-sw) */
export const R_MID_TK_AFT_PUMP: ManualTransferPump = { pump: 16, circuit: 77 };
/** Pump.17 LeftInnerTankPumpAft (L INR TK AFT pb-sw) */
export const L_INR_TK_AFT_PUMP: ManualTransferPump = { pump: 17, circuit: 74 };
/** Pump.18 RightInnerTankPumpAft (R INR TK AFT pb-sw) */
export const R_INR_TK_AFT_PUMP: ManualTransferPump = { pump: 18, circuit: 79 };
/** Pump.19 TrimTankPumpLeft (TRIM TK L pb-sw) */
export const TRIM_TK_L_PUMP: ManualTransferPump = { pump: 19, circuit: 80 };
/** Pump.20 TrimTankPumpRight (TRIM TK R pb-sw) */
export const TRIM_TK_R_PUMP: ManualTransferPump = { pump: 20, circuit: 81 };

/**
 * Every transfer pump of the MSFS fuel system (Pump.9-20: outer, mid fwd/aft, inner fwd/aft and trim tank pumps). While
 * the manual transfers are in control, the pumps of no selected transfer are stopped: "As long as the INR TK XFR pb-sw
 * is set to MAN, all automatic transfers are inhibited" (PRO-ABN-ECAM-10-28 FUEL INR TKs MAN XFR COMPLETED, l.151103-
 * 151104).
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

/** Valve.37 LeftInnerAftTransferValve2 and Valve.40 RightInnerAftTransferValve2: opened when needed, never closed here */
export const INNER_TANK_AFT_INLET_VALVES: readonly number[] = [37, 40];

/** The number of MSFS fuel triggers (flight_model.cfg Trigger.1-46) */
export const NUMBER_OF_FUEL_TRIGGERS = 46;

/** The MSFS pumps, valves and junction options that make up the selected manual transfers */
export interface FuelLineup {
  /** The MSFS pumps to run (Pump.N) */
  pumps: number[];
  /** The MSFS valves to open (Valve.N) */
  valves: number[];
  /** The junction options to set: [Junction.N, option] */
  junctions: [number, number][];
}

/** No manual transfer: every transfer pump stopped, every transfer valve closed */
export const EMPTY_LINEUP: Readonly<FuelLineup> = { pumps: [], valves: [], junctions: [] };

// Junctions of flight_model.cfg and the options used by the manual transfers
/** Junction.7 FwdGalleryJunction, option 1: to the feed tank forward transfer valves 1 (the outer tank transfer route) */
const FWD_GALLERY_TO_FEED_TANK_VALVES_1: [number, number] = [7, 1];
/** Junction.8 FeedTanks2_3Junction1, option 1: to FeedTank2(3)FwdTransferValve1_1 */
const FEED_TANKS_2_3_JUNCTION_1_TO_VALVES_1_1: [number, number] = [8, 1];
/** Junction.10 AftGalleryJunction1, option 1: to the left and right inner tank aft transfer valves 1 (into the inner tanks) */
const AFT_GALLERY_TO_INNER_TANKS: [number, number] = [10, 1];
/** Junction.10 AftGalleryJunction1, option 3: to AftGalleryJunction2 (towards the feed tanks) */
const AFT_GALLERY_TO_AFT_GALLERY_JUNCTION_2: [number, number] = [10, 3];
/** Junction.11 AftGalleryJunction2, option 1: to the feed tank aft transfer valves 1 */
const AFT_GALLERY_JUNCTION_2_TO_FEED_TANK_VALVES_1: [number, number] = [11, 1];

/** Valve.5 FeedTank1FwdTransferValve1, Valve.6 FeedTank2FwdTransferValve1_1, Valve.7 FeedTank3FwdTransferValve1_1, Valve.10 FeedTank4FwdTransferValve1 */
const FEED_TANK_FWD_TRANSFER_VALVES_1: readonly number[] = [5, 6, 7, 10];
/** Valve.23-26 FeedTank1(2)(3)(4)AftTransferValve1 */
const FEED_TANK_AFT_TRANSFER_VALVES_1: readonly number[] = [23, 24, 25, 26];
/** Valve.31 LeftInnerAftTransferValve1, Valve.34 RightInnerAftTransferValve1 (then Valve.37 and 40 into the inner tanks) */
const INNER_TANK_AFT_TRANSFER_VALVES_1: readonly number[] = [31, 34];
/** Valve.45 TrimLineIsolationValveAft: the trim line to the aft gallery */
const TRIM_LINE_ISOLATION_VALVE_AFT = 45;

/**
 * The MSFS lineup of the selected manual transfers.
 *
 * - OUTR TK XFR MAN: "If both outer tank pumps are running (L(R) OUTR TK PMP pb-sw are not set to OFF), the fuel
 *   transfers via the forward gallery, using the outer tank pumps" into the feed tanks (DSC-28-40 l.59885-59887); the
 *   outer tank pumps run for a manual transfer "except if any outer tank pump has been switched off" (DSC-28-20
 *   l.57837-57839). With an outer tank pump pb-sw OFF the transfer is by gravity through the emergency outer tank
 *   transfer valves (DSC-28-40 l.59898-59901, DSC-28-10 l.57573-57575): CpiomF/FuelEmerOuterTransfer opens them. The
 *   gravity flow through the galleries into FEED TK 2 and 3 (l.59905) is not simulated (the MSFS lines out of the
 *   outer tanks go to the pumps and the emergency valves only).
 * - INR (MID) TK XFR MAN: "Fuel transfers via the aft gallery, using the inner (mid) tank pumps" into the feed tanks
 *   (DSC-28-40 l.59951, l.59965), the L(R) INR(MID) TK AFT pumps (DSC-28-20 l.57874-57876).
 * - TRIM TK XFR FWD: "Fuel manually transfers from the trim tank to the inner tanks" (DSC-28-20 l.57984), "via the aft
 *   gallery, using the trim tank pumps" (DSC-28-40 l.59923-59924), through the trim tank isolation valve (DSC-28-10
 *   l.57565-57567).
 *
 * The inner and mid transfers and the trim tank forward transfer share the aft gallery (Junction.10 has one option at a
 * time). The FCOM sets the inner and mid manual transfers back to AUTO before the trim tank forward transfer (FUEL MAN XFR
 * PROCEDURE, l.152811-152814), but selects them all together for FUEL ALL FEED TKs LEVEL LO (l.149132-149136): with an
 * inner or mid manual transfer selected, the aft gallery goes to the feed tanks and the trim tank fuel goes there too
 * (design choice of the simulation; the fuel ends up in the feed tanks, where the next inner tank transfer would take it).
 *
 * A pump whose pb-sw is OFF does not run. A transfer stops when its tank is empty (the MSFS pumps need fuel in their
 * tank), as the FCOM manual transfers do (FUEL INR(MID)(OUTR)(TRIM) TK MAN XFR COMPLETED, l.151085-151086); the feed
 * tanks only receive fuel (no lineup opens a valve out of a feed tank).
 *
 * With the TRIM TK FEED selector in ISOL, "The trim tank forward transfer stops and the trim tank transfer line is
 * isolated" (DSC-28-20, l.58044-58053, CpiomF/FuelTrimTankFeed): the TRIM TK XFR FWD transfer stays selected (the
 * automatic transfers still wait) but its pumps do not run and the trim line stays closed.
 * @param selection the selected manual transfers
 * @param isPumpPbOn whether the pb-sw of a pump is ON (its circuit connected)
 * @param trimTankIsolated whether the TRIM TK FEED selector is in ISOL
 */
export function manualTransferLineup(
  selection: ManualTransferSelection,
  isPumpPbOn: (pump: ManualTransferPump) => boolean,
  trimTankIsolated = false,
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
  if (selection.trimForward && !trimTankIsolated) {
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
 * in MAN with any outer tank pump pb-sw OFF (DSC-28-10 l.57573-57575: "If a manual outer tank transfer is performed with
 * any outer tank pump off, the emergency outer tank transfer valve will automatically open"; DSC-28-40 l.59898-59901).
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

/** A key that identifies a lineup, to see when it changes */
function lineupKey(lineup: FuelLineup): string {
  const sorted = (numbers: number[]) => numbers.slice().sort((a, b) => a - b);
  return `${sorted(lineup.pumps).join(',')}|${sorted(lineup.valves).join(',')}|${lineup.junctions
    .map(([junction, option]) => `${junction}.${option}`)
    .sort()
    .join(',')}`;
}

/** Reads and commands the MSFS fuel system for the manual transfers */
export interface ManualTransferFuelSystem {
  /** Whether a transfer pb-sw is in AUTO (its *_PB_IS_AUTO L:var) */
  isTransferPbAuto(pbVar: string): boolean;
  /** Sets a transfer pb-sw (its *_PB_IS_AUTO L:var) */
  setTransferPbAuto(pbVar: string, auto: boolean): void;
  /** Whether a pump pb-sw is ON (A:CIRCUIT CONNECTION ON of its circuit) */
  isPumpPbOn(circuit: number): boolean;
  /** Whether an MSFS trigger is active (FUELSYSTEM TRIGGER STATUS) */
  isTriggerActive(trigger: number): boolean;
  /** Deactivates an MSFS trigger (FUELSYSTEM_TRIGGER_OFF) */
  setTriggerOff(trigger: number): void;
  /** Whether an MSFS pump switch is on (FUELSYSTEM PUMP SWITCH) */
  isPumpOn(pump: number): boolean;
  /** Switches an MSFS pump on or off */
  setPump(pump: number, on: boolean): void;
  /** Whether an MSFS valve switch is open (FUELSYSTEM VALVE SWITCH) */
  isValveOpen(valve: number): boolean;
  /** Opens or closes an MSFS valve */
  setValve(valve: number, open: boolean): void;
  /** The option of an MSFS junction (FUELSYSTEM JUNCTION SETTING) */
  junctionOption(junction: number): number;
  /** Sets the option of an MSFS junction (FUELSYSTEM_JUNCTION_SET) */
  setJunction(junction: number, option: number): void;
  /** Whether the TRIM TK FEED selector is in ISOL (CpiomF/FuelTrimTankFeed); not isolated when not given */
  isTrimTankIsolated?(): boolean;
}

/** What the manual transfers are doing */
enum ManualTransferPhase {
  /** No manual transfer: the automatic transfers (CpiomF/LegacyFuel) are in control */
  Idle,
  /** A manual transfer was selected: the automatic transfer triggers were switched off, waiting for MSFS to apply them */
  Entering,
  /** The manual transfers are in control of the transfer pumps and valves */
  Active,
  /** The last manual transfer was deselected: the pumps were stopped and the valves closed, waiting for MSFS to apply them */
  Leaving,
}

/**
 * The manual fuel transfers of the FQMS simulation (CPIOM-F), driven from CpiomF/LegacyFuel.
 *
 * While no transfer pb-sw is in MAN (FWD), nothing is commanded and the automatic transfers run as before. When one is
 * selected, the automatic transfers stop: "When a manual transfer is in progress, some automatic transfers may be
 * inhibited. They resume when the manual transfer is completed (MAN XFR pb-sw deselected)" (DSC-28-40 l.59879-59880),
 * "As long as the INR TK XFR pb-sw is set to MAN, all automatic transfers are inhibited" (l.151103-151104). The MSFS
 * triggers of the automatic transfers are switched off, then every transfer pump and transfer valve is set to the lineup
 * of the selected manual transfers (manualTransferLineup), again whenever that lineup changes (a pb-sw selected or
 * deselected, a pump pb-sw switched). When the last one is deselected, every transfer pump is stopped and every transfer
 * valve closed, and the automatic transfers start again from all their triggers off, as after a refuel. Fuel jettison
 * and refuel suspend the manual transfers.
 */
export class FuelManualTransfer {
  /** How long to wait for MSFS to apply the trigger, pump and valve commands, in milliseconds */
  public static readonly COMMAND_SETTLE_TIME_MS = 500;

  private phase = ManualTransferPhase.Idle;

  private settleTimeLeftMs = 0;

  /** The key of the lineup last commanded, null while none is */
  private commandedLineupKey: string | null = null;

  constructor(private readonly fuelSystem: ManualTransferFuelSystem) {}

  /**
   * Sets the transfer pb-sws to their normal position, AUTO ("In normal operation, fuel transfers are fully automatic and
   * require no crew action", DSC-28-40 l.59866; the FUEL AUTO GND XFR FAULT procedure returns them all to AUTO,
   * l.149305-149308). Their L:vars are in no flight file: without this they read 0, MAN, at every flight load.
   */
  public init(): void {
    for (const pbVar of FUEL_XFR_PB_IS_AUTO_VARS) {
      this.fuelSystem.setTransferPbAuto(pbVar, true);
    }
  }

  /** The manual transfers that the transfer pb-sws select */
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
   * @returns whether the manual transfers are in control of the transfer pumps and valves (the automatic transfers wait)
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
      ? manualTransferLineup(
          selection,
          ({ circuit }) => this.fuelSystem.isPumpPbOn(circuit),
          this.fuelSystem.isTrimTankIsolated?.() ?? false,
        )
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

  /** Switches off the active MSFS triggers of the automatic transfers (their effects, open valves and running pumps, stay) */
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
