// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { Subject, SimVarValueType, Subscribable } from '@microsoft/msfs-sdk';
import { Arinc429Word, NXDataStore, NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { ADIRS } from '../shared/Adirs';

/**
 * The time reference of the PERM DATA SETUP (POSITION / TIME page): what the FMS shows where the A380 FCOM
 * (DSC-22-FMS-20-30, POSITION / REPORT and POSITION / MONITOR pages) says "UTC time (or flight time)".
 */
export enum FmsTimeReference {
  FlightTime,
  BlockTime,
  Date,
  UtcOnly,
}

/** Labels of the PERM DATA SETUP dropdown, in the order of {@link FmsTimeReference}. */
export const fmsTimeReferenceLabels: readonly string[] = ['FLT TIME', 'BLK TIME', 'DATE', 'UTC ONLY'];

const timeReferenceSettingKey = 'A380X_FMS_PERM_DATA_SETUP';

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const secondsPerDay = 86_400;

/**
 * Keeps the FMS times: UTC, the OOOI block times (out, off, on, in) with the resulting block and flight times, and the
 * PERM DATA SETUP time reference. The block time logic mirrors the OIT's ANSU (AnsuOps.ts, ref. patent US6308044B1):
 * out block = park brake released with the doors closed, off block = airborne for 10 s, on block = on ground below
 * 30 kt for 10 s, in block = park brake set with a door open and the hydraulics depressurised.
 */
export class FmsTimeKeeper {
  private readonly _timeReference = Subject.create<FmsTimeReference>(FmsTimeKeeper.loadTimeReference());

  /** UTC, in seconds since midnight */
  public readonly utcSeconds = Subject.create(0);

  /** UTC date as "DD MMM YYYY" */
  public readonly utcDate = Subject.create('-- --- ----');

  /** Simulator absolute time of the block events, in seconds */
  public readonly outBlockTime = Subject.create<number | null>(null);

  public readonly offBlockTime = Subject.create<number | null>(null);

  public readonly onBlockTime = Subject.create<number | null>(null);

  public readonly inBlockTime = Subject.create<number | null>(null);

  /** Block time (out to in, or out to now) in seconds */
  public readonly blockTime = Subject.create<number | null>(null);

  /** Flight time (off to on, or off to now) in seconds */
  public readonly flightTime = Subject.create<number | null>(null);

  private absoluteTime = 0;

  private parkBrakeSet: boolean | null = null;

  private onGround: boolean | null = null;

  private parkBrakeOffTime: number | null = null;

  private parkBrakeOnTime: number | null = null;

  private takeoffTime: number | null = null;

  private touchdownTime: number | null = null;

  private readonly offBlockConfNode = new NXLogicConfirmNode(10);

  private readonly onBlockConfNode = new NXLogicConfirmNode(10);

  /** The block times are only reset for a new flight after the previous one is complete for 15 minutes */
  private readonly turnaroundConfNode = new NXLogicConfirmNode(15 * 60);

  get timeReference(): Subscribable<FmsTimeReference> {
    return this._timeReference;
  }

  setTimeReference(reference: FmsTimeReference): void {
    this._timeReference.set(reference);
    NXDataStore.setLegacy(timeReferenceSettingKey, FmsTimeReference[reference]);
  }

  private static loadTimeReference(): FmsTimeReference {
    const stored = NXDataStore.getLegacy(timeReferenceSettingKey, FmsTimeReference[FmsTimeReference.UtcOnly]);
    const reference = FmsTimeReference[stored as keyof typeof FmsTimeReference];
    return reference ?? FmsTimeReference.UtcOnly;
  }

  /** @param deltaTime time since the last call, in milliseconds */
  update(deltaTime: number): void {
    this.absoluteTime = SimVar.GetGlobalVarValue('ABSOLUTE TIME', 'seconds');
    this.utcSeconds.set(Math.floor(SimVar.GetGlobalVarValue('ZULU TIME', 'seconds')) % secondsPerDay);
    this.utcDate.set(
      `${SimVar.GetGlobalVarValue('ZULU DAY OF MONTH', 'number').toFixed(0).padStart(2, '0')} ` +
        `${months[Math.max(0, Math.min(11, SimVar.GetGlobalVarValue('ZULU MONTH OF YEAR', 'number') - 1))]} ` +
        `${SimVar.GetGlobalVarValue('ZULU YEAR', 'number').toFixed(0)}`,
    );

    this.updateBlockTimes(deltaTime);
  }

  private updateBlockTimes(deltaTime: number): void {
    const parkBrakeSet = SimVar.GetSimVarValue('L:A32NX_PARK_BRAKE_LEVER_POS', SimVarValueType.Bool) as boolean;
    if (parkBrakeSet !== this.parkBrakeSet) {
      if (parkBrakeSet) {
        this.parkBrakeOnTime = this.absoluteTime;
      } else {
        this.parkBrakeOffTime = this.absoluteTime;
      }
      this.parkBrakeSet = parkBrakeSet;
    }

    const onGround = FmsTimeKeeper.readOnGround();
    if (onGround !== this.onGround) {
      if (onGround) {
        this.touchdownTime = this.absoluteTime;
      } else {
        this.takeoffTime = this.absoluteTime;
      }
      this.onGround = onGround;
    }

    const doorsOpen = SimVar.GetSimVarValue('INTERACTIVE POINT OPEN:0', SimVarValueType.PercentOver100) > 0.25;
    const hydraulicsPressurised =
      SimVar.GetSimVarValue('L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH', SimVarValueType.Bool) ||
      SimVar.GetSimVarValue('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', SimVarValueType.Bool);
    const computedAirspeed = ADIRS.getCalibratedAirspeed()?.valueOr(0) ?? 0;

    // Out block: doors closed and park brake released
    this.turnaroundConfNode.write(
      this.outBlockTime.get() !== null &&
        this.offBlockTime.get() !== null &&
        this.onBlockTime.get() !== null &&
        this.inBlockTime.get() !== null,
      deltaTime,
    );
    if ((this.turnaroundConfNode.read() || this.outBlockTime.get() === null) && !parkBrakeSet && !doorsOpen) {
      if (this.turnaroundConfNode.read()) {
        this.offBlockTime.set(null);
        this.onBlockTime.set(null);
        this.inBlockTime.set(null);
      }
      this.outBlockTime.set(this.parkBrakeOffTime);
    }

    // Off block: not on ground for 10 seconds
    this.offBlockConfNode.write(this.outBlockTime.get() !== null && !onGround, deltaTime);
    if (this.offBlockTime.get() === null && this.outBlockTime.get() !== null && this.offBlockConfNode.read()) {
      this.offBlockTime.set(this.takeoffTime);
    }

    // On block: on ground below 30 kt for 10 seconds
    this.onBlockConfNode.write(onGround && computedAirspeed < 30, deltaTime);
    if (this.onBlockTime.get() === null && this.offBlockTime.get() !== null && this.onBlockConfNode.read()) {
      this.onBlockTime.set(this.touchdownTime);
    }

    // In block: park brake set, a door open, hydraulics depressurised
    if (
      this.inBlockTime.get() === null &&
      this.onBlockTime.get() !== null &&
      parkBrakeSet &&
      doorsOpen &&
      !hydraulicsPressurised
    ) {
      this.inBlockTime.set(this.parkBrakeOnTime);
    }

    const outBlock = this.outBlockTime.get();
    const offBlock = this.offBlockTime.get();
    const onBlock = this.onBlockTime.get();
    const inBlock = this.inBlockTime.get();
    this.blockTime.set(outBlock !== null ? (inBlock ?? this.absoluteTime) - outBlock : null);
    this.flightTime.set(offBlock !== null ? (onBlock ?? this.absoluteTime) - offBlock : null);
  }

  /** On ground per the FWC (discrete word 126 bit 28), as the OIT uses it; FWC 2 when FWC 1 has no valid word. */
  private static readOnGround(): boolean {
    const fwc1 = Arinc429Word.fromSimVarValue('L:A32NX_FWC_1_DISCRETE_WORD_126');
    if (fwc1.isNormalOperation()) {
      return fwc1.bitValue(28);
    }
    return Arinc429Word.fromSimVarValue('L:A32NX_FWC_2_DISCRETE_WORD_126').bitValueOr(28, true);
  }

  /** Formats a duration or a time of day as HH:MM ("--:--" when unknown). */
  static formatHoursMinutes(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) {
      return '--:--';
    }
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /** Formats a time of day as HH:MM:SS. */
  static formatHoursMinutesSeconds(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) {
      return '--:--:--';
    }
    const total = Math.max(0, Math.floor(seconds));
    return `${FmsTimeKeeper.formatHoursMinutes(total)}:${(total % 60).toString().padStart(2, '0')}`;
  }

  /**
   * Formats a point in time the way the PERM DATA SETUP asks for: UTC, or the flight (block) time elapsed at that
   * moment since the off (out) block time.
   * @param absoluteTimeSeconds the simulator absolute time of the event, in seconds
   */
  formatEventTime(absoluteTimeSeconds: number | null): string {
    if (absoluteTimeSeconds === null) {
      return '--:--';
    }

    switch (this._timeReference.get()) {
      case FmsTimeReference.FlightTime: {
        const offBlock = this.offBlockTime.get();
        return FmsTimeKeeper.formatHoursMinutes(offBlock !== null ? absoluteTimeSeconds - offBlock : null);
      }
      case FmsTimeReference.BlockTime: {
        const outBlock = this.outBlockTime.get();
        return FmsTimeKeeper.formatHoursMinutes(outBlock !== null ? absoluteTimeSeconds - outBlock : null);
      }
      default: {
        const utc = this.utcSeconds.get() + (absoluteTimeSeconds - this.absoluteTime);
        return FmsTimeKeeper.formatHoursMinutes(((utc % secondsPerDay) + secondsPerDay) % secondsPerDay);
      }
    }
  }

  /** Formats a prediction given in seconds from now, per the PERM DATA SETUP time reference. */
  formatEta(secondsFromPresent: number | null | undefined): string {
    if (secondsFromPresent === null || secondsFromPresent === undefined || Number.isNaN(secondsFromPresent)) {
      return '--:--';
    }
    return this.formatEventTime(this.absoluteTime + secondsFromPresent);
  }
}
