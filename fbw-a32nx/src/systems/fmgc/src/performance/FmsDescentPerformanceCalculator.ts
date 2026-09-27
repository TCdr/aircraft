// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  DescentAntiIce,
  DescentPerformanceCalculator,
  DescentPerformanceError,
  DescentPerformanceEstimate,
  DescentPerformanceInputs,
  DescentPerformanceResult,
  DescentProfilePoint,
  DescentSpeedSchedule,
  DescentType,
} from '@flybywiresim/fbw-sdk';
import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Common, FlapConf } from '@fmgc/guidance/vnav/common';
import { EngineModel } from '@fmgc/guidance/vnav/EngineModel';
import { Predictions, StepResults } from '@fmgc/guidance/vnav/Predictions';

const KG_PER_LB = 0.45359237;
const TROPOPAUSE = 36_089;
/** The integration step, in feet */
const STEP = 1000;
/** The profile table has a point every 5000 ft (A380 FCOM PER-IFT-DES-DSR, table results) */
const TABLE_STEP = 5000;
/** The FMS decelerates to the speed limit on a -1° path at idle thrust (IdleDescentStrategy.predictToSpeed) */
const DECEL_PATH_ANGLE = -1;

/**
 * Anti-ice corrections of the A320 FCOM descent table (PER-DES-STD, DESCENT - M.78/300KT/250KT): time, fuel and
 * distance with engine anti-ice, and with engine and wing (total) anti-ice. The performance model has no bleed.
 */
const ANTI_ICE_CORRECTIONS: Record<DescentAntiIce, { time: number; fuel: number; distance: number }> = {
  [DescentAntiIce.Off]: { time: 1, fuel: 1, distance: 1 },
  [DescentAntiIce.Engine]: { time: 1.06, fuel: 1.28, distance: 1.03 },
  [DescentAntiIce.Total]: { time: 1.06, fuel: 1.44, distance: 1.04 },
};

export interface DescentAircraftLimits {
  /** The standard descent speed profile of the aircraft FCOM */
  standardSchedule: DescentSpeedSchedule;
  mmo: number;
  vmo: number;
  maxAltitude: number;
  oew: number;
  mtow: number;
}

/**
 * The descent performance calculator of the flypad, after the DES module of the Airbus in-flight performance
 * application (A380 FCOM PER-IFT-DES): the descent from an initial to a target pressure altitude at idle thrust (or at
 * a given rate of descent) along a MACH / SPD / SPD LIM speed schedule, with the fuel, time and distance, and the
 * profile every 5000 ft. It uses the flight and engine models of the FMS (the VNAV predictions of the aircraft), so its
 * results agree with the FMS descent predictions.
 */
export class FmsDescentPerformanceCalculator implements DescentPerformanceCalculator {
  public readonly standardSchedule: DescentSpeedSchedule;

  public readonly mmo: number;

  public readonly vmo: number;

  public readonly maxAltitude: number;

  public readonly oew: number;

  public readonly mtow: number;

  constructor(
    private readonly config: AircraftConfig,
    limits: DescentAircraftLimits,
  ) {
    this.standardSchedule = limits.standardSchedule;
    this.mmo = limits.mmo;
    this.vmo = limits.vmo;
    this.maxAltitude = limits.maxAltitude;
    this.oew = limits.oew;
    this.mtow = limits.mtow;
  }

  public calculateDescent(inputs: DescentPerformanceInputs): DescentPerformanceResult {
    const result: DescentPerformanceResult = {
      inputs,
      error: this.checkInputs(inputs),
      time: 0,
      distance: 0,
      fuel: 0,
      points: [],
      averageGradient: 0,
      averageRate: 0,
      estimates: inputs.antiIce !== DescentAntiIce.Off ? [DescentPerformanceEstimate.AntiIce] : [],
    };
    if (result.error !== DescentPerformanceError.None) {
      return result;
    }

    // EMERGENCY: MMO/VMO with the speed brakes (A380 FCOM PER-IFT-DES-EMG, PER-IFT-DES-DSD speed brakes)
    const emergency = inputs.type === DescentType.Emergency;
    const schedule: DescentSpeedSchedule = emergency
      ? { mach: this.mmo, cas: this.vmo, limitCas: this.vmo, limitAltitude: 0 }
      : inputs.schedule;
    const speedBrakes = inputs.speedBrakes || emergency;
    const givenVs = inputs.type === DescentType.GivenVs ? -Math.abs(inputs.verticalSpeed ?? 0) : undefined;

    // Weights in pounds, as the FMS predictions: only the gross weight matters, the fuel is the part that burns
    const grossWeight = inputs.weight / KG_PER_LB;
    const fuelOnBoard = grossWeight * 0.3;
    const zeroFuelWeight = grossWeight - fuelOnBoard;

    let altitude = inputs.initialAltitude;
    let time = 0;
    let distance = 0;
    let burned = 0;
    let crossoverRecorded = false;

    const target = inputs.targetAltitude;
    const needsDecel =
      schedule.cas > schedule.limitCas && schedule.limitAltitude > target && schedule.limitAltitude < altitude;
    // The deceleration ends at the speed limit altitude: it starts above it by the height it takes
    let decelTop = schedule.limitAltitude;
    if (needsDecel) {
      for (let i = 0; i < 2; i++) {
        const decel = this.decelStep(decelTop, schedule, zeroFuelWeight, fuelOnBoard, inputs, speedBrakes);
        decelTop = schedule.limitAltitude + (decelTop - decel.finalAltitude);
      }
      decelTop = Math.min(decelTop, inputs.initialAltitude);
    }
    let decelDone = !needsDecel;

    const push = (step: StepResults | undefined, event?: DescentProfilePoint['event']) => {
      const cas = altitude > schedule.limitAltitude || !decelDone ? schedule.cas : schedule.limitCas;
      const above = altitude > TROPOPAUSE;
      const delta = Common.getDelta(altitude, above);
      const theta = Common.getTheta(altitude, inputs.isaDeviation, above);
      const mach = Math.min(Common.CAStoMach(cas, delta), schedule.mach);
      const actualCas = mach < schedule.mach ? cas : Common.machToCas(mach, delta);
      result.points.push({
        altitude,
        time,
        distance,
        fuel: burned * KG_PER_LB,
        cas: actualCas,
        mach,
        tas: Common.machToTAS(mach, theta),
        gradient: step?.pathAngle ?? 0,
        rate: Math.abs(step?.verticalSpeed ?? 0),
        event,
      });
    };
    push(undefined);

    let guard = 0;
    while (altitude > target + 1 && guard++ < 200) {
      if (!decelDone && altitude <= decelTop + 1) {
        // Deceleration to the speed limit, at the speed limit altitude
        const decel = this.decelStep(altitude, schedule, zeroFuelWeight, fuelOnBoard - burned, inputs, speedBrakes);
        const last = result.points[result.points.length - 1];
        last.event = 'DECEL';
        time += decel.timeElapsed;
        distance += decel.distanceTraveled;
        burned += decel.fuelBurned;
        // The deceleration ends at the speed limit altitude
        altitude = Math.max(target, schedule.limitAltitude);
        decelDone = true;
        push(decel, 'SPD LIM');
        continue;
      }

      let next = altitude - (altitude % STEP || STEP);
      next = Math.max(next, target);
      if (!decelDone) {
        next = Math.max(next, decelTop);
      }
      const cas = decelDone ? schedule.limitCas : schedule.cas;
      const step = this.descentStep(
        altitude,
        next,
        cas,
        schedule.mach,
        zeroFuelWeight,
        fuelOnBoard - burned,
        inputs,
        speedBrakes,
        givenVs,
      );
      if (step.idleLimited && result.verticalSpeedIdleBelow === undefined) {
        result.verticalSpeedIdleBelow = altitude;
      }
      time += step.timeElapsed;
      distance += step.distanceTraveled;
      burned += step.fuelBurned;
      const from = altitude;
      altitude = next;

      // The crossover altitude: where the SPD gives the MACH
      const crossover = this.crossoverAltitude(schedule);
      const atCrossover =
        !crossoverRecorded && crossover < from && crossover >= altitude && crossover < inputs.initialAltitude;
      if (atCrossover) {
        crossoverRecorded = true;
      }
      const onTable = altitude % TABLE_STEP === 0 || altitude === target;
      if (onTable || atCrossover) {
        push(step, atCrossover ? 'CROSSOVER' : undefined);
      }
    }

    const correction = ANTI_ICE_CORRECTIONS[inputs.antiIce];
    for (const point of result.points) {
      point.time *= correction.time;
      point.fuel *= correction.fuel;
      point.distance *= correction.distance;
    }
    result.time = time * correction.time;
    result.distance = distance * correction.distance;
    result.fuel = burned * KG_PER_LB * correction.fuel;
    const height = inputs.initialAltitude - target;
    result.averageRate = result.time > 0 ? height / (result.time / 60) : 0;
    result.averageGradient = -(Math.atan2(height, result.distance * 6076.12) * 180) / Math.PI;
    return result;
  }

  /** The crossover altitude of a speed schedule: where MACH and SPD give the same TAS, in feet */
  public crossoverAltitude(schedule: DescentSpeedSchedule): number {
    let low = 0;
    let high = 60_000;
    for (let i = 0; i < 40; i++) {
      const mid = (low + high) / 2;
      if (Common.CAStoMach(schedule.cas, Common.getDelta(mid, mid > TROPOPAUSE)) > schedule.mach) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return (low + high) / 2;
  }

  private checkInputs(inputs: DescentPerformanceInputs): DescentPerformanceError {
    const numbers = [
      inputs.initialAltitude,
      inputs.targetAltitude,
      inputs.weight,
      inputs.isaDeviation,
      inputs.headwind,
    ];
    const schedule = inputs.schedule;
    if (
      !numbers.every(Number.isFinite) ||
      (inputs.type !== DescentType.Emergency &&
        ![schedule.mach, schedule.cas, schedule.limitCas, schedule.limitAltitude].every(Number.isFinite))
    ) {
      return DescentPerformanceError.InvalidData;
    }
    if (inputs.targetAltitude >= inputs.initialAltitude) {
      return DescentPerformanceError.TargetAboveInitial;
    }
    if (inputs.initialAltitude > this.maxAltitude) {
      return DescentPerformanceError.MaximumAltitude;
    }
    if (inputs.weight < this.oew || inputs.weight > this.mtow) {
      return DescentPerformanceError.WeightOutOfRange;
    }
    if (inputs.type === DescentType.GivenVs && !(Math.abs(inputs.verticalSpeed ?? 0) >= 100)) {
      return DescentPerformanceError.VerticalSpeed;
    }
    return DescentPerformanceError.None;
  }

  /** Idle thrust N1 of the FMS predictions (IdleDescentStrategy) */
  private idleN1(altitude: number, cas: number, mach: number): number {
    const computedMach = Math.min(Common.CAStoMach(cas, Common.getDelta(altitude, altitude > TROPOPAUSE)), mach);
    return (
      EngineModel.getIdleCorrectedN1(this.config.engineModelParameters, altitude, computedMach, TROPOPAUSE) +
      this.config.vnavConfig.IDLE_N1_MARGIN
    );
  }

  /** A descent step at idle thrust, or at a given V/S (null when it needs less than idle thrust) */
  private descentStep(
    from: number,
    to: number,
    cas: number,
    mach: number,
    zeroFuelWeight: number,
    fuel: number,
    inputs: DescentPerformanceInputs,
    speedBrakes: boolean,
    givenVs: number | undefined,
  ): StepResults & { idleLimited?: boolean } {
    const midway = (from + to) / 2;
    const idle = this.idleN1(midway, cas, mach);
    const idleStep = Predictions.altitudeStep(
      this.config,
      from,
      to - from,
      cas,
      mach,
      idle,
      zeroFuelWeight,
      fuel,
      inputs.headwind,
      inputs.isaDeviation,
      TROPOPAUSE,
      inputs.fuelFactor,
      speedBrakes,
      FlapConf.CLEAN,
      false,
    );
    if (givenVs === undefined) {
      return idleStep;
    }
    const step = Predictions.verticalSpeedStep(
      this.config,
      from,
      to,
      givenVs,
      cas,
      mach,
      zeroFuelWeight,
      fuel,
      inputs.isaDeviation,
      inputs.headwind,
      TROPOPAUSE,
      inputs.fuelFactor,
      speedBrakes,
      FlapConf.CLEAN,
      false,
    );
    // Steeper than the idle descent: not achievable at idle thrust, the descent is at idle there
    return Math.abs(givenVs) > Math.abs(idleStep.verticalSpeed) + 50 ? { ...idleStep, idleLimited: true } : step;
  }

  /** The deceleration from SPD to SPD LIM on a -1° path at idle, from an altitude */
  private decelStep(
    altitude: number,
    schedule: DescentSpeedSchedule,
    zeroFuelWeight: number,
    fuel: number,
    inputs: DescentPerformanceInputs,
    speedBrakes: boolean,
  ): StepResults {
    const delta = Common.getDelta(altitude, altitude > TROPOPAUSE);
    return Predictions.speedChangeStep(
      this.config,
      DECEL_PATH_ANGLE,
      altitude,
      schedule.cas,
      schedule.limitCas,
      Math.min(Common.CAStoMach(schedule.cas, delta), schedule.mach),
      Math.min(Common.CAStoMach(schedule.limitCas, delta), schedule.mach),
      this.idleN1(altitude, schedule.cas, schedule.mach),
      zeroFuelWeight,
      fuel,
      inputs.headwind,
      inputs.isaDeviation,
      TROPOPAUSE,
      inputs.fuelFactor,
      false,
      FlapConf.CLEAN,
      speedBrakes,
    );
  }
}
