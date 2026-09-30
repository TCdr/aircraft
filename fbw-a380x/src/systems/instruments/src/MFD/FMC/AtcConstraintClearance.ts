// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AltitudeDescriptor } from '@flybywiresim/fbw-sdk';
import { CpdlcMessage, UplinkMessageInterpretation } from '@datalink/common';
import { RejectedAtcElement } from './AtcRouteClearance';
import { TimeConstraintType } from './TimeConstraint';

/*
 * The constraint messages the FMS loads in the third secondary flight plan with the LOAD-SEC3 button of the mailbox
 * (A380 FCOM DSC-46-10-40 "How to manage a loadable message"). The REJECTED ATC INFO figure (DSC-22-FMS-20-30 P 321)
 * names their elements: ALT/SPD CSTR (an altitude or a speed at a waypoint) and RTA TIME (a time at a waypoint), the
 * constraints of the VERT REV page. The CPDLC crossing constraints (UplinkMessageInterpretation.LoadableConstraintMessages):
 * UM46 CROSS [position] AT [level], UM47 ... AT OR ABOVE [level], UM48 ... AT OR BELOW [level], UM49 ... AT AND MAINTAIN
 * [level], UM50 ... BETWEEN [level] AND [level], UM51 ... AT [time], UM52 ... AT OR BEFORE [time], UM53 ... AT OR AFTER
 * [time], UM55 ... AT [speed], UM56 ... AT OR LESS THAN [speed], UM58 to UM60 a time and a level, UM61 ... AT AND
 * MAINTAIN [level] AT [speed]. UM54 (between two times) and UM57 (at or greater than a speed) have no FMS constraint.
 */

/** An altitude constraint as the flight plan holds it: a window has its upper altitude in altitude1 */
export interface AtcAltitudeConstraint {
  altitudeDescriptor: AltitudeDescriptor;
  altitude1: number;
  altitude2?: number;
}

/** The constraints of a constraint message, at one waypoint */
export interface AtcConstraintClearance {
  /** The waypoint of the constraints */
  position: string;
  altitude: AtcAltitudeConstraint | null;
  /** The speed constraint (the A380 FMS speed constraint is a maximum speed), knots */
  speed: number | null;
  /** The time constraint, seconds of the UTC day */
  time: { type: TimeConstraintType; utcSeconds: number } | null;
  /** The altitude, speed and time elements read, as the REJECTED ATC INFO page would show them (without error type) */
  elements: { altitude: RejectedAtcElement | null; speed: RejectedAtcElement | null; time: RejectedAtcElement | null };
  /** The constraints the FMS cannot hold */
  rejected: RejectedAtcElement[];
}

/** The descriptions of the REJECTED ATC INFO figure */
const ALT_SPD_CSTR = 'ALT/SPD CSTR';
const RTA_TIME = 'RTA TIME';

/** The error types, as the FMS messages of a crew entry */
export const REJECT_FORMAT_ERROR = 'FORMAT ERROR';
export const REJECT_OUT_OF_RANGE = 'ENTRY OUT OF RANGE';

/** A380 FCOM DSC-22-FMS-20-30 SPD entry format: NNN kt, 90 kt to VMO (340 kt) */
const MIN_SPEED_CONSTRAINT = 90;
const MAX_SPEED_CONSTRAINT = 340;

/**
 * A CPDLC level in feet
 * @param value the level, e.g. FL350, 350, 11000FT, 5000 or 3000M
 * @returns the altitude in feet, or null when the format is not a level
 */
export function levelInFeet(value: string): number | null {
  let match = /^FL(\d{1,3})$/.exec(value) ?? /^(\d{1,3})$/.exec(value);
  if (match) {
    return parseInt(match[1]) * 100;
  }
  match = /^(\d{1,5})FT$/.exec(value) ?? /^(\d{4,5})$/.exec(value);
  if (match) {
    return parseInt(match[1]);
  }
  match = /^(\d{1,5})M$/.exec(value);
  if (match) {
    return Math.round((parseInt(match[1]) * 3.28084) / 10) * 10;
  }
  return null;
}

/**
 * A CPDLC time in seconds of the UTC day
 * @param value the time, e.g. 1205Z
 * @returns the seconds, or null when the format is not a time
 */
export function timeInSeconds(value: string): number | null {
  const match = /^(\d{2})(\d{2})Z?$/.exec(value);
  if (!match || parseInt(match[1]) > 23 || parseInt(match[2]) > 59) {
    return null;
  }
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60;
}

/** A time of the day as the figure shows it, HH:MM:SS */
function timeText(seconds: number): string {
  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;
  return [hh, mm, ss].map((n) => n.toString().padStart(2, '0')).join(':');
}

/**
 * The constraints of an uplink message
 * @param message the uplink message
 * @returns the constraints, or null when the message has no constraint message element
 */
export function constraintClearanceOf(message: CpdlcMessage): AtcConstraintClearance | null {
  const element = message.Content?.find((e) =>
    UplinkMessageInterpretation.LoadableConstraintMessages.includes(e.TypeId),
  );
  if (!element) {
    return null;
  }
  const values = element.Content.map((content) => (content.Value ?? '').trim().toUpperCase());
  const position = values[0];
  const result: AtcConstraintClearance = {
    position,
    altitude: null,
    speed: null,
    time: null,
    elements: { altitude: null, speed: null, time: null },
    rejected: [],
  };

  const level = (value: string, descriptor: AltitudeDescriptor) => {
    const feet = levelInFeet(value);
    if (feet === null) {
      result.rejected.push({ description: ALT_SPD_CSTR, value, at: position, error: REJECT_FORMAT_ERROR });
    } else {
      result.altitude = { altitudeDescriptor: descriptor, altitude1: feet };
      result.elements.altitude = { description: ALT_SPD_CSTR, value, at: position, error: '' };
    }
  };
  const speed = (value: string) => {
    const match = /^(\d{2,3})(KT)?$/.exec(value);
    const knots = match ? parseInt(match[1]) : null;
    if (knots === null) {
      // A Mach number: the speed constraints are in knots
      result.rejected.push({ description: ALT_SPD_CSTR, value, at: position, error: REJECT_FORMAT_ERROR });
    } else if (knots < MIN_SPEED_CONSTRAINT || knots > MAX_SPEED_CONSTRAINT) {
      result.rejected.push({ description: ALT_SPD_CSTR, value, at: position, error: REJECT_OUT_OF_RANGE });
    } else {
      result.speed = knots;
      result.elements.speed = { description: ALT_SPD_CSTR, value: `${knots}KT`, at: position, error: '' };
    }
  };
  const time = (value: string, type: TimeConstraintType) => {
    const seconds = timeInSeconds(value);
    if (seconds === null) {
      result.rejected.push({ description: RTA_TIME, value, at: position, error: REJECT_FORMAT_ERROR });
    } else {
      result.time = { type, utcSeconds: seconds };
      result.elements.time = { description: RTA_TIME, value: timeText(seconds), at: position, error: '' };
    }
  };

  switch (element.TypeId) {
    case 'UM46':
    case 'UM49':
      level(values[1], AltitudeDescriptor.AtAlt1);
      break;
    case 'UM47':
      level(values[1], AltitudeDescriptor.AtOrAboveAlt1);
      break;
    case 'UM48':
      level(values[1], AltitudeDescriptor.AtOrBelowAlt1);
      break;
    case 'UM50': {
      const a = levelInFeet(values[1]);
      const b = levelInFeet(values[2]);
      if (a === null || b === null) {
        result.rejected.push({
          description: ALT_SPD_CSTR,
          value: `${values[1]} ${values[2]}`,
          at: position,
          error: REJECT_FORMAT_ERROR,
        });
      } else {
        result.altitude = {
          altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2,
          altitude1: Math.max(a, b),
          altitude2: Math.min(a, b),
        };
        result.elements.altitude = {
          description: ALT_SPD_CSTR,
          value: `${values[1]}/${values[2]}`,
          at: position,
          error: '',
        };
      }
      break;
    }
    case 'UM51':
      time(values[1], TimeConstraintType.At);
      break;
    case 'UM52':
      time(values[1], TimeConstraintType.AtOrBefore);
      break;
    case 'UM53':
      time(values[1], TimeConstraintType.AtOrAfter);
      break;
    case 'UM55':
    case 'UM56':
      speed(values[1]);
      break;
    case 'UM58':
      time(values[1], TimeConstraintType.At);
      level(values[2], AltitudeDescriptor.AtAlt1);
      break;
    case 'UM59':
      time(values[1], TimeConstraintType.AtOrBefore);
      level(values[2], AltitudeDescriptor.AtAlt1);
      break;
    case 'UM60':
      time(values[1], TimeConstraintType.AtOrAfter);
      level(values[2], AltitudeDescriptor.AtAlt1);
      break;
    case 'UM61':
      level(values[1], AltitudeDescriptor.AtAlt1);
      speed(values[2]);
      break;
  }
  return result;
}
