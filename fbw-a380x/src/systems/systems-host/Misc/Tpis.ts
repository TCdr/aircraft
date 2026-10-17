// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FailuresConsumer } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';
import { TIRE_COUNT, TIRE_NORMAL_PRESSURE_PSI, tirePressureVar, tpisMeasurement } from '@shared/TirePressures';

/**
 * The deflation failure of each tire, tire 1 first (shared/TirePressures numbering: tires 1-20 as on the SD WHEEL page,
 * then the left and right nose tires).
 */
export const TIRE_DEFLATION_FAILURES: readonly number[] = [
  A380Failure.Tire1Deflation,
  A380Failure.Tire2Deflation,
  A380Failure.Tire3Deflation,
  A380Failure.Tire4Deflation,
  A380Failure.Tire5Deflation,
  A380Failure.Tire6Deflation,
  A380Failure.Tire7Deflation,
  A380Failure.Tire8Deflation,
  A380Failure.Tire9Deflation,
  A380Failure.Tire10Deflation,
  A380Failure.Tire11Deflation,
  A380Failure.Tire12Deflation,
  A380Failure.Tire13Deflation,
  A380Failure.Tire14Deflation,
  A380Failure.Tire15Deflation,
  A380Failure.Tire16Deflation,
  A380Failure.Tire17Deflation,
  A380Failure.Tire18Deflation,
  A380Failure.Tire19Deflation,
  A380Failure.Tire20Deflation,
  A380Failure.NoseTireLeftDeflation,
  A380Failure.NoseTireRightDeflation,
];

/**
 * Design choice (no published rate): a deflating tire loses 10 PSI/min, so that it is below the WHEEL TIRE PRESS LO
 * ground minimum (89 % of 217.5 PSI) after about 2.5 min and flat after about 22 min.
 */
export const TIRE_DEFLATION_RATE_PSI_PER_S = 10 / 60;

/**
 * The pressure of the tires. Each tire holds the normal pressure, 217.5 PSI, and loses pressure while its deflation
 * failure is active; it is back at the normal pressure when the failure is removed (the tire is replaced).
 * Not modelled: the effect of the tire temperature on the pressure (no published figure), the TPIS power supply.
 */
export class TirePressureModel {
  private readonly pressuresPsi: number[] = [];

  constructor() {
    for (let i = 0; i < TIRE_COUNT; i++) {
      this.pressuresPsi.push(TIRE_NORMAL_PRESSURE_PSI);
    }
  }

  /**
   * @param deltaTimeS elapsed time, s
   * @param deflating whether each tire deflates (tire 1 first)
   * @returns the tire pressures in PSI, tire 1 first
   */
  public update(deltaTimeS: number, deflating: readonly boolean[]): readonly number[] {
    for (let i = 0; i < TIRE_COUNT; i++) {
      this.pressuresPsi[i] = deflating[i]
        ? Math.max(0, this.pressuresPsi[i] - TIRE_DEFLATION_RATE_PSI_PER_S * deltaTimeS)
        : TIRE_NORMAL_PRESSURE_PSI;
    }
    return this.pressuresPsi;
  }
}

/**
 * The TPIS: measures the pressure of each tire, from 0 to 400 PSI by 5 PSI steps, for the SD WHEEL page
 * (L:A380X_TPIS_TIRE_n_PRESSURE).
 */
export class Tpis implements Instrument {
  /** The pressures are measured at most this often, ms */
  private static readonly UPDATE_PERIOD_MS = 1000;

  private readonly model = new TirePressureModel();

  /** The last written measurement of each tire, null before the first write */
  private readonly written: (number | null)[] = TIRE_DEFLATION_FAILURES.map(() => null);

  private timeSinceUpdateMs = Tpis.UPDATE_PERIOD_MS;

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly failuresConsumer: Pick<FailuresConsumer, 'register' | 'isActive'>,
  ) {}

  /** @inheritdoc */
  public init(): void {
    TIRE_DEFLATION_FAILURES.forEach((failure) => this.failuresConsumer.register(failure));
  }

  /** @inheritdoc */
  public onUpdate(): void {
    this.timeSinceUpdateMs += this.sysHost.deltaTime;
    if (this.timeSinceUpdateMs < Tpis.UPDATE_PERIOD_MS) {
      return;
    }
    const deltaTimeS = this.timeSinceUpdateMs / 1000;
    this.timeSinceUpdateMs = 0;

    const pressures = this.model.update(
      deltaTimeS,
      TIRE_DEFLATION_FAILURES.map((failure) => this.failuresConsumer.isActive(failure)),
    );
    pressures.forEach((pressure, i) => {
      const measured = tpisMeasurement(pressure);
      if (this.written[i] !== measured) {
        SimVar.SetSimVarValue(tirePressureVar(i + 1), SimVarValueType.Number, measured);
        this.written[i] = measured;
      }
    });
  }
}
