// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AltitudeConstraint, AltitudeDescriptor, WaypointConstraintType } from '@flybywiresim/fbw-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { Coordinates, distanceTo } from 'msfs-geo';

/*
 * The trigger conditions of FMS messages of the A320 MCDU and of the A380 MFD, as pure functions shared by both
 * aircraft.
 */

/** A send or recall of a type II message, by its text */
export interface MessageTextUpdate {
  action: 'send' | 'recall';
  text: string;
}

/**
 * Sends a type II message once when its condition starts and recalls it when the condition ends. A message whose text
 * carries a value (e.g. AREA RNP IS 2.00) is recalled with its old text, then sent with the new one at the next update.
 */
export class MessageTextLatch {
  private current: string | null = null;

  /**
   * @param wanted the text of the message wanted now, null when its condition is not met
   * @returns the send or recall to do, or null
   */
  update(wanted: string | null): MessageTextUpdate | null {
    if (wanted === this.current) {
      return null;
    }
    if (this.current !== null) {
      const text = this.current;
      this.current = null;
      return { action: 'recall', text };
    }
    this.current = wanted;
    return { action: 'send', text: wanted as string };
  }
}

/** AREA RNP IS (the flight area default RNP) or PROCEDURE RNP IS (the RNP of the active leg) */
export interface RnpMessage {
  kind: 'area' | 'procedure';
  rnp: number;
}

/**
 * AREA RNP IS XX.XX: the RNP manually entered is larger than the default RNP of the flight area, and the database has
 * no RNP for the active leg. PROCEDURE RNP IS / PROC RNP IS XX.XX: the RNP manually entered is larger than the RNP of
 * the database for the active leg.
 * @param pilotRnp the RNP entered by the flight crew, null without entry
 * @param legRnp the RNP of the active leg in the database, undefined or null without one
 * @param areaRnp the default RNP of the current flight area
 * @returns the message, or null
 */
export function rnpMessage(
  pilotRnp: number | null,
  legRnp: number | null | undefined,
  areaRnp: number,
): RnpMessage | null {
  if (pilotRnp === null) {
    return null;
  }
  if (legRnp !== null && legRnp !== undefined) {
    return pilotRnp > legRnp ? { kind: 'procedure', rnp: legRnp } : null;
  }
  return pilotRnp > areaRnp ? { kind: 'area', rnp: areaRnp } : null;
}

/** The RNP value of the RNP messages: two decimals (XX.XX) */
export function formatRnpValue(rnp: number): string {
  return rnp.toFixed(2);
}

/**
 * A UTC calendar date as the navigation database ident writes its effectivity (YYYY-MM-DD)
 * @param year the year
 * @param month the month, 1 to 12
 * @param day the day of the month
 */
export function utcCalendarDate(year: number, month: number, day: number): string {
  const twoDigits = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${year}-${twoDigits(month)}-${twoDigits(day)}`;
}

/**
 * Whether the date is in the effectivity of the active navigation database: else CHECK DATA BASE CYCLE (A320) /
 * CHECK DATABASE CYCLE (A380). An unknown effectivity raises nothing.
 * @param today the UTC date (utcCalendarDate)
 * @param ident the effectivity of the active database, null when unknown
 */
export function isNavDatabaseCycleCurrent(
  today: string,
  ident: { effectiveFrom: string; effectiveTo: string } | null,
): boolean {
  if (ident === null || ident.effectiveFrom === '' || ident.effectiveTo === '') {
    return true;
  }
  return today >= ident.effectiveFrom && today <= ident.effectiveTo;
}

/** CHECK IRS/AIRPORT POS: an IRS alignment position this far or farther from the airport, NM */
const IRS_AIRPORT_POSITION_DISAGREE_NM = 5;

/**
 * CHECK IRS/AIRPORT POS (A320) / CHECK IRS / ARPT POSITION (A380): the distance between an
 * IRS alignment position and the database airport reference point is at least 5 NM.
 * @param irsPositions the IRS positions, null for an IRS without a valid position
 * @param airport the airport reference point, null without an airport
 */
export function isIrsAirportPositionDisagree(
  irsPositions: readonly (Coordinates | null)[],
  airport: Coordinates | null,
): boolean {
  if (airport === null) {
    return false;
  }
  return irsPositions.some(
    (position) => position !== null && distanceTo(position, airport) >= IRS_AIRPORT_POSITION_DISAGREE_NM,
  );
}

/** IRS ONLY NAVIGATION: the time in IRS only navigation after which the message is shown */
export const IRS_ONLY_NAVIGATION_DELAY_MS = 10 * 60_000;

/**
 * IRS ONLY NAVIGATION (A320): the aircraft is neither in an approach nor in a terminal area, and it has
 * been in IRS only navigation for more than 10 min, or it is in IRS only navigation at the start of the descent phase.
 * Design choice: in flight only (climb, cruise, descent phases).
 */
export class IrsOnlyNavigationLogic {
  private irsOnlyMs = 0;

  /**
   * @param deltaMs the time since the last update, ms
   * @param irsOnly the FM navigation is in IRS only mode
   * @param enroute the aircraft is en route (not in a terminal area nor an approach)
   * @param phase the FMGC flight phase
   * @returns whether the message applies
   */
  update(deltaMs: number, irsOnly: boolean, enroute: boolean, phase: FmgcFlightPhase): boolean {
    this.irsOnlyMs = irsOnly ? this.irsOnlyMs + deltaMs : 0;
    const inFlight =
      phase === FmgcFlightPhase.Climb || phase === FmgcFlightPhase.Cruise || phase === FmgcFlightPhase.Descent;
    if (!irsOnly || !enroute || !inFlight) {
      return false;
    }
    return this.irsOnlyMs > IRS_ONLY_NAVIGATION_DELAY_MS || phase === FmgcFlightPhase.Descent;
  }
}

/**
 * TIME TO EXIT: in the holding, the extra fuel is zero (or less)
 * @param inHolding the active leg is a holding
 * @param extraFuel the extra fuel, null without predictions
 */
export function isTimeToExitHolding(inHolding: boolean, extraFuel: number | null): boolean {
  return inHolding && extraFuel !== null && extraFuel <= 0;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Whether the clock has passed a time of day since the previous check (T.O TIME REACHED, A380: the aircraft clock
 * reaches the ETT), across midnight
 * @param previousClock the clock at the previous check, s of the UTC day, null at the first check
 * @param clock the clock now, s of the UTC day
 * @param time the time to reach, s of the UTC day
 */
export function hasClockReachedTime(previousClock: number | null, clock: number, time: number): boolean {
  if (previousClock === null) {
    return false;
  }
  const elapsed = (clock - previousClock + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const untilTime = (time - previousClock + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return untilTime > 0 && untilTime <= elapsed;
}

/**
 * EXPECT TURN AREA EXCEEDANCE (A380): the active or the next leg is a procedure turn that exceeds the
 * excursion distance of the navigation database
 * @param legs the active and next legs of the guidance geometry
 */
export function isProcedureTurnExceedanceAhead(
  legs: readonly ({ turnAreaExceeded?: boolean } | null | undefined)[],
): boolean {
  return legs.some((leg) => leg !== null && leg !== undefined && leg.turnAreaExceeded === true);
}

/**
 * ENTER DEST DATA: a destination QNH, temperature or wind is missing. CHECK DEST DATA: the destination data were
 * received by uplink (the wind not entered by the flight crew).
 * @param qnh the approach QNH, null when missing
 * @param temperature the approach temperature, null when missing
 * @param windDirection the approach wind direction, null when missing
 * @param windSpeed the approach wind speed, null when missing
 * @param windPilotEntered the flight crew entered the approach wind
 */
export function destinationDataMessages(
  qnh: number | null,
  temperature: number | null,
  windDirection: number | null,
  windSpeed: number | null,
  windPilotEntered: boolean,
): { enterDestData: boolean; checkDestData: boolean } {
  const missing = [qnh, temperature, windDirection, windSpeed].some((v) => v === null || !Number.isFinite(v));
  return { enterDestData: missing, checkDestData: !missing && !windPilotEntered };
}

/** What the FMS does with an altitude constraint when the CRZ FL changes */
export type CruiseLevelConstraintAction =
  | { kind: 'delete' }
  /** an altitude window above the CRZ FL: its upper limit is deleted, its lower limit kept (at or above) */
  | { kind: 'keepLower'; lowerAltitude: number };

/**
 * The automatic deletion of the altitude constraints at or above the CRZ FL.
 *
 * A320: the FMS deletes the AT, AT OR ABOVE and AT OR BELOW constraints at or above the CRZ FL, and the windows whose
 * lower limit is at or above it. A window across the CRZ FL loses only its upper limit and keeps its lower one. Message
 * CSTR DEL ABOVE CRZ FL.
 * A380: a change of the CRZ FL or of a step altitude deletes the climb and descent constraints at or above the new CRZ
 * FL. Message CONSTRAINTS ABOVE CRZ FL: DELETED. Design choice: the A380 rule does not detail the windows, the A320
 * rule is used for them.
 * @param constraint the altitude constraint of the leg
 * @param cruiseAltitude the CRZ FL as an altitude, ft
 * @returns the action, or null when the constraint stays
 */
export function cruiseLevelConstraintAction(
  constraint: AltitudeConstraint | undefined,
  cruiseAltitude: number,
): CruiseLevelConstraintAction | null {
  if (!constraint || constraint.altitudeDescriptor === undefined) {
    return null;
  }
  const altitude1 = constraint.altitude1 ?? null;
  const altitude2 = constraint.altitude2 ?? null;
  switch (constraint.altitudeDescriptor) {
    // no constraint, or a glide slope constraint (not considered by the FMS)
    case AltitudeDescriptor.None:
    case AltitudeDescriptor.AtAlt1GsMslAlt2:
    case AltitudeDescriptor.AtOrAboveAlt1GsMslAlt2:
      return null;
    case AltitudeDescriptor.BetweenAlt1Alt2:
      // altitude1 is the upper limit, altitude2 the lower one
      if (altitude2 !== null && altitude2 >= cruiseAltitude) {
        return { kind: 'delete' };
      }
      if (altitude1 !== null && altitude1 >= cruiseAltitude && altitude2 !== null) {
        return { kind: 'keepLower', lowerAltitude: altitude2 };
      }
      return null;
    case AltitudeDescriptor.AtOrAboveAlt2:
      return altitude2 !== null && altitude2 >= cruiseAltitude ? { kind: 'delete' } : null;
    default:
      return altitude1 !== null && altitude1 >= cruiseAltitude ? { kind: 'delete' } : null;
  }
}

/** A leg of the flight plan, as far as the CRZ FL constraint deletion needs it */
export interface ConstraintLegLike {
  isDiscontinuity: boolean;
  altitudeConstraint?: AltitudeConstraint;
  constraintType?: WaypointConstraintType;
}

/** A constraint to delete (or to cut to its lower limit) after a CRZ FL change */
export interface CruiseLevelConstraintChange {
  index: number;
  isDescent: boolean;
  action: CruiseLevelConstraintAction;
}

/**
 * The altitude constraints of a flight plan to delete after a CRZ FL change (cruiseLevelConstraintAction), on the legs
 * not flown yet (from the active leg) up to the missed approach (excluded).
 * @param legs the legs of the flight plan
 * @param fromIndex the first leg to check (the active leg)
 * @param toIndex the first leg not to check (the first missed approach leg)
 * @param cruiseAltitude the CRZ FL as an altitude, ft
 */
export function constraintsAboveCruiseLevel(
  legs: readonly ConstraintLegLike[],
  fromIndex: number,
  toIndex: number,
  cruiseAltitude: number,
): CruiseLevelConstraintChange[] {
  const changes: CruiseLevelConstraintChange[] = [];
  for (let i = Math.max(0, fromIndex); i < Math.min(toIndex, legs.length); i++) {
    const leg = legs[i];
    if (leg.isDiscontinuity) {
      continue;
    }
    const action = cruiseLevelConstraintAction(leg.altitudeConstraint, cruiseAltitude);
    if (action !== null) {
      changes.push({ index: i, isDescent: leg.constraintType === WaypointConstraintType.DES, action });
    }
  }
  return changes;
}

/**
 * CHECK FLT NBR: the uplinked flight number differs from the flight number of the request. The INIT REQUEST is sent
 * with the flight number of the INIT A page (none: nothing to compare).
 * @param requested the flight number when the request was sent, null if none
 * @param uplinked the flight number of the uplinked flight plan
 */
export function isUplinkedFlightNumberDifferent(
  requested: string | null | undefined,
  uplinked: string | null | undefined,
): boolean {
  const normalise = (n: string | null | undefined) => (n ?? '').trim().toUpperCase();
  return normalise(requested) !== '' && normalise(uplinked) !== '' && normalise(requested) !== normalise(uplinked);
}

/**
 * The A380 FLT NBR entry format: at most 10 letters and digits. A received flight number in another format raises
 * RECEIVED FLT NUMBER NOT VALID.
 * @param flightNumber the received flight number
 */
export function isValidA380FlightNumber(flightNumber: string | null | undefined): boolean {
  return flightNumber !== null && flightNumber !== undefined && /^[A-Z0-9]{1,10}$/.test(flightNumber.toUpperCase());
}

/** CHECK EO SPD SETTING: the selected speed must stay within green dot plus or minus this margin, kt */
const ENGINE_OUT_SPEED_MARGIN = 10;

/**
 * CHECK EO SPD SETTING (A380): in climb or cruise, with the vertical mode neither ALT* nor ALT, the engine-out mode is
 * active and the selected speed target is more than 10 kt away from green dot.
 * @param engineOut the FMS engine-out mode is active
 * @param phase the flight phase
 * @param verticalModeIsAlt the vertical mode is ALT or ALT* (ALT CPT)
 * @param selectedSpeed the selected speed target (CAS, kt), null in managed speed
 * @param greenDot the green dot speed, kt, null if unknown
 */
export function isEngineOutSpeedSettingWrong(
  engineOut: boolean,
  phase: FmgcFlightPhase,
  verticalModeIsAlt: boolean,
  selectedSpeed: number | null,
  greenDot: number | null,
): boolean {
  if (!engineOut || verticalModeIsAlt || selectedSpeed === null || greenDot === null) {
    return false;
  }
  if (phase !== FmgcFlightPhase.Climb && phase !== FmgcFlightPhase.Cruise) {
    return false;
  }
  return Math.abs(selectedSpeed - greenDot) > ENGINE_OUT_SPEED_MARGIN;
}

/**
 * The selected speed target as a CAS, for the green dot comparison of CHECK EO SPD SETTING: a selected Mach is turned
 * into the CAS it gives at the present altitude and temperature (the ratio of the present CAS and Mach).
 * @param selectedValue the selected speed (kt) or Mach
 * @param isMach the selected target is a Mach
 * @param currentCas the present CAS, kt
 * @param currentMach the present Mach
 * @returns the CAS, kt, or null when it cannot be computed
 */
export function selectedSpeedAsCas(
  selectedValue: number,
  isMach: boolean,
  currentCas: number,
  currentMach: number,
): number | null {
  if (!Number.isFinite(selectedValue) || selectedValue <= 0) {
    return null;
  }
  if (!isMach) {
    return selectedValue;
  }
  return currentMach > 0.1 && Number.isFinite(currentCas) ? (selectedValue * currentCas) / currentMach : null;
}

const NM_PER_DEGREE = 60;

/** An aircraft closer to the leg than this is on the leg, NM */
const ON_LEG_DISTANCE = 0.1;

/**
 * Whether the aircraft track intercepts a straight leg before its end (the TO waypoint), for NO NAV INTERCEPTION
 * (A380): the selected HDG/TRACK does not intercept the flight plan before the TO waypoint, and the ND shows no
 * interception path.
 * Design choice: a flat earth around the aircraft (a leg of a few hundred NM at most), the track as a ray from the
 * aircraft, and the leg as the segment from its start to the TO waypoint. An aircraft on the leg intercepts it.
 * @param aircraft the aircraft position
 * @param trueTrack the aircraft true track, degrees
 * @param legStart the start of the leg (the FROM waypoint)
 * @param legEnd the end of the leg (the TO waypoint)
 */
export function doesTrackInterceptLeg(
  aircraft: Coordinates,
  trueTrack: number,
  legStart: Coordinates,
  legEnd: Coordinates,
): boolean {
  const cosLat = Math.cos((aircraft.lat * Math.PI) / 180);
  const toLocal = (p: Coordinates) => {
    let dLong = p.long - aircraft.long;
    if (dLong > 180) {
      dLong -= 360;
    } else if (dLong < -180) {
      dLong += 360;
    }
    return { x: dLong * cosLat * NM_PER_DEGREE, y: (p.lat - aircraft.lat) * NM_PER_DEGREE };
  };
  const a = toLocal(legStart);
  const b = toLocal(legEnd);
  const segment = { x: b.x - a.x, y: b.y - a.y };
  const segmentLengthSquared = segment.x * segment.x + segment.y * segment.y;
  if (segmentLengthSquared === 0) {
    return false;
  }

  // the aircraft already on the leg
  const along = Math.max(0, Math.min(1, -(a.x * segment.x + a.y * segment.y) / segmentLengthSquared));
  if (Math.hypot(a.x + along * segment.x, a.y + along * segment.y) < ON_LEG_DISTANCE) {
    return true;
  }

  // the ray (t >= 0) against the segment (0 <= u <= 1): t * direction = a + u * segment
  const track = (trueTrack * Math.PI) / 180;
  const direction = { x: Math.sin(track), y: Math.cos(track) };
  const denominator = direction.x * segment.y - direction.y * segment.x;
  if (Math.abs(denominator) < 1e-9) {
    // parallel to the leg: no interception
    return false;
  }
  const t = (a.x * segment.y - a.y * segment.x) / denominator;
  const u = (a.x * direction.y - a.y * direction.x) / denominator;
  return t >= 0 && u >= 0 && u <= 1;
}

/**
 * NO NAV INTERCEPTION (A380): in HDG or TRK with NAV armed, in flight, the track does not
 * intercept the active leg before the TO waypoint. Design choices: only with NAV armed (the ND shows the interception
 * path for the armed NAV mode), and only for an active TF leg (a leg from the FROM waypoint to the TO waypoint), the
 * other legs have no fixed start.
 * @param headingOrTrackEngaged the lateral mode is HDG or TRACK
 * @param navArmed NAV is armed
 * @param inFlight the aircraft is in flight (climb to go around phases)
 * @param activeLeg the start and end of the active TF leg, null for another leg
 * @param aircraft the aircraft position, null if invalid
 * @param trueTrack the aircraft true track, degrees
 */
export function isNoNavInterception(
  headingOrTrackEngaged: boolean,
  navArmed: boolean,
  inFlight: boolean,
  activeLeg: { start: Coordinates; end: Coordinates } | null,
  aircraft: Coordinates | null,
  trueTrack: number,
): boolean {
  if (!headingOrTrackEngaged || !navArmed || !inFlight || activeLeg === null || aircraft === null) {
    return false;
  }
  if (!Number.isFinite(trueTrack)) {
    return false;
  }
  return !doesTrackInterceptLeg(aircraft, trueTrack, activeLeg.start, activeLeg.end);
}
