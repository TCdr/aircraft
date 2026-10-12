// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

const KG_PER_LB = 0.45359237;

/** A feed tank that can leak (flyPad failure) and its MSFS tank (flight_model.cfg Tank.N, FUELSYSTEM TANK QUANTITY) */
export interface A380FeedTankLeak {
  feedTank: number;
  failure: number;
  msfsTank: number;
}

/** The feed tank leaks: Tank.2 Feed1, Tank.5 Feed2, Tank.6 Feed3, Tank.9 Feed4 */
export const A380_FEED_TANK_LEAKS: readonly A380FeedTankLeak[] = [
  { feedTank: 1, failure: A380Failure.FuelFeedTank1Leak, msfsTank: 2 },
  { feedTank: 2, failure: A380Failure.FuelFeedTank2Leak, msfsTank: 5 },
  { feedTank: 3, failure: A380Failure.FuelFeedTank3Leak, msfsTank: 6 },
  { feedTank: 4, failure: A380Failure.FuelFeedTank4Leak, msfsTank: 9 },
];

/**
 * Design choice (no FCOM rate): a leaking feed tank loses 6 000 kg/h, a fast leak (A380 FCOM PRO-ABN-ECAM-10-28 FUEL
 * LEAK DET FAULT, a380_fcom.txt l.151978-151979: "detection of fast leaks (more than 4 tons per hour)"). The fast leak
 * detection then finds it after about 20 min.
 */
export const FEED_TANK_LEAK_RATE_KG_PER_HOUR = 6_000;

/**
 * The fuel that a leak takes out of its tank during an update, in gallons, never more than the tank holds.
 * @param tankGallons the tank quantity
 * @param poundsPerGallon the fuel weight per gallon
 * @param deltaTimeMs the time of the update, in milliseconds
 */
export function leakedGallons(tankGallons: number, poundsPerGallon: number, deltaTimeMs: number): number {
  if (!(poundsPerGallon > 0) || !(deltaTimeMs > 0)) {
    return 0;
  }
  const leakedKg = (FEED_TANK_LEAK_RATE_KG_PER_HOUR * deltaTimeMs) / 3_600_000;
  return Math.min(Math.max(tankGallons, 0), leakedKg / KG_PER_LB / poundsPerGallon);
}

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
 * The FQMS fuel system leak detection (A380 FCOM DSC-28-40 FUEL LEAK DETECTION, a380_fcom.txt l.60239-60312):
 * - Slow leak detection (l.60298-60302): "compares the BLOCK fuel with the sum of the FOB and the Fuel Used. If the
 *   difference is greater than 15 450 lb, the ECAM triggers the FUEL LEAK DETECTED alert."
 * - Fast leak detection (l.60306-60310): "compares the Fuel Used during the previous 30 min, with the delta FOB during
 *   the previous 30 min. If the difference is greater than 4 400 lb, the ECAM triggers the FUEL LEAK DETECTED alert."
 * - Inhibition (l.60286-60297): "inhibited in the case of: - Engine shutdown [...] - Fuel jettison in progress [...] If
 *   the fuel system leak detection is inhibited, the ECAM triggers the FUEL LEAK DET FAULT alert. The slow leak
 *   detection is lost until the end of the flight. The fast leak detection is recovered if the inhibition conditions
 *   are no longer true."
 *
 * Design choices (the FCOM does not define them):
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
  /** l.60302 */
  public static readonly SLOW_LEAK_THRESHOLD_KG = 15_450 * KG_PER_LB;

  /** l.60310 */
  public static readonly FAST_LEAK_THRESHOLD_KG = 4_400 * KG_PER_LB;

  /** l.60306-60307: "during the previous 30 min" */
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

/**
 * The feed tank leak failures (fuel taken out of the leaking feed tank by the systems, as FuelJettison takes the
 * jettisoned fuel) and the FQMS fuel leak detection.
 */
export class FuelLeak implements Instrument {
  /** The leaked fuel is written to the tanks at most this often, in milliseconds */
  private static readonly WRITE_PERIOD_MS = 500;

  private readonly detection = new FuelLeakDetection();

  private timeSinceWriteMs = 0;

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failures: Pick<FailuresConsumer, 'isActive'>,
  ) {}

  public init(): void {
    // nothing to initialise: the detection starts when the four engines run
  }

  public onUpdate(): void {
    const deltaTimeMs = this.sysHost.deltaTime;

    this.timeSinceWriteMs += deltaTimeMs;
    if (this.timeSinceWriteMs >= FuelLeak.WRITE_PERIOD_MS) {
      const elapsedMs = this.timeSinceWriteMs;
      this.timeSinceWriteMs = 0;
      const poundsPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', SimVarValueType.Pounds);
      for (const { failure, msfsTank } of A380_FEED_TANK_LEAKS) {
        if (this.failures.isActive(failure)) {
          const quantityVar = `FUELSYSTEM TANK QUANTITY:${msfsTank}`;
          const gallons = SimVar.GetSimVarValue(quantityVar, SimVarValueType.GAL);
          const leaked = leakedGallons(gallons, poundsPerGallon, elapsedMs);
          if (leaked > 0) {
            SimVar.SetSimVarValue(quantityVar, SimVarValueType.GAL, gallons - leaked);
          }
        }
      }
    }

    let allEnginesRunning = true;
    let fuelUsedKg = 0;
    for (let engine = 1; engine <= 4; engine++) {
      allEnginesRunning = allEnginesRunning && SimVar.GetSimVarValue(`L:A32NX_ENGINE_STATE:${engine}`, 'Enum') === 1;
      fuelUsedKg += SimVar.GetSimVarValue(`L:A32NX_FUEL_USED:${engine}`, SimVarValueType.Number);
    }
    this.detection.update(
      {
        onGround: SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0,
        allEnginesRunning,
        jettisonInProgress: SimVar.GetSimVarValue('L:A380X_FUEL_JETTISON_IN_PROGRESS', SimVarValueType.Bool) > 0,
        fobKg: SimVar.GetSimVarValue('L:A32NX_TOTAL_FUEL_QUANTITY', SimVarValueType.Number),
        fuelUsedKg,
      },
      deltaTimeMs / 1000,
    );
    SimVar.SetSimVarValue(FUEL_LEAK_DETECTED_VAR, SimVarValueType.Bool, this.detection.isLeakDetected());
    SimVar.SetSimVarValue(FUEL_LEAK_DET_FAULT_VAR, SimVarValueType.Bool, this.detection.isDetectionFault());
  }
}
