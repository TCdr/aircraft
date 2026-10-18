// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Coordinates, placeBearingDistance } from 'msfs-geo';
import { FmNavigationMode } from '@fmgc/navigation/PositionUncertainty';

/*
 * The FM position: the MIX IRS position plus a bias that follows the GPIRS or the radio position.
 *
 * Both aircraft:
 * - At flight initialisation the FM position is the GPIRS position (MIX IRS/GPS).
 * - At takeoff it is updated to the runway threshold of the database, corrected by the takeoff shift of the PERF TO
 *   page. The A320 inhibits this update in GPS PRIMARY, the A380 in the IRS/GPS navigation mode.
 * - In flight it approaches the radio or GPS position, at a rate that depends on the altitude.
 * - The bias is the vector from the MIX IRS position to the radio or GPIRS position. It follows that position while one
 *   is available and is memorised when all are lost, the FM position then being the MIX IRS position plus the bias. A
 *   manual position update also updates the bias.
 *
 * Simulation notes:
 * - The ADIRS IR positions are the sim position (the Rust ADIRS has no IRS drift model). The MIX IRS position is
 *   therefore the sim position while at least one IR position is valid, and the bias is expressed relative to it.
 * - The GPIRS bias is measured as the GPIRS position minus the IR position of the same ADIRU: both words are written by
 *   the ADIRS in the same frame, so the GPS receiver error is measured without the frame lag of the sim position.
 * - The radio position is the sim position (the sim DME distances and VOR bearings have no error): in an IRS/DME/DME or
 *   IRS/VOR/DME mode the measured bias is zero.
 * - Not modelled: the LOC update during an ILS approach, the reasonableness test of the radio position, the MIX IRS
 *   weighting of a drifting IRS (no IRS drifts).
 */

/** A difference between two positions, in degrees of latitude and longitude */
export interface PositionOffset {
  lat: number;
  long: number;
}

/** The bias of a FM position that has not been updated: the FM position is the MIX IRS position */
const NO_OFFSET: Readonly<PositionOffset> = Object.freeze({ lat: 0, long: 0 });

/**
 * The difference between two longitudes, wrapped into [-180, 180)
 * @param to the longitude to reach, in degrees
 * @param from the longitude to start from, in degrees
 * @returns to - from, in degrees
 */
export function longitudeDifference(to: number, from: number): number {
  let difference = (to - from) % 360;
  if (difference >= 180) {
    difference -= 360;
  } else if (difference < -180) {
    difference += 360;
  }
  return difference;
}

/**
 * The offset from one position to another
 * @param from the start position
 * @param to the end position
 * @returns to - from, in degrees
 */
export function positionOffset(from: Coordinates, to: Coordinates): PositionOffset {
  return { lat: to.lat - from.lat, long: longitudeDifference(to.long, from.long) };
}

/**
 * Applies an offset to a position
 * @param position the position
 * @param offset the offset, in degrees
 * @param out the object to write the result into
 * @returns out, the position plus the offset (longitude wrapped into [-180, 180))
 */
export function applyOffset(position: Coordinates, offset: Readonly<PositionOffset>, out: Coordinates): Coordinates {
  out.lat = position.lat + offset.lat;
  out.long = longitudeDifference(position.long + offset.long, 0);
  return out;
}

/**
 * The time constant with which the FM position approaches the GPIRS or the radio position, in seconds. The aircraft
 * rate only depends on the altitude, without a value. Design choice: 10 s at sea level, growing linearly to 60 s at
 * FL400 and above, so the FM position settles within a minute of a sensor change.
 * @param altitude the aircraft altitude, in feet
 * @returns the time constant, in seconds
 */
export function biasTimeConstant(altitude: number): number {
  const ratio = Math.min(Math.max(altitude / 40_000, 0), 1);
  return 10 + 50 * ratio;
}

/** The bias of one FMS: the vector from its MIX IRS position to its FM position */
export class FmPositionBias {
  private bias: PositionOffset | null = null;

  /** Whether the FM position has been initialised since the last IRS alignment */
  public get initialised(): boolean {
    return this.bias !== null;
  }

  /** The bias, in degrees: zero before the initialisation */
  public get offset(): Readonly<PositionOffset> {
    return this.bias ?? NO_OFFSET;
  }

  /**
   * Updates the bias.
   * @param deltaTime the time since the last update, in seconds
   * @param inertialValid whether a MIX IRS position is available (at least one IR position valid)
   * @param measured the vector from the MIX IRS position to the GPIRS or radio position in use, null without one
   * @param approach whether the bias approaches the measured one now (false: it stays memorised)
   * @param altitude the aircraft altitude, in feet
   */
  public update(
    deltaTime: number,
    inertialValid: boolean,
    measured: Readonly<PositionOffset> | null,
    approach: boolean,
    altitude: number,
  ): void {
    if (!inertialValid) {
      // No FM position without an inertial position: it is initialised again afterwards
      this.bias = null;
      return;
    }
    if (this.bias === null) {
      // Flight initialisation: the GPIRS position when there is one, else the MIX IRS position
      this.bias = measured !== null ? { lat: measured.lat, long: measured.long } : { lat: 0, long: 0 };
      return;
    }
    if (measured === null || !approach) {
      // Lost radio/GPIRS position: the bias is memorised
      return;
    }
    const gain = 1 - Math.exp(-Math.max(deltaTime, 0) / biasTimeConstant(altitude));
    this.bias.lat += (measured.lat - this.bias.lat) * gain;
    this.bias.long += longitudeDifference(measured.long, this.bias.long) * gain;
  }

  /**
   * Sets the bias after a position update (takeoff update or manual update). No effect before the initialisation.
   * @param bias the vector from the MIX IRS position to the updated FM position, in degrees
   */
  public set(bias: Readonly<PositionOffset>): void {
    if (this.bias !== null) {
      this.bias.lat = bias.lat;
      this.bias.long = bias.long;
    }
  }

  /** Forgets the bias, the FM position is initialised again */
  public reset(): void {
    this.bias = null;
  }
}

const METRES_PER_NM = 1852;

/**
 * The FM position after the update at takeoff: the runway threshold of the database, corrected by the takeoff shift of
 * the PERF TO page. The takeoff shift is the distance from the beginning of the runway to the takeoff position, so it
 * is applied along the runway from its beginning.
 * @param runwayStart the beginning of the take-off runway
 * @param runwayBearing the true bearing of the runway, in degrees
 * @param takeoffShift the takeoff shift, in metres, null when none is entered
 * @returns the updated FM position
 */
export function takeoffUpdatePosition(
  runwayStart: Coordinates,
  runwayBearing: number,
  takeoffShift: number | null,
): Coordinates {
  if (takeoffShift === null || takeoffShift <= 0) {
    return { lat: runwayStart.lat, long: runwayStart.long };
  }
  return placeBearingDistance(runwayStart, runwayBearing, takeoffShift / METRES_PER_NM);
}

/** The FM/GPS POS DISAGREE thresholds at a latitude, in minutes of arc; null: the longitude is not monitored */
export interface FmGpsDisagreeThreshold {
  latitude: number;
  longitude: number | null;
}

/**
 * A320 FM/GPS position disagreement: a longitude threshold of 0.5' below 55 degrees, 0.9' from 55 to 70 degrees, no
 * longitude monitoring above 70 degrees; a latitude threshold of 0.5'.
 * @param latitude the latitude, in degrees
 * @returns the thresholds
 */
export function a320FmGpsDisagreeThreshold(latitude: number): FmGpsDisagreeThreshold {
  const absLatitude = Math.abs(latitude);
  return { latitude: 0.5, longitude: absLatitude < 55 ? 0.5 : absLatitude < 70 ? 0.9 : null };
}

/**
 * A380 NAV FM / GPS POS DISAGREE: a longitude threshold of 0.5' below 45 degrees, 0.7' from 45 to 60 degrees, 1' from
 * 60 to 70 degrees; a latitude threshold of 0.5'. Design choice: the A380 has no longitude threshold above 70 degrees,
 * so as on the A320 the longitude is not monitored there.
 * @param latitude the latitude, in degrees
 * @returns the thresholds
 */
export function a380FmGpsDisagreeThreshold(latitude: number): FmGpsDisagreeThreshold {
  const absLatitude = Math.abs(latitude);
  let longitude: number | null;
  if (absLatitude < 45) {
    longitude = 0.5;
  } else if (absLatitude < 60) {
    longitude = 0.7;
  } else if (absLatitude < 70) {
    longitude = 1;
  } else {
    longitude = null;
  }
  return { latitude: 0.5, longitude };
}

/**
 * Whether an FM position and a GPS position disagree: either FM position is farther than the thresholds from either GPS
 * position.
 * @param fmPositions the FM positions (FMS 1 and 2)
 * @param gpsPositions the GPS receiver positions (GPS 1 and 2), null when not valid
 * @param threshold the thresholds as a function of the latitude
 * @returns true when one FM position and one GPS position differ by more than a threshold
 */
export function isFmGpsPositionDisagree(
  fmPositions: readonly Coordinates[],
  gpsPositions: readonly (Coordinates | null)[],
  threshold: (latitude: number) => FmGpsDisagreeThreshold,
): boolean {
  for (const fm of fmPositions) {
    const { latitude, longitude } = threshold(fm.lat);
    for (const gps of gpsPositions) {
      if (gps === null) {
        continue;
      }
      if (Math.abs(fm.lat - gps.lat) * 60 > latitude) {
        return true;
      }
      if (longitude !== null && Math.abs(longitudeDifference(fm.long, gps.long)) * 60 > longitude) {
        return true;
      }
    }
  }
  return false;
}

/** The order in which FMS 1 and FMS 2 select a GPIRS position: onside, GPIRS 3, offside */
const GPIRS_SELECTION_ORDERS: Readonly<Record<1 | 2, readonly [number, number, number]>> = {
  1: [1, 3, 2],
  2: [2, 3, 1],
};

/**
 * The GPIRS position an FMS uses.
 * @param side the FMS, 1 or 2
 * @param gpirsValid whether the GPIRS position of IR 1, 2 and 3 is valid
 * @returns the IR whose GPIRS position is used, null when none is valid
 */
export function selectGpirs(side: 1 | 2, gpirsValid: readonly boolean[]): number | null {
  return GPIRS_SELECTION_ORDERS[side].find((ir) => gpirsValid[ir - 1]) ?? null;
}

/**
 * The number of IRS used for the IRS position, as the navigation mode displays it (3 or 1): the MIX IRS position needs
 * the three IRS positions, else the FMS uses one IRS position only.
 * @param validIrs the number of valid IR positions
 * @returns 3, 1, or 0 without an IR position
 */
export function irsUsedCount(validIrs: number): 0 | 1 | 3 {
  if (validIrs >= 3) {
    return 3;
  }
  return validIrs > 0 ? 1 : 0;
}

/** The sensors of each navigation mode, as the position pages display them */
const NAVIGATION_MODE_SENSORS: Record<FmNavigationMode, string> = {
  [FmNavigationMode.IrsGps]: 'IRS/GPS',
  [FmNavigationMode.IrsDmeDme]: 'IRS/DME/DME',
  [FmNavigationMode.IrsVorDme]: 'IRS/VOR/DME',
  [FmNavigationMode.IrsOnly]: 'IRS',
};

/**
 * The navigation mode text of an FMS position on the A380 POSITION / MONITOR and A320 POSITION MONITOR pages:
 * "N IRS/GPS", "N IRS/DME/DME", "N IRS/VOR/DME" or "N IRS", N = 3 or 1 IRS. The LOC modes (IRS/DME/LOC...) are not
 * modelled.
 * @param irsCount the number of IRS used (irsUsedCount)
 * @param mode the FM navigation mode
 * @returns the text, empty without an IRS position
 */
export function navigationModeText(irsCount: 0 | 1 | 3, mode: FmNavigationMode): string {
  return irsCount === 0 ? '' : `${irsCount} ${NAVIGATION_MODE_SENSORS[mode]}`;
}

/** What differs between the A320 and the A380 FMS position functions */
export interface FmPositionConfig {
  fmGpsDisagreeThreshold: (latitude: number) => FmGpsDisagreeThreshold;
  /** Whether the FM/GPS POS DISAGREE monitoring needs GPS PRIMARY (A320) */
  fmGpsDisagreeNeedsGpsPrimary: boolean;
  /**
   * What inhibits the FM position update at takeoff: GPS PRIMARY (A320) or the IRS/GPS navigation mode (A380, whose
   * position updates only happen outside IRS/GPS)
   */
  takeoffUpdateInhibitedBy: 'gpsPrimary' | 'irsGpsMode';
}

export const A320_FM_POSITION_CONFIG: Readonly<FmPositionConfig> = {
  fmGpsDisagreeThreshold: a320FmGpsDisagreeThreshold,
  fmGpsDisagreeNeedsGpsPrimary: true,
  takeoffUpdateInhibitedBy: 'gpsPrimary',
};

export const A380_FM_POSITION_CONFIG: Readonly<FmPositionConfig> = {
  fmGpsDisagreeThreshold: a380FmGpsDisagreeThreshold,
  // A380: the FM/GPS disagree check does not need GPS PRIMARY, only valid GPS positions
  fmGpsDisagreeNeedsGpsPrimary: false,
  takeoffUpdateInhibitedBy: 'irsGpsMode',
};

/** What the FM position function reads at each update */
export interface FmPositionInputs {
  /** The time since the last update, in seconds */
  deltaTime: number;
  /** The sim position: the IR positions have no drift, so it is also the MIX IRS position */
  simPosition: Coordinates;
  /** The IR positions of IR 1, 2 and 3, null when not valid */
  irPositions: readonly (Coordinates | null)[];
  /** The GPIRS positions of IR 1, 2 and 3, null when not valid */
  gpirsPositions: readonly (Coordinates | null)[];
  /** The GPS receiver positions of GPS 1 and 2, null when not valid */
  gpsPositions: readonly (Coordinates | null)[];
  gpsDeselected: boolean;
  navigationMode: FmNavigationMode;
  gpsPrimary: boolean;
  onGround: boolean;
  /** The aircraft altitude, in feet */
  altitude: number;
}

/**
 * The FM positions of FMS 1 and 2: the MIX IRS position plus the bias, which approaches the GPIRS position (on ground
 * and in flight) or the radio position (in flight only), and is memorised without them; the takeoff and manual position
 * updates; the FM/GPS position disagree monitoring.
 */
export class FmPositionComputer {
  private readonly biases: [FmPositionBias, FmPositionBias] = [new FmPositionBias(), new FmPositionBias()];

  /** The FM positions of FMS 1 and FMS 2 */
  public readonly fmPositions: [Coordinates, Coordinates] = [
    { lat: 0, long: 0 },
    { lat: 0, long: 0 },
  ];

  private valid = false;

  private disagree = false;

  private lastInputs: FmPositionInputs | null = null;

  /** @param config what differs between the A320 and the A380 */
  constructor(private readonly config: Readonly<FmPositionConfig> = A320_FM_POSITION_CONFIG) {}

  /** Whether there is an FM position (at least one IR position valid) */
  public get isValid(): boolean {
    return this.valid;
  }

  /** The NAV FM/GPS POS DISAGREE condition */
  public get isFmGpsDisagree(): boolean {
    return this.disagree;
  }

  /**
   * The IR whose GPIRS position an FMS uses.
   * @param side the FMS, 1 or 2
   * @param gpirsPositions the GPIRS positions of IR 1, 2 and 3
   * @param gpsDeselected whether the flight crew has deselected the GPS
   * @returns the IR number, null when none is valid or the GPS is deselected
   */
  public static gpirsSource(
    side: 1 | 2,
    gpirsPositions: readonly (Coordinates | null)[],
    gpsDeselected: boolean,
  ): number | null {
    return gpsDeselected
      ? null
      : selectGpirs(
          side,
          gpirsPositions.map((p) => p !== null),
        );
  }

  /**
   * The vector from the MIX IRS position to the position an FMS updates to: the GPIRS position it selects in the IRS/GPS
   * mode (measured against the IR position of the same ADIRU), the radio position (the sim position) in the IRS/DME/DME
   * and IRS/VOR/DME modes, none in IRS only.
   * @param side the FMS, 1 or 2
   * @param inputs the inputs
   * @returns the measured bias, null without a GPIRS or radio position
   */
  private static measuredBias(side: 1 | 2, inputs: FmPositionInputs): PositionOffset | null {
    switch (inputs.navigationMode) {
      case FmNavigationMode.IrsGps: {
        const source = FmPositionComputer.gpirsSource(side, inputs.gpirsPositions, inputs.gpsDeselected);
        const gpirs = source !== null ? inputs.gpirsPositions[source - 1] : null;
        const ir = source !== null ? inputs.irPositions[source - 1] : null;
        return gpirs && ir ? positionOffset(ir, gpirs) : null;
      }
      case FmNavigationMode.IrsDmeDme:
      case FmNavigationMode.IrsVorDme:
        return { lat: 0, long: 0 };
      default:
        return null;
    }
  }

  /**
   * Updates the FM positions and the FM/GPS POS DISAGREE condition.
   * @param inputs the inputs
   */
  public update(inputs: FmPositionInputs): void {
    this.lastInputs = inputs;
    const inertialValid = inputs.irPositions.some((p) => p !== null);
    const approach = inputs.navigationMode === FmNavigationMode.IrsGps || !inputs.onGround;
    for (const side of [1, 2] as const) {
      const bias = this.biases[side - 1];
      bias.update(
        inputs.deltaTime,
        inertialValid,
        FmPositionComputer.measuredBias(side, inputs),
        approach,
        inputs.altitude,
      );
      applyOffset(inputs.simPosition, bias.offset, this.fmPositions[side - 1]);
    }
    this.valid = inertialValid;
    this.disagree =
      inertialValid &&
      (!this.config.fmGpsDisagreeNeedsGpsPrimary || inputs.gpsPrimary) &&
      isFmGpsPositionDisagree(this.fmPositions, inputs.gpsPositions, this.config.fmGpsDisagreeThreshold);
  }

  /**
   * Moves both FM positions to a position (the bias follows).
   * @param position the new FM position
   */
  private setPosition(position: Coordinates): void {
    if (this.lastInputs === null) {
      return;
    }
    const bias = positionOffset(this.lastInputs.simPosition, position);
    for (const [i, fmBias] of this.biases.entries()) {
      fmBias.set(bias);
      applyOffset(this.lastInputs.simPosition, fmBias.offset, this.fmPositions[i]);
    }
  }

  /**
   * The FM position update at takeoff, to the beginning of the take-off runway plus the takeoff shift, inhibited when
   * GPS PRIMARY is active (A320) or in the IRS/GPS navigation mode (A380).
   * @param runwayStart the beginning of the take-off runway
   * @param runwayBearing the true bearing of the runway, in degrees
   * @param takeoffShift the takeoff shift, in metres, null when none is entered
   * @returns the updated position, null when the update is inhibited or there is no FM position
   */
  public takeoffUpdate(
    runwayStart: Coordinates,
    runwayBearing: number,
    takeoffShift: number | null,
  ): Coordinates | null {
    const inputs = this.lastInputs;
    if (inputs === null || !this.valid) {
      return null;
    }
    const inhibited =
      this.config.takeoffUpdateInhibitedBy === 'gpsPrimary'
        ? inputs.gpsPrimary
        : inputs.navigationMode === FmNavigationMode.IrsGps;
    if (inhibited) {
      return null;
    }
    const position = takeoffUpdatePosition(runwayStart, runwayBearing, takeoffShift);
    this.setPosition(position);
    return position;
  }

  /**
   * The manual FM position update (A320 PROG page POSITION UPDATE AT, A380 POSITION/MONITOR page POSITION UPDATE). Both
   * aircraft refuse it while the position comes from the GPIRS (IRS/GPS navigation mode).
   * @param position the position the aircraft overflies
   * @returns false when the update is not allowed (IRS/GPS mode, or no FM position)
   */
  public manualUpdate(position: Coordinates): boolean {
    if (this.lastInputs === null || !this.valid || this.lastInputs.navigationMode === FmNavigationMode.IrsGps) {
      return false;
    }
    this.setPosition(position);
    return true;
  }
}
