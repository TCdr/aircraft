// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { A380_TRANSFER_PUMPS, FailureStates } from './FuelPumpsAndValves';
import {
  FUEL_XFR_PB_IS_AUTO_VARS,
  L_INR_TK_AFT_PUMP,
  L_MID_TK_AFT_PUMP,
  R_INR_TK_AFT_PUMP,
  R_MID_TK_AFT_PUMP,
} from './FuelManualTransfer';
import {
  FEED_TANKS,
  FM_REMAINING_FLIGHT_TIME_VARS,
  FuelMove,
  isTankEmpty,
  LEFT_OUTER_TANK,
  remainingTimeToDestinationMin,
  RIGHT_OUTER_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';
import {
  areOuterTanksFull,
  LoadAlleviationPumps,
  LoadAlleviationTransferLogic,
  LoadAlleviationTransfers,
  loadAlleviationMoves,
} from './FuelLoadAlleviation';
import {
  AUTO_GND_XFR_COMPLETED_VAR,
  AUTO_GND_XFR_FAULT_VAR,
  AUTO_GND_XFR_IN_PROGRESS_VAR,
  AUTO_GND_XFR_PB_IS_ON_VAR,
  AUTO_GND_XFR_PB_LIGHT_VAR,
  groundTransferCanMove,
  GroundTransferLogic,
  groundTransferMoves,
  GroundTransferState,
  isAutoGndXfrPbLightOn,
} from './FuelGroundTransfer';
import {
  isTrimTankGravityTransfer,
  TRIM_TK_FEED_SELECTOR_VAR,
  TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR,
  trimTankFeedSelector,
  TrimTankFeedSelector,
  trimTankGravityMoves,
} from './FuelTrimTankFeed';
import {
  FORWARD_GALLERY_PUMPS,
  galleryFunctionalitySwapMoves,
  MAIN_TRANSFER_FEED_TANK_VALVES,
  OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR,
  OuterTankGravityTransferLogic,
  outerTankGravityMoves,
} from './FuelAlternateTransfers';

/** The load alleviation transfer to the outer tanks is in progress */
export const LOAD_ALLEVIATION_TO_OUTR_TKS_VAR = 'L:A380X_FUEL_LOAD_ALLEVIATION_XFR_TO_OUTR_TKS';
/** The load alleviation transfer from the trim tank is in progress */
export const LOAD_ALLEVIATION_FROM_TRIM_TK_VAR = 'L:A380X_FUEL_LOAD_ALLEVIATION_XFR_FROM_TRIM_TK';
/** The load alleviation transfer from the outer tanks is in progress */
const LOAD_ALLEVIATION_FROM_OUTR_TKS_VAR = 'L:A380X_FUEL_LOAD_ALLEVIATION_XFR_FROM_OUTR_TKS';

/** The MSFS tanks of the A380 (flight_model.cfg Tank.1-11) */
const A380_TANKS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** The commands of the FQMS to the transfer pumps (CpiomF/FuelPumpsAndValves) */
export interface TransferPumpCommands {
  /** Whether the FQMS commands a transfer pump (Pump.N) on, a failed one included */
  isTransferPumpCommandedOn(pump: number): boolean;
}

/**
 * The automatic fuel transfers of the FQMS simulation (CPIOM-F) that the MSFS fuel triggers of CpiomF/LegacyFuel do not
 * make, by moving fuel between the MSFS tanks at the aircraft rates (the MSFS fuel system has no line for them):
 * - the load alleviation transfers (CpiomF/FuelLoadAlleviation),
 * - the automatic ground transfer and the AUTO GND XFR pb-sw (CpiomF/FuelGroundTransfer),
 * - the gravity transfer from the trim tank, TRIM TK FEED OPEN (CpiomF/FuelTrimTankFeed),
 * - the alternate transfers after a transfer pump failure, CASE 4 and 5 (CpiomF/FuelAlternateTransfers).
 * A fuel jettison or a refuel stops them all (as LegacyFuel does). A manual transfer stops the automatic ones (with the
 * INR TK XFR pb-sw in MAN all automatic transfers are inhibited); the gravity transfer selected by the flight crew goes
 * on.
 */
export class FuelAutomaticTransfers implements Instrument {
  /** The update period, in milliseconds (as LegacyFuel) */
  public static readonly UPDATE_PERIOD_MS = 250;

  private readonly loadAlleviation = new LoadAlleviationTransferLogic();

  private readonly groundTransfer = new GroundTransferLogic();

  private readonly outerGravity = new OuterTankGravityTransferLogic();

  private timeSinceUpdateMs = 0;

  /** A running time for the flashing light, in seconds */
  private timeS = 0;

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failures: FailureStates,
    private readonly pumpCommands: TransferPumpCommands,
  ) {}

  public init(): void {
    // nothing to initialise: the transfers start from their idle states
  }

  public onUpdate(): void {
    this.timeSinceUpdateMs += this.sysHost.deltaTime;
    if (this.timeSinceUpdateMs < FuelAutomaticTransfers.UPDATE_PERIOD_MS) {
      return;
    }
    const deltaTimeS = this.timeSinceUpdateMs / 1000;
    this.timeSinceUpdateMs = 0;
    this.timeS += deltaTimeS;

    const poundsPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', SimVarValueType.Pounds);
    if (!(poundsPerGallon > 0)) {
      return;
    }
    const levels = this.readTankLevels();
    const initialQuantities = new Map(levels.quantityGal);
    const onGround = SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0;
    const suspended =
      SimVar.GetSimVarValue('L:A380X_FUEL_JETTISON_IN_PROGRESS', SimVarValueType.Bool) > 0 ||
      SimVar.GetSimVarValue('L:A32NX_REFUEL_STARTED_BY_USR', SimVarValueType.Bool) > 0;
    const manualTransfer = FUEL_XFR_PB_IS_AUTO_VARS.some(
      (pbVar) => !(SimVar.GetSimVarValue(pbVar, SimVarValueType.Bool) > 0),
    );
    const automaticAllowed = !suspended && !manualTransfer;
    const selector = trimTankFeedSelector(SimVar.GetSimVarValue(TRIM_TK_FEED_SELECTOR_VAR, SimVarValueType.Number));
    const moves: FuelMove[] = [];

    // Load alleviation transfers
    const loadAlleviation: LoadAlleviationTransfers = this.loadAlleviation.update(
      {
        inFlight: !onGround,
        fobLb: A380_TANKS.reduce((sum, tank) => sum + (levels.quantityGal.get(tank) ?? 0), 0) * poundsPerGallon,
        outerTanksFull: areOuterTanksFull(levels),
        remainingTimeToDestinationMin: remainingTimeToDestinationMin(
          FM_REMAINING_FLIGHT_TIME_VARS.map((name) => SimVar.GetSimVarValue(name, SimVarValueType.Number)),
        ),
        pressureAltitudeFt: SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet),
        outerTanksLb: [
          (levels.quantityGal.get(LEFT_OUTER_TANK) ?? 0) * poundsPerGallon,
          (levels.quantityGal.get(RIGHT_OUTER_TANK) ?? 0) * poundsPerGallon,
        ],
        trimTankEmpty: isTankEmpty(levels, TRIM_TANK),
        trimTankIsolated: selector === TrimTankFeedSelector.Isol,
      },
      deltaTimeS,
    );
    if (automaticAllowed) {
      moves.push(...loadAlleviationMoves(loadAlleviation, levels, this.readPumps(), poundsPerGallon, deltaTimeS));
    }

    // Automatic ground transfer
    const pbOn = SimVar.GetSimVarValue(AUTO_GND_XFR_PB_IS_ON_VAR, SimVarValueType.Bool) > 0;
    const cgWord = new Arinc429Word(
      SimVar.GetSimVarValue('L:A32NX_FQMS_CENTER_OF_GRAVITY_MAC', SimVarValueType.Number),
    );
    const groundState = this.groundTransfer.update({
      pbOn,
      onGround,
      enginesRunning: [1, 2, 3, 4].filter(
        (engine) => SimVar.GetSimVarValue(`GENERAL ENG COMBUSTION:${engine}`, SimVarValueType.Bool) > 0,
      ).length,
      allTransferPumpsOn: this.allTransferPumpPbsOn(),
      cgPercent: cgWord.isNormalOperation() ? cgWord.value : null,
      otherTransferInProgress: suspended || manualTransfer,
      fuelCanMove: (direction) => groundTransferCanMove(levels, direction),
    });
    if (groundState === GroundTransferState.InProgress) {
      moves.push(...groundTransferMoves(this.groundTransfer.getDirection(), levels, poundsPerGallon, deltaTimeS));
    }

    // TRIM TK FEED OPEN: gravity transfer from the trim tank
    const pitchDeg = -SimVar.GetSimVarValue('PLANE PITCH DEGREES', SimVarValueType.Degree);
    const trimGravity = !suspended && isTrimTankGravityTransfer(selector, pitchDeg) && !isTankEmpty(levels, TRIM_TANK);
    if (trimGravity) {
      moves.push(...trimTankGravityMoves(levels, deltaTimeS));
    }

    // Alternate transfers after a transfer pump failure
    const lowestFeedTankLb = Math.min(...FEED_TANKS.map((tank) => levels.quantityGal.get(tank) ?? 0)) * poundsPerGallon;
    const outerGravity = this.outerGravity.update(
      !onGround && automaticAllowed,
      [this.isPumpFailed(9), this.isPumpFailed(14)],
      [isTankEmpty(levels, LEFT_OUTER_TANK), isTankEmpty(levels, RIGHT_OUTER_TANK)],
      lowestFeedTankLb,
    );
    if (automaticAllowed && !onGround) {
      moves.push(...outerTankGravityMoves(outerGravity, levels, deltaTimeS));
      moves.push(
        ...galleryFunctionalitySwapMoves(
          this.substitutedTanks(),
          this.mainTransferReceivingFeedTanks(),
          levels,
          poundsPerGallon,
          deltaTimeS,
        ),
      );
    }

    this.applyMoves(levels, initialQuantities, moves);
    this.setOutputs(loadAlleviation, automaticAllowed, groundState, trimGravity, outerGravity);
  }

  private readTankLevels(): TankLevels {
    const quantityGal = new Map<number, number>();
    const capacityGal = new Map<number, number>();
    for (const tank of A380_TANKS) {
      quantityGal.set(tank, SimVar.GetSimVarValue(`FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL));
      capacityGal.set(tank, SimVar.GetSimVarValue(`FUELSYSTEM TANK CAPACITY:${tank}`, SimVarValueType.GAL));
    }
    return { quantityGal, capacityGal };
  }

  private isPumpPbOn(circuit: number): boolean {
    return SimVar.GetSimVarValue(`A:CIRCUIT CONNECTION ON:${circuit}`, SimVarValueType.Bool) > 0;
  }

  /** Whether a transfer pump with a failure (A380_TRANSFER_PUMPS) is failed */
  private isPumpFailed(pump: number): boolean {
    const transferPump = A380_TRANSFER_PUMPS.find((candidate) => candidate.pump === pump);
    return transferPump !== undefined && this.failures.isActive(transferPump.failure);
  }

  /** Whether a transfer pump with a failure (A380_TRANSFER_PUMPS) can run: pb-sw ON and not failed */
  private canRun(pump: number): boolean {
    const transferPump = A380_TRANSFER_PUMPS.find((candidate) => candidate.pump === pump);
    return transferPump !== undefined && this.isPumpPbOn(transferPump.circuit) && !this.isPumpFailed(pump);
  }

  private readPumps(): LoadAlleviationPumps {
    return {
      innerFwd: [this.canRun(12), this.canRun(13)],
      innerAft: [this.isPumpPbOn(L_INR_TK_AFT_PUMP.circuit), this.isPumpPbOn(R_INR_TK_AFT_PUMP.circuit)],
      midFwd: [this.canRun(10), this.canRun(15)],
      midAft: [this.isPumpPbOn(L_MID_TK_AFT_PUMP.circuit), this.isPumpPbOn(R_MID_TK_AFT_PUMP.circuit)],
      outer: [this.canRun(9), this.canRun(14)],
      trim: [this.canRun(19), this.canRun(20)],
    };
  }

  /** The ground transfer needs all transfer pumps on: the pb-sws of the 12 transfer pumps (fwd, aft, outer, trim) */
  private allTransferPumpPbsOn(): boolean {
    const aftCircuits = [L_INR_TK_AFT_PUMP, R_INR_TK_AFT_PUMP, L_MID_TK_AFT_PUMP, R_MID_TK_AFT_PUMP].map(
      ({ circuit }) => circuit,
    );
    return [...A380_TRANSFER_PUMPS.map(({ circuit }) => circuit), ...aftCircuits].every((circuit) =>
      this.isPumpPbOn(circuit),
    );
  }

  /** CASE 4: the inner or mid tanks whose failed fwd pump the FQMS commands on and whose aft pump pb-sw is ON */
  private substitutedTanks(): number[] {
    return FORWARD_GALLERY_PUMPS.filter(
      ({ pump, aftPumpCircuit }) =>
        this.isPumpFailed(pump) && this.pumpCommands.isTransferPumpCommandedOn(pump) && this.isPumpPbOn(aftPumpCircuit),
    ).map(({ tank }) => tank);
  }

  /** The feed tanks whose main transfer inlet valve is open */
  private mainTransferReceivingFeedTanks(): number[] {
    return MAIN_TRANSFER_FEED_TANK_VALVES.filter(({ valves }) =>
      valves.some(
        (valve) => SimVar.GetSimVarValue(`FUELSYSTEM VALVE OPEN:${valve}`, SimVarValueType.PercentOver100) > 0.5,
      ),
    ).map(({ feedTank }) => feedTank);
  }

  /** Writes the new quantity of each tank that a move changed */
  private applyMoves(levels: TankLevels, initialQuantities: Map<number, number>, moves: readonly FuelMove[]): void {
    const changedTanks = new Set<number>();
    for (const { from, to } of moves) {
      changedTanks.add(from);
      changedTanks.add(to);
    }
    for (const tank of changedTanks) {
      const quantity = Math.max(0, levels.quantityGal.get(tank) ?? 0);
      if (quantity !== initialQuantities.get(tank)) {
        SimVar.SetSimVarValue(`FUELSYSTEM TANK QUANTITY:${tank}`, SimVarValueType.GAL, quantity);
      }
    }
  }

  private setOutputs(
    loadAlleviation: LoadAlleviationTransfers,
    automaticAllowed: boolean,
    groundState: GroundTransferState,
    trimGravity: boolean,
    outerGravity: readonly [boolean, boolean],
  ): void {
    SimVar.SetSimVarValue(
      LOAD_ALLEVIATION_TO_OUTR_TKS_VAR,
      SimVarValueType.Bool,
      automaticAllowed && loadAlleviation.toOuterTanks,
    );
    SimVar.SetSimVarValue(
      LOAD_ALLEVIATION_FROM_TRIM_TK_VAR,
      SimVarValueType.Bool,
      automaticAllowed && loadAlleviation.fromTrimTank,
    );
    SimVar.SetSimVarValue(
      LOAD_ALLEVIATION_FROM_OUTR_TKS_VAR,
      SimVarValueType.Bool,
      automaticAllowed && loadAlleviation.fromOuterTanks,
    );
    SimVar.SetSimVarValue(
      AUTO_GND_XFR_IN_PROGRESS_VAR,
      SimVarValueType.Bool,
      groundState === GroundTransferState.InProgress,
    );
    SimVar.SetSimVarValue(
      AUTO_GND_XFR_COMPLETED_VAR,
      SimVarValueType.Bool,
      groundState === GroundTransferState.Completed,
    );
    SimVar.SetSimVarValue(AUTO_GND_XFR_FAULT_VAR, SimVarValueType.Bool, groundState === GroundTransferState.Fault);
    SimVar.SetSimVarValue(
      AUTO_GND_XFR_PB_LIGHT_VAR,
      SimVarValueType.Bool,
      isAutoGndXfrPbLightOn(groundState, this.timeS),
    );
    SimVar.SetSimVarValue(TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR, SimVarValueType.Bool, trimGravity);
    SimVar.SetSimVarValue(
      OUTR_TK_GRAVITY_XFR_IN_PROGRESS_VAR,
      SimVarValueType.Bool,
      outerGravity[0] || outerGravity[1],
    );
  }
}
