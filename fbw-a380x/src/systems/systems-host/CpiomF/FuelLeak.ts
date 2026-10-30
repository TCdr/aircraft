// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

const KG_PER_LB = 0.45359237;

/**
 * A feed tank that can leak (flyPad failure) and its MSFS tank (flight_model.cfg Tank.N, FUELSYSTEM TANK QUANTITY),
 * and the fuel leak failure of the engine it feeds
 */
export interface A380FeedTankLeak {
  feedTank: number;
  failure: number;
  engineFuelLeakFailure: number;
  msfsTank: number;
}

/** The feed tank leaks: Tank.2 Feed1, Tank.5 Feed2, Tank.6 Feed3, Tank.9 Feed4 */
const A380_FEED_TANK_LEAKS: readonly A380FeedTankLeak[] = [
  { feedTank: 1, failure: A380Failure.FuelFeedTank1Leak, engineFuelLeakFailure: A380Failure.Eng1FuelLeak, msfsTank: 2 },
  { feedTank: 2, failure: A380Failure.FuelFeedTank2Leak, engineFuelLeakFailure: A380Failure.Eng2FuelLeak, msfsTank: 5 },
  { feedTank: 3, failure: A380Failure.FuelFeedTank3Leak, engineFuelLeakFailure: A380Failure.Eng3FuelLeak, msfsTank: 6 },
  { feedTank: 4, failure: A380Failure.FuelFeedTank4Leak, engineFuelLeakFailure: A380Failure.Eng4FuelLeak, msfsTank: 9 },
];

/**
 * Design choice (the real leak rate is not known): a leaking feed tank loses 6 000 kg/h, a fast leak (more than 4 t/h).
 * The fast leak detection then finds it after about 20 min.
 */
export const FEED_TANK_LEAK_RATE_KG_PER_HOUR = 6_000;

/**
 * Design choice (the real leak rate is not known): an internal engine fuel leak, between the fuel flow transmitter and
 * the combustion chamber, takes 1 200 kg/h more fuel from the feed tank than the engine burns, about half of a cruise
 * fuel flow: a massive leak that the comparison with the other engines finds.
 */
export const ENGINE_FUEL_LEAK_RATE_KG_PER_HOUR = 1_200;

/**
 * The fuel that a leak takes out of its tank during an update, in gallons, never more than the tank holds.
 * @param tankGallons the tank quantity
 * @param poundsPerGallon the fuel weight per gallon
 * @param deltaTimeMs the time of the update, in milliseconds
 * @param leakKgPerHour the leak rate
 */
export function leakedGallons(
  tankGallons: number,
  poundsPerGallon: number,
  deltaTimeMs: number,
  leakKgPerHour = FEED_TANK_LEAK_RATE_KG_PER_HOUR,
): number {
  if (!(poundsPerGallon > 0) || !(deltaTimeMs > 0)) {
    return 0;
  }
  const leakedKg = (leakKgPerHour * deltaTimeMs) / 3_600_000;
  return Math.min(Math.max(tankGallons, 0), leakedKg / KG_PER_LB / poundsPerGallon);
}

/**
 * ENG 1(2)(3)(4) FUEL LEAK of one engine: the FADEC compares the fuel used of the engine over 5 min with the average of
 * the three others and finds an unusual overconsumption. Design choice: the sim burns the fuel the same on the four
 * engines, so the comparison is replaced by the leak itself: the alert comes when the engine has leaked for the 5 min
 * of the comparison. It goes with the leak or the engine shutdown.
 */
export class EngineFuelLeakDetection {
  public static readonly DETECTION_TIME_S = 5 * 60;

  private leakingTimeS = 0;

  /**
   * @param leaking the engine runs and its fuel leak failure is active
   * @param deltaTimeS the time since the last update, in seconds
   */
  public update(leaking: boolean, deltaTimeS: number): void {
    this.leakingTimeS = leaking ? this.leakingTimeS + Math.max(deltaTimeS, 0) : 0;
  }

  public isLeakDetected(): boolean {
    return this.leakingTimeS >= EngineFuelLeakDetection.DETECTION_TIME_S;
  }
}

/** What the FQMS leak detection reads on one update */
/** What the FQMS leak detection reads on one update */
export interface FuelLeakDetectionInputs {
  onGround: boolean;
  /** The four engines run (ENGINE_STATE On) */
  allEnginesRunning: boolean;
  /** A fuel jettison is in progress (CpiomF/FuelJettison) */
  jettisonInProgress: boolean;
  /** The fuel on board, in kg */
  fobKg: number;
  /** The sum of the fuel used of the four engines, in kg */
  fuelUsedKg: number;
}

/** A sample of the fast leak detection history */
interface FuelSample {
  timeS: number;
  fobKg: number;
  fuelUsedKg: number;
}

/**
 * The FQMS fuel system leak detection:
 * - Slow leak detection: FUEL LEAK DETECTED when the BLOCK fuel exceeds FOB + fuel used by more than 15 450 lb.
 * - Fast leak detection: FUEL LEAK DETECTED when the FOB decrease over the previous 30 min exceeds the fuel used over
 *   the same 30 min by more than 4 400 lb.
 * - Inhibition (an engine shut down, a fuel jettison in progress): FUEL LEAK DET FAULT. The slow leak detection is
 *   then lost until the end of the flight; the fast leak detection comes back when the inhibition ends.
 *
 * Design choices (the real system's are not known):
 * - The BLOCK fuel is the FOB + fuel used when the four engines first run (the fuel used counters restart at each
 *   engine start on the ground): the detection starts then, and stops without a fault on the ground once an engine is
 *   shut down (end of flight).
 * - The fast detection compares with the oldest sample of the last 30 min (one sample a minute), so a leak that loses
 *   4 400 lb in less than 30 min after the detection started is also found. Its history restarts after an inhibition.
 * - FUEL LEAK DET FAULT lasts as long as the inhibition. FUEL LEAK DETECTED stays until the end of the flight.
 * - Not simulated, no data: the inhibitions by a lost or degraded fuel used or fuel quantity indication and by an
 *   abnormal flight attitude.
 */
export class FuelLeakDetection {
  public static readonly SLOW_LEAK_THRESHOLD_KG = 15_450 * KG_PER_LB;

  public static readonly FAST_LEAK_THRESHOLD_KG = 4_400 * KG_PER_LB;

  public static readonly FAST_LEAK_WINDOW_S = 30 * 60;

  /** Design choice: one history sample a minute */
  public static readonly SAMPLE_PERIOD_S = 60;

  /** The BLOCK fuel (FOB + fuel used when the detection started), in kg; null before the four engines run */
  private blockFuelKg: number | null = null;

  private slowDetectionLost = false;

  private history: FuelSample[] = [];

  private timeS = 0;

  private leakDetected = false;

  private detectionFault = false;

  /**
   * @param inputs what the FQMS reads
   * @param deltaTimeS the time since the last update, in seconds
   */
  public update(inputs: FuelLeakDetectionInputs, deltaTimeS: number): void {
    this.timeS += Math.max(deltaTimeS, 0);

    if (inputs.onGround && !inputs.allEnginesRunning) {
      this.reset();
      return;
    }
    if (this.blockFuelKg === null) {
      if (!inputs.allEnginesRunning) {
        return;
      }
      this.blockFuelKg = inputs.fobKg + inputs.fuelUsedKg;
    }

    this.detectionFault = !inputs.allEnginesRunning || inputs.jettisonInProgress;
    if (this.detectionFault) {
      this.slowDetectionLost = true;
      this.history = [];
      return;
    }

    const fobPlusFuelUsedKg = inputs.fobKg + inputs.fuelUsedKg;
    if (!this.slowDetectionLost && this.blockFuelKg - fobPlusFuelUsedKg > FuelLeakDetection.SLOW_LEAK_THRESHOLD_KG) {
      this.leakDetected = true;
    }

    const lastSample = this.history[this.history.length - 1];
    if (lastSample === undefined || this.timeS - lastSample.timeS >= FuelLeakDetection.SAMPLE_PERIOD_S) {
      this.history.push({ timeS: this.timeS, fobKg: inputs.fobKg, fuelUsedKg: inputs.fuelUsedKg });
    }
    while (this.history.length > 0 && this.timeS - this.history[0].timeS > FuelLeakDetection.FAST_LEAK_WINDOW_S) {
      this.history.shift();
    }
    const oldest = this.history[0];
    if (oldest !== undefined) {
      const fobDecreaseKg = oldest.fobKg - inputs.fobKg;
      const fuelUsedKg = inputs.fuelUsedKg - oldest.fuelUsedKg;
      if (fobDecreaseKg - fuelUsedKg > FuelLeakDetection.FAST_LEAK_THRESHOLD_KG) {
        this.leakDetected = true;
      }
    }
  }

  /** FUEL LEAK DETECTED: the FQMS has detected a fuel leak */
  public isLeakDetected(): boolean {
    return this.leakDetected;
  }

  /** FUEL LEAK DET FAULT: the fuel system leak detection is inhibited */
  public isDetectionFault(): boolean {
    return this.detectionFault;
  }

  private reset(): void {
    this.blockFuelKg = null;
    this.slowDetectionLost = false;
    this.history = [];
    this.leakDetected = false;
    this.detectionFault = false;
  }
}

/** The L:vars that give the FWS the FQMS leak detection */
export const FUEL_LEAK_DETECTED_VAR = 'L:A380X_FUEL_LEAK_DETECTED';
export const FUEL_LEAK_DET_FAULT_VAR = 'L:A380X_FUEL_LEAK_DET_FAULT';

/** The L:var that gives the FWS the fuel leak of an engine (ENG n FUEL LEAK) */
export const engineFuelLeakVar = (engine: number) => `L:A32NX_ENGINE_${engine}_FUEL_LEAK`;

/**
 * The feed tank and engine fuel leak failures (fuel taken out of the leaking feed tank by the systems, as FuelJettison
 * takes the jettisoned fuel), the engine fuel leak detection and the FQMS fuel leak detection.
 */
export class FuelLeak implements Instrument {
  /** The leaked fuel is written to the tanks at most this often, in milliseconds */
  private static readonly WRITE_PERIOD_MS = 500;

  private readonly detection = new FuelLeakDetection();

  private readonly engineDetections = A380_FEED_TANK_LEAKS.map(() => new EngineFuelLeakDetection());

  /** Whether each engine runs with its fuel leak failure */
  private readonly engineFuelLeaks: boolean[] = A380_FEED_TANK_LEAKS.map(() => false);

  private timeSinceWriteMs = 0;

  private readonly engineStates = A380_FEED_TANK_LEAKS.map((_, index) =>
    RegisteredSimVar.create(`L:A32NX_ENGINE_STATE:${index + 1}`, SimVarValueType.Enum),
  );

  private readonly engineFuelLeakOutputs = A380_FEED_TANK_LEAKS.map((_, index) =>
    RegisteredSimVar.createBoolean(engineFuelLeakVar(index + 1)),
  );

  private readonly fuelUsedKg = A380_FEED_TANK_LEAKS.map((_, index) =>
    RegisteredSimVar.create(`L:A32NX_FUEL_USED:${index + 1}`, SimVarValueType.Number),
  );

  private readonly fuelWeightPerGallon = RegisteredSimVar.create('FUEL WEIGHT PER GALLON', SimVarValueType.Pounds);

  private readonly onGround = RegisteredSimVar.createBoolean('SIM ON GROUND');

  private readonly jettisonInProgress = RegisteredSimVar.createBoolean('L:A380X_FUEL_JETTISON_IN_PROGRESS');

  private readonly fobKg = RegisteredSimVar.create('L:A32NX_TOTAL_FUEL_QUANTITY', SimVarValueType.Number);

  private readonly leakDetectedOutput = RegisteredSimVar.createBoolean(FUEL_LEAK_DETECTED_VAR);

  private readonly detectionFaultOutput = RegisteredSimVar.createBoolean(FUEL_LEAK_DET_FAULT_VAR);

  /** Refilled at each update, to avoid a new object */
  private readonly detectionInputs: FuelLeakDetectionInputs = {
    onGround: false,
    allEnginesRunning: false,
    jettisonInProgress: false,
    fobKg: 0,
    fuelUsedKg: 0,
  };

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failures: Pick<FailuresConsumer, 'isActive'>,
  ) {}

  public init(): void {
    // nothing to initialise: the detection starts when the four engines run
  }

  public onUpdate(): void {
    const deltaTimeMs = this.sysHost.deltaTime;

    for (let index = 0; index < A380_FEED_TANK_LEAKS.length; index++) {
      this.engineFuelLeaks[index] =
        this.failures.isActive(A380_FEED_TANK_LEAKS[index].engineFuelLeakFailure) &&
        this.engineStates[index].get() === 1;
      this.engineDetections[index].update(this.engineFuelLeaks[index], deltaTimeMs / 1000);
      this.engineFuelLeakOutputs[index].set(this.engineDetections[index].isLeakDetected());
    }

    this.timeSinceWriteMs += deltaTimeMs;
    if (this.timeSinceWriteMs >= FuelLeak.WRITE_PERIOD_MS) {
      const elapsedMs = this.timeSinceWriteMs;
      this.timeSinceWriteMs = 0;
      const poundsPerGallon = this.fuelWeightPerGallon.get();
      A380_FEED_TANK_LEAKS.forEach(({ failure, msfsTank }, index) => {
        const leakKgPerHour =
          (this.failures.isActive(failure) ? FEED_TANK_LEAK_RATE_KG_PER_HOUR : 0) +
          (this.engineFuelLeaks[index] ? ENGINE_FUEL_LEAK_RATE_KG_PER_HOUR : 0);
        if (leakKgPerHour > 0) {
          const quantityVar = `FUELSYSTEM TANK QUANTITY:${msfsTank}`;
          const gallons = SimVar.GetSimVarValue(quantityVar, SimVarValueType.GAL);
          const leaked = leakedGallons(gallons, poundsPerGallon, elapsedMs, leakKgPerHour);
          if (leaked > 0) {
            SimVar.SetSimVarValue(quantityVar, SimVarValueType.GAL, gallons - leaked);
          }
        }
      });
    }

    let allEnginesRunning = true;
    let fuelUsedKg = 0;
    for (let engine = 0; engine < this.engineStates.length; engine++) {
      allEnginesRunning = allEnginesRunning && this.engineStates[engine].get() === 1;
      fuelUsedKg += this.fuelUsedKg[engine].get();
    }
    const inputs = this.detectionInputs;
    inputs.onGround = this.onGround.get();
    inputs.allEnginesRunning = allEnginesRunning;
    inputs.jettisonInProgress = this.jettisonInProgress.get();
    inputs.fobKg = this.fobKg.get();
    inputs.fuelUsedKg = fuelUsedKg;
    this.detection.update(inputs, deltaTimeMs / 1000);
    this.leakDetectedOutput.set(this.detection.isLeakDetected());
    this.detectionFaultOutput.set(this.detection.isDetectionFault());
  }
}
