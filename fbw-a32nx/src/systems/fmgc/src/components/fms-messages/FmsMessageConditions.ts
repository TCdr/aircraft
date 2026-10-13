// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FmgcFlightPhase } from '@shared/flightphase';
import { Coordinates, distanceTo } from 'msfs-geo';

/*
 * The trigger conditions of FMS messages of the A320 MCDU message list (a320_fcom.txt l.22472-23180) and of the A380
 * MFD message list (a380_fcom.txt l.44767-46377), as pure functions shared by both aircraft.
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
 * AREA RNP IS XX.XX (A320 l.22494-22497, A380 l.44876-44881): the RNP manually entered is larger than the default RNP of
 * the flight area, and the database has no RNP for the active leg. PROCEDURE RNP IS / PROC RNP IS XX.XX (A320
 * l.22919-22921, A380 l.45916-45920): the RNP manually entered is larger than the RNP of the database for the active leg.
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
 * Whether the date is in the effectivity of the active navigation database: else CHECK DATA BASE CYCLE (A320
 * l.22539-22541) / CHECK DATABASE CYCLE (A380 l.44998-45003) "The current date does not match the effectivity of the
 * active navigation database". An unknown effectivity raises nothing.
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

/** CHECK IRS/AIRPORT POS (A320 l.22552-22553): "is at least 5 NM" */
export const IRS_AIRPORT_POSITION_DISAGREE_NM = 5;

/**
 * CHECK IRS/AIRPORT POS (A320 l.22552-22553) / CHECK IRS / ARPT POSITION (A380 l.45028-45033): the distance between an
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

/** IRS ONLY NAVIGATION (A320 l.22750-22756): "for more than 10 min" */
export const IRS_ONLY_NAVIGATION_DELAY_MS = 10 * 60_000;

/**
 * IRS ONLY NAVIGATION (A320 l.22750-22756): the aircraft is neither in an approach nor in a terminal area, and it has
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
 * TIME TO EXIT (A320 l.23116-23118, A380 l.46252-46256): in the holding, the extra fuel is zero (or less)
 * @param inHolding the active leg is a holding
 * @param extraFuel the extra fuel, null without predictions
 */
export function isTimeToExitHolding(inHolding: boolean, extraFuel: number | null): boolean {
  return inHolding && extraFuel !== null && extraFuel <= 0;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Whether the clock has passed a time of day since the previous check (T.O TIME REACHED, A380 l.46287-46291: the aircraft
 * clock reaches the ETT), across midnight
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
 * EXPECT TURN AREA EXCEEDANCE (A380 l.45384-45389): the active or the next leg is a procedure turn that exceeds the
 * excursion distance of the navigation database
 * @param legs the active and next legs of the guidance geometry
 */
export function isProcedureTurnExceedanceAhead(
  legs: readonly ({ turnAreaExceeded?: boolean } | null | undefined)[],
): boolean {
  return legs.some((leg) => leg !== null && leg !== undefined && leg.turnAreaExceeded === true);
}

/**
 * ENTER DEST DATA (A320 l.22665, l.22668-22669): a destination QNH, temperature or wind is missing. CHECK DEST DATA (A320
 * l.22534, l.22543-22547): the destination data were received by uplink (the wind not entered by the flight crew).
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
