//  Copyright (c) 2024-2025-2026 FlyByWire Simulations
//  SPDX-License-Identifier: GPL-3.0
import { MappedSubject, Subject, Subscribable, Subscription, Unit, UnitFamily, UnitType } from '@microsoft/msfs-sdk';
import { Fix } from '@flybywiresim/fbw-sdk';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { Mmo, maxCertifiedAlt } from '@shared/PerformanceConstants';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';
import { A380FmsError } from '../../shared/A380FmsError';

type FieldFormatTuple = [value: string | null, unitLeading: string | null, unitTrailing: string | null];
const RANGE_FROM_KEY = '{FROM}';
const RANGE_TO_KEY = '{TO}';
const ERROR_UNIT = '{UNIT}';
const FORMAT = '{FORMAT}';
const FORMAT_ERROR_DETAILS_MESSAGE = `FORMAT: ${FORMAT}${ERROR_UNIT}`;
const ENTRY_OUT_OF_RANGE_DETAILS_MESSAGE = `RNG: ${RANGE_FROM_KEY} TO ${RANGE_TO_KEY}${ERROR_UNIT}`;

function getFormattedEntryOutOfRangeError(minValue: string, maxValue: string, unit?: string): A380FmsError {
  return new A380FmsError(
    FmsErrorType.EntryOutOfRange,
    ENTRY_OUT_OF_RANGE_DETAILS_MESSAGE.replace(RANGE_FROM_KEY, minValue)
      .replace(RANGE_TO_KEY, maxValue)
      .replace(ERROR_UNIT, unit ? ` ${unit}` : ''),
  );
}

function getFormattedFormatError(format: string, unit?: string): A380FmsError {
  return new A380FmsError(
    FmsErrorType.FormatError,
    FORMAT_ERROR_DETAILS_MESSAGE.replace(FORMAT, format).replace(ERROR_UNIT, unit ? ` ${unit}` : ''),
  );
}
export interface DataEntryFormat<T, U = T> {
  placeholder: string;
  maxDigits: number;
  maxOverflowDigits?: number;
  unit?: string;
  format(value: T | null): FieldFormatTuple;
  parse(input: string): Promise<U | null>;
  /**
   * If modified or notify()ed, triggers format() in the input field (i.e. when dependencies to value have changed)
   */
  reFormatTrigger?: Subscribable<boolean>;

  unitFamily?: Subscribable<Unit<UnitFamily>>;
  destroy?: () => void;
}

const distanceUnitFormatter = (unit: Unit<UnitFamily.Distance>) => {
  return unit === UnitType.METER ? 'M' : 'FT';
};

const weightUnitFormatter = (unit: Unit<UnitFamily.Weight>) => {
  return unit === UnitType.KILOGRAM ? 'T' : 'KLB';
};

class SubscriptionCollector {
  protected readonly subscriptions: Subscription[] = [];

  destroy() {
    for (const s of this.subscriptions) {
      s.destroy();
    }
  }
}

export class SpeedKnotsFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public maxDigits = 3;

  public readonly unit = 'KT';

  private readonly requiredFormat = 'XXX';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }

    if (nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    } else {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class SpeedMachFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '.--';

  public maxDigits = 3;

  private readonly requiredFormat = 'XX';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [`.${value.toFixed(2).split('.')[1]}`, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    let nbr = Number(input);
    if (nbr > Mmo && !input.search('.')) {
      nbr = Number(`0.${input}`);
    }
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString());
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class AltitudeOrFlightLevelFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '-----';

  public maxDigits = 5;

  private minValue = 0;

  private readonly requiredFormat = 'FOR ALT XXXXX FOR FL XXX';

  private maxValue = maxCertifiedAlt;

  private transAlt: number | null = null;

  /**
   * The last value entered as a flight level (3 characters or less): FCOM DSC-22-FMS-20-100 (ACCEL ALT, ALT, EO ACCEL,
   * PRED TO, THR RED): "the FMS considers the entry as a flight level. In this case, the unit of the entry field reverts
   * to FL".
   */
  private flightLevelEntry: number | null = null;

  reFormatTrigger = Subject.create(false);

  constructor(
    transAlt: Subscribable<number | null> | null = null,
    private readonly isTransAltFlightLevel: Subscribable<boolean> = Subject.create(false),
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(maxCertifiedAlt),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));

    if (transAlt !== null) {
      this.subscriptions.push(
        MappedSubject.create(
          ([val, isFl]) => (val !== null ? (isFl ? val * 100 : val) : null),
          transAlt,
          isTransAltFlightLevel,
        ).sub((val) => {
          this.transAlt = val;
          this.reFormatTrigger.notify();
        }),
      );
    }
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, 'FT'] as FieldFormatTuple;
    }
    if (value === this.flightLevelEntry) {
      return [(value / 100).toFixed(0).padStart(3, '0'), 'FL', null] as FieldFormatTuple;
    }
    if (this.transAlt !== null) {
      if (
        (!this.isTransAltFlightLevel.get() && value > this.transAlt) ||
        (this.isTransAltFlightLevel.get() && value >= this.transAlt)
      ) {
        return [(value / 100).toFixed(0).toString().padStart(3, '0'), 'FL', null] as FieldFormatTuple;
      }
    }
    return [value.toFixed(0).toString(), null, 'FT'] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    // NNNNN = feet, NNN (or FLNNN) = flight level
    const flMatch = input.match(/^FL(\d{1,3})$/);
    const isFlightLevel = flMatch !== null || input.length <= 3;
    const nbr = flMatch !== null ? Number(flMatch[1]) * 100 : isFlightLevel ? Number(input) * 100 : Number(input);

    if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat);
    } else if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    }

    this.flightLevelEntry = isFlightLevel ? nbr : null;
    return nbr;
  }

  destroy(): void {
    super.destroy();
  }
}

export class AltitudeFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '-----';

  public maxDigits = 5;

  public readonly unit = 'FT';

  private readonly requiredFormat = 'XXXXX';

  private minValue = 0;

  private maxValue = maxCertifiedAlt;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(maxCertifiedAlt),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

/**
 * Unit of value: Feet (i.e. FL * 100)
 */
export class FlightLevelFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 3;

  public readonly maxOverflowDigits = 2;

  public readonly unit = 'FL';

  private readonly requiredFormat = `FL XXX`;

  private minValue = 0;

  private maxValue = maxCertifiedAlt;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(maxCertifiedAlt / 100),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, this.unit, null] as FieldFormatTuple;
    }
    const fl = Math.round(value);
    return [fl.toFixed(0).toString().padStart(3, '0'), this.unit, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    // Accept "FL" followed by 1 to 3 digits, e.g. "FL30" or "FL300"
    let nbr: number = Number(input);
    if (Number.isNaN(nbr)) {
      const flMatch = input.match(/^FL(\d{1,3})$/i);
      if (flMatch) {
        nbr = Number(flMatch[1]);
      }
    }

    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat);
    }

    return nbr;
  }

  destroy(): void {
    super.destroy();
  }
}

export const RADIO_ALTITUDE_NODH_VALUE = 0;
export class RadioAltitudeFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '-----';

  public maxDigits = 5;

  private minValue = 0;

  private maxValue = maxCertifiedAlt;

  constructor(
    minValue: Subscribable<number> = Subject.create(1),
    maxValue: Subscribable<number> = Subject.create(maxCertifiedAlt),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, 'FT'] as FieldFormatTuple;
    }
    if (value === RADIO_ALTITUDE_NODH_VALUE) {
      return ['NO DH', null, null] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, 'FT'] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    if (input === 'NO DH' || input === 'NODH' || input === 'NONE' || input === 'NO') {
      return RADIO_ALTITUDE_NODH_VALUE;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    //FIXME: Confirm entry out of range and format error messages.
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw new FmsError(FmsErrorType.FormatError);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class TropoFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-----';

  public readonly unit = 'FT';

  public maxDigits = 5;

  private readonly requiredFormat = 'FOR ALT XXXXX FOR FL XXX';

  private minValue = 1000;

  private maxValue = 60000;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = input.length <= 3 ? Number(input) * 100 : Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

export class LengthFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '-'.repeat(this.maxDigits);

  private readonly requiredFormat = 'XXXX';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
    public readonly unitFamily: Subscribable<Unit<UnitFamily.Distance>> = Subject.create(UnitType.METER),
    public readonly maxDigits = 4,
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    const unit = distanceUnitFormatter(this.unitFamily.get());
    if (value === null || value === undefined) {
      return [this.placeholder, null, unit] as FieldFormatTuple;
    }

    value = this.unitFamily.get().convertFrom(value, UnitType.METER);

    return [value.toFixed(0), null, unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const unitFamily = this.unitFamily.get();
    const nbr = unitFamily.convertTo(Number(input), UnitType.METER);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat, distanceUnitFormatter(unitFamily));
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class WeightFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '---.-';

  public readonly maxDigits = 5;

  private readonly requiredFormat = 'XXX.X';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
    public readonly unitFamily: Subscribable<Unit<UnitFamily.Weight>> = Subject.create(UnitType.KILOGRAM),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    const unit = weightUnitFormatter(this.unitFamily.get());
    if (value === null || value === undefined) {
      return [this.placeholder, null, unit] as FieldFormatTuple;
    }

    value = this.unitFamily.get().convertFrom(value, UnitType.KILOGRAM);

    return [(value / 1000).toFixed(1), null, unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const unitFamily = this.unitFamily.get();
    const displayUnit = weightUnitFormatter(unitFamily);
    const convertedInput = unitFamily.convertTo(Number(input), UnitType.KILOGRAM);

    const nbr = convertedInput * 1000;
    if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat, displayUnit);
    }
    if (nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    } else {
      throw getFormattedEntryOutOfRangeError(
        (unitFamily.convertFrom(this.minValue, UnitType.KILOGRAM) / 1000).toFixed(1),
        (unitFamily.convertFrom(this.maxValue, UnitType.KILOGRAM) / 1000).toFixed(1),
        displayUnit,
      );
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class PercentageFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '--.-';

  public maxDigits = 4;

  public readonly isValidating = Subject.create(false);

  public readonly unit = '%';

  private requiredFormat = 'XX.X';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
    /** Decimals of the value (FCOM DSC-22-FMS-20-100: 1 for THS, ZFWCG and RTE RSV, 0 for N1 (NOISE)) */
    private readonly decimals = 1,
  ) {
    super();
    if (decimals === 0) {
      this.placeholder = '---';
      this.maxDigits = 3;
      this.requiredFormat = 'XXX';
    }
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(this.decimals), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (this.decimals === 0 && !Number.isInteger(nbr)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(
        this.minValue.toFixed(this.decimals),
        this.maxValue.toFixed(this.decimals),
        this.unit,
      );
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class TemperatureFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public maxDigits = 3;

  public readonly unit = '°C';

  private readonly requiredFormat = '+/-XX';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    if (value >= 0) {
      return [`+${value.toFixed(0).toString()}`, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class CrzTempFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly unit = '°C';

  private readonly requiredFormat = '+/-XXX';

  public maxDigits = 3;

  private minValue = -99;

  private maxValue = 99;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    if (value >= 0) {
      return [`+${value.toFixed(0).toString()}`, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    let nbr = Number(input);

    if (nbr > 0 && input.substring(0, 1) !== '+') {
      nbr *= -1;
    }

    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), 'C');
    } else {
      throw getFormattedFormatError(this.requiredFormat, 'C');
    }
  }
}

/**
 * Altitude of a climb or descent wind entry (A380 FCOM DSC-22-FMS-20-100 p. 30 "WIND ALTITUDE": NNN = flight level,
 * NNNNN = feet, from FL 1 / 1 ft to the maximum certified altitude). The WIND page shows it in feet below the transition
 * altitude and as a flight level above it, and "GND" for a ground wind, which the crew enters as "GND" or as an altitude
 * within 400 ft of the airport (A380 FCOM DSC-22-FMS-20-30, CLIMB / DESCENT WIND ENTRY FIELDS).
 */
export class WindAltitudeFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  /** A wind at or below the airport elevation plus this height is a ground wind (FCOM: "less than 400 ft"). */
  private static readonly GroundWindBandFeet = 400;

  public readonly placeholder = '-----';

  public readonly maxDigits = 5;

  private readonly requiredFormat = 'FOR ALT XXXXX FOR FL XXX OR GND';

  private transitionAltitudeFeet: number | null = null;

  private groundAltitude: number | null = null;

  /**
   * Altitudes entered (or uplinked) as flight levels: without a transition altitude (none in the navigation database)
   * they keep the unit of their entry, FL for NNN (FCOM DSC-22-FMS-20-100 "WIND ALTITUDE": NNN = FL, NNNNN = FT).
   */
  private readonly flightLevelAltitudes = new Set<number>();

  public readonly reFormatTrigger = Subject.create(false);

  /** The altitudes of the shown winds that were entered or uplinked as flight levels */
  public setFlightLevelAltitudes(altitudes: Iterable<number>): void {
    this.flightLevelAltitudes.clear();
    for (const altitude of altitudes) {
      this.flightLevelAltitudes.add(altitude);
    }
    this.reFormatTrigger.notify();
  }

  /** Whether the altitude was last entered as a flight level */
  public isFlightLevelEntry(altitude: number): boolean {
    return this.flightLevelAltitudes.has(altitude);
  }

  /**
   * @param transitionAltitudeFeet transition altitude (climb) or transition level in feet (descent)
   * @param groundAltitude elevation of the airport the winds refer to, in feet
   */
  constructor(transitionAltitudeFeet: Subscribable<number | null>, groundAltitude: Subscribable<number | null>) {
    super();
    this.subscriptions.push(
      transitionAltitudeFeet.sub((v) => {
        this.transitionAltitudeFeet = v;
        this.reFormatTrigger.notify();
      }, true),
      groundAltitude.sub((v) => {
        this.groundAltitude = v;
        this.reFormatTrigger.notify();
      }, true),
    );
  }

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, 'FT'];
    }
    // Without the airport elevation, GND is stored as 0 ft
    if (value <= (this.groundAltitude ?? 0) + WindAltitudeFormat.GroundWindBandFeet) {
      return ['GND', null, null];
    }
    const isFlightLevel =
      this.transitionAltitudeFeet !== null ? value > this.transitionAltitudeFeet : this.flightLevelAltitudes.has(value);
    if (isFlightLevel) {
      return [(value / 100).toFixed(0).padStart(3, '0'), 'FL', null];
    }
    return [value.toFixed(0), null, 'FT'];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (input === 'GND') {
      return this.groundAltitude ?? 0;
    }

    const match = input.match(/^(?:FL)?(\d{1,3})$|^(\d{4,5})$/);
    if (!match) {
      throw getFormattedFormatError(this.requiredFormat);
    }

    const altitude = match[2] !== undefined ? Number(match[2]) : Number(match[1]) * 100;
    if (altitude < 1 || altitude > maxCertifiedAlt) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    }
    if (match[2] === undefined) {
      this.flightLevelAltitudes.add(altitude);
    } else {
      this.flightLevelAltitudes.delete(altitude);
    }
    return altitude;
  }
}

export class WindDirectionFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly unit = '°';

  public maxDigits = 3;

  private readonly requiredFormat = 'XXX';

  private minValue = 0;

  private maxValue = 359;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString().padStart(3, '0'), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }
}

export class WindSpeedFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly unit = 'KT';

  public maxDigits = 3;

  private minValue = 0;

  private maxValue = 250;

  private readonly requiredFormat = 'XXX';

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString().padStart(3, '0'), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }
}

export class TripWindFormat implements DataEntryFormat<number> {
  public placeholder = '-----';

  public maxDigits = 5;

  private readonly requiredFormat = '+/-XXX';

  public readonly unit = 'KT';

  private minValue = -250;

  private maxValue = 250;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }

    // FCOM DSC-22-FMS-20-30 INIT page: a zero trip wind reads HD000
    if (value > 0) {
      return [Math.abs(value).toFixed(0).toString().padStart(3, '0'), 'TL', null] as FieldFormatTuple;
    }
    return [Math.abs(value).toFixed(0).toString().padStart(3, '0'), 'HD', null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    let sign = +1;
    let number = 0;

    if (input.substring(0, 2) === 'HD') {
      sign = -1;
      number = Number(input.substring(2));
    } else if (input.substring(0, 1) === '-' || input.substring(0, 1) === 'H') {
      sign = -1;
      number = Number(input.substring(1));
    } else if (input.substring(0, 2) === 'TL') {
      sign = +1;
      number = Number(input.substring(2));
    } else if (input.substring(0, 1) === '+' || input.substring(0, 1) === 'T') {
      sign = +1;
      number = Number(input.substring(1));
    } else {
      sign = +1;
      number = Number(input);
    }

    if (Number.isNaN(number)) {
      throw getFormattedFormatError(this.requiredFormat);
    }

    const nbr = Number(sign * number);
    if (nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    } else {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    }
  }
}

export class QnhFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  /** 1-4 digits */
  static readonly QNH_REGEX_HPA = /^\d{1,4}$/;

  /** 4 digits or with a decimal point (NN.NN) */
  static readonly QNH_REGEX_INCHES = /^\d{2}\.{0,1}\d{2}$/;

  static readonly HPA_PLACE_HOLDER = '----';

  static readonly INHG_PLACE_HOLDER = '--.--';

  public placeholder = QnhFormat.HPA_PLACE_HOLDER;

  public readonly maxDigits = 5;

  private readonly requiredFormat = 'XXXX';

  private readonly minHpaValue = 745;

  private readonly maxHpaValue = 1100;

  private readonly minInHgValue = 22.0;

  private readonly maxInHgValue = 32.48;

  readonly reFormatTrigger = Subject.create(false);

  constructor(private readonly isHpa: Subscribable<boolean> = Subject.create(true)) {
    super();
    this.subscriptions.push(
      this.isHpa.sub((isHpa) => {
        this.placeholder = isHpa ? QnhFormat.HPA_PLACE_HOLDER : QnhFormat.INHG_PLACE_HOLDER;
        this.reFormatTrigger?.notify();
      }, true),
    );
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value < this.minHpaValue ? value.toFixed(2) : value.toFixed(0), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const parsedInput = Number.parseFloat(input);

    if (Number.isNaN(parsedInput)) {
      throw getFormattedFormatError(this.requiredFormat);
    }

    // Test inches first (NNNN or NN.NN)
    if (QnhFormat.QNH_REGEX_INCHES.test(input)) {
      const containsDecimal = input.indexOf('.') !== -1;
      const inchesInDecimal = containsDecimal ? parsedInput : parsedInput / 100;
      const isValidInches = inchesInDecimal <= this.maxInHgValue && inchesInDecimal >= this.minInHgValue;
      if (isValidInches) {
        return inchesInDecimal;
      } else if (containsDecimal) {
        // If it contains a decimal we consider inches entry and quit early, otherwise we need to continue as NNNN is valid hpa.
        throw getFormattedEntryOutOfRangeError(this.minInHgValue.toFixed(2), this.maxInHgValue.toFixed(2));
      }
    }

    // N, NN, NNN or NNNN
    if (QnhFormat.QNH_REGEX_HPA.test(input)) {
      if (parsedInput > this.maxHpaValue || parsedInput < this.minHpaValue) {
        throw getFormattedEntryOutOfRangeError(this.minHpaValue.toString(), this.maxHpaValue.toString());
      }
      return parsedInput;
    }
    throw getFormattedFormatError(this.requiredFormat);
  }
}

export class CostIndexFormat implements DataEntryFormat<number> {
  public placeholder = '---';

  public maxDigits = 3;

  private minValue = 0;

  private maxValue = 999; // DSC-22-FMS-20-100

  private readonly requiredFormat = 'XXX';

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toString(), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString());
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

export class VerticalSpeedFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '---';

  public maxDigits = 4;

  public readonly unit = 'FT/MN';

  private readonly requiredFormat = '+/-XXXX';

  private minValue = 0;

  private maxValue = Number.POSITIVE_INFINITY;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class DescentRateFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '----';

  public maxDigits = 4;

  public readonly unit = 'FT/MN';

  private readonly requiredFormat = '-XXXX';

  private minValue = Number.NEGATIVE_INFINITY;

  private maxValue = 0;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(Number.POSITIVE_INFINITY),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toString(), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    let nbr = Number(input);

    if (nbr > 0) {
      nbr *= -1;
    }

    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class FixFormat implements DataEntryFormat<Fix, string> {
  public readonly placeholder = '-------';

  public readonly maxDigits = 7;

  private readonly requiredFormat = 'XXXXX';

  async parse(input: string): Promise<string | null> {
    if (input.trim().length === 0) {
      return null;
    }

    if (WaypointEntryUtils.isPlaceFormat(input) || WaypointEntryUtils.isRunwayFormat(input)) {
      return input;
    }

    throw getFormattedFormatError(this.requiredFormat);
  }

  format(value: Fix | null): FieldFormatTuple {
    if (!value) {
      return [this.placeholder, null, null];
    }

    return [value.ident, null, null];
  }
}

export class AirportFormat implements DataEntryFormat<string> {
  public readonly placeholder = '----';

  public readonly maxDigits = 4;

  constructor() {}

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    if (input.length != 4) {
      throw getFormattedFormatError('AAAA');
    }

    return input;
  }
}

export class NavaidIdentFormat implements DataEntryFormat<string> {
  public maxDigits = 4;

  constructor(public placeholder = '----') {}

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    return input;
  }
}

export class AirwayFormat implements DataEntryFormat<string> {
  public placeholder = '---';

  public maxDigits = 5;

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    return input;
  }
}

export class DropdownFieldFormat implements DataEntryFormat<string> {
  public placeholder = '';

  public maxDigits = 6;

  constructor(numDigits: number) {
    this.maxDigits = numDigits;
    this.placeholder = '-'.repeat(numDigits);
  }

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    return input;
  }
}

export class WaypointFormat implements DataEntryFormat<string> {
  public placeholder = '-------';

  public maxDigits = 7;

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    return input;
  }
}

/** Free text of a given maximum length, e.g. the 24 characters sent with the position report (A380 FCOM, POSITION / REPORT page). */
export class FreeTextFormat implements DataEntryFormat<string> {
  public readonly placeholder: string;

  constructor(public readonly maxDigits: number) {
    this.placeholder = '-'.repeat(Math.min(maxDigits, 10));
  }

  public format(value: string | null): FieldFormatTuple {
    return [value ? value : this.placeholder, null, null];
  }

  public async parse(input: string): Promise<string | null> {
    if (input === '') {
      return null;
    }
    if (input.length > this.maxDigits) {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
    return input;
  }
}

export class LongAlphanumericFormat implements DataEntryFormat<string> {
  public readonly placeholder = '----------';

  public readonly maxDigits = 10;

  public format(value: string) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '' || input === this.placeholder) {
      return null;
    }

    return input;
  }
}

export class PaxNbrFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public maxDigits = 3;

  private readonly requiredFormat = 'XXX';

  private minValue = 0;

  private maxValue = 999;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString());
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

// Stored in minutes
export class TimeHHMMFormat implements DataEntryFormat<number> {
  public placeholder = '--:--';

  public maxDigits = 4;

  private readonly requiredFormat = 'HHMM';

  private readonly minValue = 0;

  private readonly maxValue = 90;

  public format(value: number) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    const hours = Math.abs(Math.floor(value / 60))
      .toFixed(0)
      .padStart(2, '0');
    const minutes = Math.abs(value % 60)
      .toFixed(0)
      .padStart(2, '0');
    return [`${hours}:${minutes}`, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const replacedInput = input.replace(':', '');
    let hours = 0;
    let minutes = 0;
    minutes = Number(replacedInput.slice(-2));
    if (replacedInput.length > 2) {
      hours = Number(replacedInput.slice(0, -2));
    }

    if (minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    }

    const nbr = minutes + hours * 60;
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

/**
 * Stored in seconds
 */
export class TimeHHMMSSFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--:--:--';

  public maxDigits = 6;

  private readonly requiredFormat = 'HHMMSS';

  private minValue = 0;

  private maxValue = 86400;

  public format(value: number) {
    if (!value) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    const hours = Math.abs(Math.floor(value / 3600))
      .toFixed(0)
      .padStart(2, '0');
    const minutes = Math.abs(Math.floor(value / 60) % 60)
      .toFixed(0)
      .padStart(2, '0');
    const seconds = Math.abs(value % 60)
      .toFixed(0)
      .padStart(2, '0');
    return [`${hours}:${minutes}:${seconds}`, null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const replacedInput = input.replace(':', '');
    if (replacedInput.length < 4) {
      return null;
    }

    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    minutes = Number(replacedInput.slice(2, 4));
    hours = Number(replacedInput.slice(0, 2));
    if (replacedInput.length > 4) {
      seconds = Number(replacedInput.slice(-2));
    }
    if (seconds < 0 || seconds > 59 || minutes < 0 || minutes > 59 || hours < 0 || hours > 23) {
      return null;
    }

    const nbr = seconds + minutes * 60 + hours * 3600;
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

/**
 * Latitude of the DATA pages (A380 FCOM DSC-22-FMS-20-100 "LAT": XDD°MM.M, DD°MM.MX, XDDMM.M, DDMM.MX, XDD or DDX,
 * X = N or S). Displayed as DD°MM.MX. The value is in decimal degrees, positive north.
 */
export class LatitudeDmsFormat implements DataEntryFormat<number> {
  public readonly placeholder: string = '--°--.--';

  public readonly maxDigits = 8;

  private readonly requiredFormat = 'XDDMM.M OR DDMM.MX';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [formatDegreesMinutes(value, 2, value < 0 ? 'S' : 'N'), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const value = parseDegreesMinutes(input, 'N', 'S', 90, this.requiredFormat);
    return value;
  }
}

/**
 * Longitude of the DATA pages (A380 FCOM DSC-22-FMS-20-100 "LONG": YDDD°MM.M, DDD°MM.MY, YDDDMM.M, DDDMM.MY, YDDD or
 * DDDY, Y = E or W). Displayed as DDD°MM.MY. The value is in decimal degrees, positive east.
 */
export class LongitudeDmsFormat implements DataEntryFormat<number> {
  public readonly placeholder: string = '---°--.--';

  public readonly maxDigits = 9;

  private readonly requiredFormat = 'YDDDMM.M OR DDDMM.MY';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [formatDegreesMinutes(value, 3, value < 0 ? 'W' : 'E'), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    return parseDegreesMinutes(input, 'E', 'W', 180, this.requiredFormat);
  }
}

function formatDegreesMinutes(value: number, degreeDigits: number, hemisphere: string): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${degrees.toFixed(0).padStart(degreeDigits, '0')}°${minutes.toFixed(1).padStart(4, '0')}${hemisphere}`;
}

/** Parses the FCOM LAT / LONG entry formats (hemisphere letter leading or trailing, minutes optional). */
function parseDegreesMinutes(
  input: string,
  positiveLetter: string,
  negativeLetter: string,
  maxDegrees: number,
  requiredFormat: string,
): number {
  const match = input
    .toUpperCase()
    .match(
      new RegExp(
        `^([${positiveLetter}${negativeLetter}])?(\\d{1,3})(?:°?(\\d{2}(?:\\.\\d)?))?([${positiveLetter}${negativeLetter}])?$`,
      ),
    );
  if (!match || (match[1] !== undefined) === (match[4] !== undefined)) {
    throw getFormattedFormatError(requiredFormat);
  }
  const hemisphere = match[1] ?? match[4];
  const degrees = Number(match[2]);
  const minutes = match[3] !== undefined ? Number(match[3]) : 0;
  if (Number.isNaN(degrees) || Number.isNaN(minutes) || minutes >= 60) {
    throw getFormattedFormatError(requiredFormat);
  }
  const value = degrees + minutes / 60;
  if (value > maxDegrees) {
    throw new A380FmsError(FmsErrorType.EntryOutOfRange);
  }
  return hemisphere === negativeLetter ? -value : value;
}

/** Bearing of a place/bearing entry (A380 FCOM DSC-22-FMS-20-100, PBD / PB-PB: NNN, degrees, 0 to 360). */
export class BearingFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 3;

  public readonly unit = '°';

  private readonly requiredFormat = 'NNN';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [(Math.round(value) % 360).toFixed(0).padStart(3, '0'), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{1,3}$/)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    const value = Number(input);
    if (value > 360) {
      throw getFormattedEntryOutOfRangeError('0', '360', this.unit);
    }
    return value;
  }
}

/** Distance of a place/bearing/distance entry (A380 FCOM DSC-22-FMS-20-100, PBD: NNN.N nautical miles). */
export class DistanceFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---.-';

  public readonly maxDigits = 5;

  public readonly unit = 'NM';

  private readonly requiredFormat = 'NNN.N';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [value.toFixed(1), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{1,3}(\.\d)?$/)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    const value = Number(input);
    if (value <= 0 || value > 999.9) {
      throw getFormattedEntryOutOfRangeError('0.1', '999.9', this.unit);
    }
    return value;
  }
}

/**
 * Elevation of a NAVAID or runway (A380 FCOM DSC-22-FMS-20-100 "NAVAID ELEVATION": ±NNNNN feet, -1 000 to 20 470 ft,
 * no sign means +).
 */
export class ElevationFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-----';

  public readonly maxDigits = 6;

  public readonly unit = 'FT';

  private readonly requiredFormat = '+/-NNNNN';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [Math.round(value).toFixed(0), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^[+-]?\d{1,5}$/)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    const value = Number(input);
    if (value < -1000 || value > 20470) {
      throw getFormattedEntryOutOfRangeError('-1000', '20470', this.unit);
    }
    return value;
  }
}

/**
 * Station declination of a VOR (A380 FCOM DSC-22-FMS-20-100 "STATION DECLINATION": NNNY, Y = W or E, 0 to 360°).
 * The value is in degrees, positive east.
 */
export class StationDeclinationFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 4;

  private readonly requiredFormat = 'NNNY';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [`${Math.abs(Math.round(value)).toFixed(0).padStart(3, '0')}°${value < 0 ? 'W' : 'E'}`, null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const match = input.toUpperCase().match(/^(\d{1,3})([EW])$/);
    if (!match) {
      throw getFormattedFormatError(this.requiredFormat);
    }
    const value = Number(match[1]);
    if (value > 360) {
      throw getFormattedEntryOutOfRangeError('0', '360', '°');
    }
    return match[2] === 'W' ? -value : value;
  }
}

/** GLS channel (five digits, 20001 to 99999). */
export class GlsChannelFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-----';

  public readonly maxDigits = 5;

  private readonly requiredFormat = 'NNNNN';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [value.toFixed(0), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{5}$/)) {
      throw getFormattedFormatError(this.requiredFormat);
    }
    const value = Number(input);
    // FCOM DSC-22-FMS-20-100 CHANNEL (GLS): 20001 to 99999
    if (value < 20001 || value > 99999) {
      throw getFormattedEntryOutOfRangeError('20001', '99999');
    }
    return value;
  }
}

/** GLS slope (A380 FCOM DSC-22-FMS-20-100 "LS SLOPE": AN.N, -9.9 to 0°, "-" by default). */
export class GlsSlopeFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-.-';

  public readonly maxDigits = 4;

  public readonly unit = '°';

  private readonly requiredFormat = '-N.N';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [value.toFixed(1), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^-?\d(\.\d)?$/)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    const value = -Math.abs(Number(input));
    if (value < -9.9) {
      throw getFormattedEntryOutOfRangeError('-9.9', '0', this.unit);
    }
    return value;
  }
}

/** A number from a small set of allowed integers, e.g. the approach category (1, 2, 3) or the figure of merit (0-3). */
export class SmallIntegerFormat implements DataEntryFormat<number> {
  public readonly placeholder = '-';

  public readonly maxDigits = 1;

  constructor(
    private readonly minValue: number,
    private readonly maxValue: number,
  ) {}

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [value.toFixed(0), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d$/)) {
      throw getFormattedFormatError('N');
    }
    const value = Number(input);
    if (value < this.minValue || value > this.maxValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString());
    }
    return value;
  }
}

/** Company route ident (up to 10 alphanumeric characters, as the SimBridge company routes). */
export class CompanyRouteFormat implements DataEntryFormat<string> {
  public readonly placeholder = '----------';

  public readonly maxDigits = 10;

  private readonly requiredFormat = 'XXXXXXXXXX';

  public format(value: string | null): FieldFormatTuple {
    return [value ? value : this.placeholder, null, null];
  }

  public async parse(input: string): Promise<string | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^[A-Z0-9]{1,10}$/i)) {
      throw getFormattedFormatError(this.requiredFormat);
    }
    return input.toUpperCase();
  }
}

export class LatitudeFormat implements DataEntryFormat<number> {
  public placeholder = '----.--';

  public maxDigits = 7;

  private minValue = -90;

  private maxValue = 90;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(0).toString(), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    } else {
      throw new A380FmsError(FmsErrorType.FormatError);
    }
  }
}

export class HeadingFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '---.-';

  public maxDigits = 5;

  public readonly unit = '°';

  private readonly requiredFormat = 'XXX.X';

  private minValue = 0;

  private maxValue = 360.0;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(360),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, '°T'] as FieldFormatTuple;
    }
    return [value.toFixed(1), null, '°T'] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(
        this.minValue.toFixed(1).padStart(4, '0'),
        this.maxValue.toFixed(1),
        this.unit,
      );
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

// Still need to find a way to store whether course is true or magnetic
export class InboundCourseFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '---';

  public maxDigits = 4;

  public readonly unit = '°';

  private readonly requiredFormat = 'XXX';

  private minValue = 0;

  private maxValue = 360.0;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(360),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(0), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    // FCOM DSC-22-FMS-20-100 INBOUND CRS: NNNB or BNNN, B = M or nothing for magnetic, T for true (true courses are
    // not modelled: the hold is stored in the magnetic reference)
    const match = input.match(/^M?(\d{1,3})M?$/);
    const nbr = match ? Number(match[1]) : Number.NaN;
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(0), this.maxValue.toFixed(0), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class HoldDistFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '--.-';

  public maxDigits = 4;

  public readonly unit = 'NM';

  private readonly requiredFormat = 'XX.X';

  private minValue = 0;

  private maxValue = 99.9;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(99.9),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(1), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(1), this.maxValue.toFixed(1), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class HoldTimeFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public readonly placeholder = '-.-';

  public maxDigits = 3;

  public readonly unit = 'MN';

  private readonly requiredFormat = 'X.X';

  private minValue = 0;

  private maxValue = 9.9;

  constructor(
    minValue: Subscribable<number> = Subject.create(0),
    maxValue: Subscribable<number> = Subject.create(9.9),
  ) {
    super();
    this.subscriptions.push(minValue.sub((val) => (this.minValue = val), true));
    this.subscriptions.push(maxValue.sub((val) => (this.maxValue = val), true));
  }

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [value.toFixed(1), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(1), this.maxValue.toFixed(1), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }

  destroy(): void {
    super.destroy();
  }
}

export class FrequencyILSFormat implements DataEntryFormat<number> {
  public placeholder = '---.--';

  public maxDigits = 6;

  private readonly requiredFormat = 'XXX.XX';

  private minValue = 108.0;

  private maxValue = 111.95;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(2), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(2), this.maxValue.toFixed(2));
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

export class FrequencyVORDMEFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---.--';

  public maxDigits = 6;

  private readonly requiredFormat = 'XXX.XX';

  private minValue = 108.0;

  private maxValue = 117.95;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(2), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(2), this.maxValue.toFixed(2));
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

export class FrequencyADFFormat implements DataEntryFormat<number> {
  public placeholder = '----.-';

  public maxDigits = 6;

  private readonly requiredFormat = 'XXXX.X';

  private minValue = 190.0;

  private maxValue = 1750.0;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(1), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(1), this.maxValue.toFixed(1));
    } else {
      throw getFormattedFormatError(this.requiredFormat);
    }
  }
}

// Still need to find a way to store whether course is true or magnetic
/** Negative number indicates back course */
export class LsCourseFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '----';

  public maxDigits = 4;

  public readonly unit = '°';

  private minValue = -360;

  private maxValue = 360.0;

  private readonly displayMinValue = 0;

  private readonly requiredFormat = 'FXXX';

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }
    return [
      `${value < 0 ? 'B' : 'F'}${Math.abs(value).toFixed(0).padStart(3, '0')}`,
      null,
      this.unit,
    ] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    let numberPart = input;
    let sign = +1;
    if (input.length === 4) {
      if (input[0] === 'F' || input[0] === 'B') {
        sign = input[0] === 'B' ? -1 : +1;
        numberPart = input.substring(1, 4);
      } else {
        numberPart = input.substring(0, 3);
      }
    }

    // FIXME Delete next line and change required format as soon as back course is implemented
    if (input[0] === 'B') throw getFormattedFormatError(this.requiredFormat);

    const nbr = Number(numberPart);

    if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat);
    }

    if (nbr <= this.maxValue && nbr >= this.minValue) {
      return sign * nbr;
    } else {
      throw getFormattedEntryOutOfRangeError(this.displayMinValue.toString(), this.maxValue.toFixed(0), this.unit);
    }
  }
}

export class SquawkFormat implements DataEntryFormat<number> {
  public placeholder = '----';

  public maxDigits = 4;
  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value.toFixed(0).padStart(this.maxDigits, '0'), null, null] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && /^[0-7]{4}$/.test(input)) {
      return nbr;
    }

    throw new A380FmsError(FmsErrorType.FormatError);
  }
}

/**
 * FIX INFO radial
 */
export class RadialFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 4;

  public readonly unit = '°';

  private readonly requiredFormat = 'XXX';

  private readonly minValue = 0;

  private readonly maxValue = 360.0;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }

    return [value.toFixed(0).padStart(3, '0'), null, '°'] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }

    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toFixed(0), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }
}

/**
 * FIX INFO radius
 */
export class RadiusFormat implements DataEntryFormat<number> {
  public readonly placeholder = '----';

  public readonly maxDigits = 4;

  public readonly unit = 'NM';

  private readonly requiredFormat = 'XXXX';

  private readonly minValue = 1;

  private readonly maxValue = 9999;

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }

    return [value.toFixed(0), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (!Number.isNaN(nbr) && nbr <= this.maxValue && nbr >= this.minValue) {
      return nbr;
    }

    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString(), this.unit);
    } else {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
  }
}

export class RnpFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--.-';

  public readonly maxDigits = 4;

  private readonly minValue = 0.01;

  private readonly maxValue = 20.0;

  public readonly unit = 'NM';

  private readonly requiredFormat = 'X.XX';

  public format(value: number) {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null] as FieldFormatTuple;
    }
    return [value > 10.0 ? value.toFixed(1) : value.toFixed(2), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    const nbr = Number(input);
    if (Number.isNaN(nbr)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }
    if (nbr > this.maxValue || nbr < this.minValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(2), this.maxValue.toFixed(1), this.unit);
    }

    return nbr;
  }
}

export class FuelPenaltyPercentFormat implements DataEntryFormat<number> {
  public readonly placeholder = '+000.0'; // Always exists even if cleared

  readonly maxDigits = 6;

  private readonly minValue = 0;

  private readonly maxValue = 999.9;

  readonly unit = '%';

  private readonly requiredFormat = '+NNN.N';

  format(value: number): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit] as FieldFormatTuple;
    }

    return ['+' + value.toFixed(1).padStart(5, '0'), null, this.unit] as FieldFormatTuple;
  }

  public async parse(input: string) {
    if (input === '') {
      return null;
    }

    // Validate format (+)NNN.N.
    if (!/^[+]?\d{1,3}(?:\.\d)?$/.test(input)) {
      throw getFormattedFormatError(this.requiredFormat, this.unit);
    }

    const numberInput = Number(input);

    if (numberInput < this.minValue || numberInput > this.maxValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toFixed(1), this.maxValue.toFixed(1), this.unit);
    }

    return numberInput;
  }
}

/** An integer of up to two digits in a range (FCOM entry formats INCREMENT 1-20 and NUMBER 1-99, format NN) */
export class TwoDigitIntegerFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--';

  public readonly maxDigits = 2;

  constructor(
    private readonly minValue: number,
    private readonly maxValue: number,
  ) {}

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    return [value.toFixed(0), null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{1,2}$/)) {
      throw getFormattedFormatError('NN');
    }
    const value = Number(input);
    if (value < this.minValue || value > this.maxValue) {
      throw getFormattedEntryOutOfRangeError(this.minValue.toString(), this.maxValue.toString());
    }
    return value;
  }
}

/** A time of day or a duration as HHMM or HHMMSS, in seconds (FCOM TIME MARKER UTC and REMAINING TIME formats) */
export class TimeHhMmSsFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--:--:--';

  public readonly maxDigits = 8;

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    const total = Math.max(0, Math.floor(value));
    const hours = Math.floor(total / 3600) % 24;
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      null,
      null,
    ];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const digits = input.replace(/:/g, '');
    if (!digits.match(/^(\d{4}|\d{6})$/)) {
      throw getFormattedFormatError('HHMM OR HHMMSS');
    }
    const hours = Number(digits.substring(0, 2));
    const minutes = Number(digits.substring(2, 4));
    const seconds = digits.length === 6 ? Number(digits.substring(4, 6)) : 0;
    if (hours > 23 || minutes > 59 || seconds > 59) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange);
    }
    return hours * 3600 + minutes * 60 + seconds;
  }
}

/** A runway designator (FCOM RWY IDENT entry format of the takeoff data pages): NN, NNL, NNC or NNR */
export class RunwayDesignatorFormat implements DataEntryFormat<string> {
  public readonly placeholder = '---';

  public readonly maxDigits = 3;

  public format(value: string | null): FieldFormatTuple {
    return [value ?? this.placeholder, null, null];
  }

  public async parse(input: string): Promise<string | null> {
    if (input === '') {
      return null;
    }
    const match = input.match(/^(\d{1,2})([LCR]?)$/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 36) {
      throw getFormattedFormatError('NNX');
    }
    return `${match[1].padStart(2, '0')}${match[2]}`;
  }
}

/**
 * Origin of the LAT / LONG crossings (FCOM LL XING - TIME MKR page, LAT and LONG entry formats): displayed as whole
 * degrees with the hemisphere letter (45N, 010E).
 */
export class CrossingOriginFormat implements DataEntryFormat<number> {
  public readonly maxDigits: number;

  public readonly placeholder: string;

  private readonly requiredFormat: string;

  constructor(private readonly isLatitude: boolean) {
    this.maxDigits = isLatitude ? 8 : 9;
    this.placeholder = isLatitude ? '---' : '----';
    this.requiredFormat = isLatitude ? 'XDD OR DDX' : 'YDDD OR DDDY';
  }

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, null];
    }
    const degrees = Math.abs(Math.round(value))
      .toFixed(0)
      .padStart(this.isLatitude ? 2 : 3, '0');
    const hemisphere = this.isLatitude ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
    return [`${degrees}${hemisphere}`, null, null];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    return this.isLatitude
      ? parseDegreesMinutes(input, 'N', 'S', 90, this.requiredFormat)
      : parseDegreesMinutes(input, 'E', 'W', 180, this.requiredFormat);
  }
}

/** Intercept angle of a lateral offset (A380 FCOM DSC-22-FMS-20-100 "INTERCEPT ANGLE": NN, 10 to 50 degrees). */
export class InterceptAngleFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--';

  public readonly maxDigits = 2;

  public readonly unit = '°';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [value.toFixed(0), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{1,2}$/)) {
      throw getFormattedFormatError('NN', this.unit);
    }
    const value = Number(input);
    if (value < 10 || value > 50) {
      throw getFormattedEntryOutOfRangeError('10', '50', this.unit);
    }
    return value;
  }
}

/**
 * Lateral offset distance (A380 FCOM DSC-22-FMS-20-100 "OFFSET DIST": NN, ANN or NNA, A = L or R, 0 to 50 NM). The side
 * entered with the distance goes to `onSide`; the field then only shows the distance (DSC-22-FMS-20-30 OFFSET page).
 */
export class OffsetDistanceFormat implements DataEntryFormat<number> {
  public readonly placeholder = '--';

  public readonly maxDigits = 3;

  public readonly unit = 'NM';

  constructor(private readonly onSide: (side: 'L' | 'R') => void = () => {}) {}

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [value.toFixed(0), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const match = input.match(/^([LR]?)(\d{1,2})([LR]?)$/);
    if (!match || (match[1] !== '' && match[3] !== '')) {
      throw getFormattedFormatError('NN OR LNN OR NNR', this.unit);
    }
    const value = Number(match[2]);
    if (value > 50) {
      throw getFormattedEntryOutOfRangeError('0', '50', this.unit);
    }
    const side = match[1] || match[3];
    if (side === 'L' || side === 'R') {
      this.onSide(side);
    }
    return value;
  }
}

/**
 * Weather radar elevation of the SURV / CONTROLS page (A380 FCOM DSC-34-20-60-50 P 10 "ELEVN"): with the STD baro
 * reference FL NNN or NNN (FL 0 to FL 600), with the QNH reference NNNNN FT or NNNNN (0 to 60 000 ft, "FT" must be written
 * between 0 and 1 000 ft). The value is in feet.
 */
export class WxrElevationFormat extends SubscriptionCollector implements DataEntryFormat<number> {
  public placeholder = '-----';

  public maxDigits = 7;

  private isStd = false;

  public readonly reFormatTrigger = Subject.create(false);

  constructor(isStd: Subscribable<boolean>) {
    super();
    this.subscriptions.push(
      isStd.sub((v) => {
        this.isStd = v;
        this.placeholder = v ? '---' : '-----';
        this.reFormatTrigger.notify();
      }, true),
    );
  }

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return this.isStd ? [this.placeholder, 'FL', null] : [this.placeholder, null, 'FT'];
    }
    return this.isStd ? [(value / 100).toFixed(0).padStart(3, '0'), 'FL', null] : [value.toFixed(0), null, 'FT'];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (this.isStd) {
      const match = input.match(/^(?:FL)?(\d{1,3})$/);
      if (!match) {
        throw new A380FmsError(FmsErrorType.FormatError, 'FORMAT: FL XXX');
      }
      const fl = Number(match[1]);
      if (fl > 600) {
        throw new A380FmsError(FmsErrorType.EntryOutOfRange, 'RANGE: FL 0 TO FL 600');
      }
      return fl * 100;
    }
    const match = input.match(/^(\d{1,5})(FT)?$/);
    if (!match || (match[2] === undefined && Number(match[1]) < 1000)) {
      throw new A380FmsError(FmsErrorType.FormatError, 'FORMAT: XXXXX FT');
    }
    const feet = Number(match[1]);
    if (feet > 60000) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange, 'RANGE: 0 FT TO 60000 FT');
    }
    return feet;
  }
}

/** Weather radar gain of the SURV / CONTROLS page (A380 FCOM DSC-34-20-60-50 P 10 "GAIN": NNN, 0 to 100 %). */
export class WxrGainFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 3;

  public readonly unit = '%';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [value.toFixed(0), null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    if (!input.match(/^\d{1,3}$/)) {
      throw new A380FmsError(FmsErrorType.FormatError, 'FORMAT: XXX %');
    }
    const value = Number(input);
    if (value > 100) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange, 'RANGE: 0 % TO 100 %');
    }
    return value;
  }
}

/**
 * Weather radar tilt of the SURV / CONTROLS page (A380 FCOM DSC-34-20-60-50 P 10-11 "TILT": ±NN.N or ±NN.N°, "-" may be
 * entered as M, "+" displayed when there is no sign, -15.0 to +15.0°).
 */
export class WxrTiltFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---.-';

  public readonly maxDigits = 6;

  public readonly unit = '°';

  public format(value: number | null): FieldFormatTuple {
    if (value === null || value === undefined) {
      return [this.placeholder, null, this.unit];
    }
    return [`${value < 0 ? '-' : '+'}${Math.abs(value).toFixed(1)}`, null, this.unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const match = input.match(/^([+\-M]?)(\d{1,2}(?:\.\d)?)°?$/);
    if (!match) {
      throw new A380FmsError(FmsErrorType.FormatError, 'FORMAT: +/-XX.X °');
    }
    const value = (match[1] === '-' || match[1] === 'M' ? -1 : 1) * Number(match[2]);
    if (value < -15 || value > 15) {
      throw new A380FmsError(FmsErrorType.EntryOutOfRange, 'RANGE: -15.0 ° TO +15.0 °');
    }
    return value;
  }
}

/**
 * CRS IN / CRS OUT of the DIRECT TO page (A380 FCOM DSC-22-FMS-20-100 "COURSE IN/OUT": NNNB or BNNN, 0 to 360°, B = M
 * or nothing for a magnetic course, T for a true course). The reference goes to `onTrue`; the field shows °T for a true
 * course.
 */
export class DirectToCourseFormat implements DataEntryFormat<number> {
  public readonly placeholder = '---';

  public readonly maxDigits = 4;

  public readonly unit = '°';

  constructor(
    private readonly isTrue: Subscribable<boolean>,
    private readonly onTrue: (isTrue: boolean) => void = () => {},
  ) {}

  public format(value: number | null): FieldFormatTuple {
    const unit = this.isTrue.get() ? '°T' : this.unit;
    if (value === null || value === undefined) {
      return [this.placeholder, null, unit];
    }
    return [value.toFixed(0).padStart(3, '0'), null, unit];
  }

  public async parse(input: string): Promise<number | null> {
    if (input === '') {
      return null;
    }
    const match = input.match(/^([MT]?)(\d{1,3})([MT]?)$/);
    if (!match || (match[1] !== '' && match[3] !== '')) {
      throw getFormattedFormatError('NNNB', this.unit);
    }
    const value = Number(match[2]);
    if (value > 360) {
      throw getFormattedEntryOutOfRangeError('0', '360', this.unit);
    }
    this.onTrue(match[1] === 'T' || match[3] === 'T');
    return value;
  }
}
