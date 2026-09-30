// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { AltitudeDescriptor } from '@flybywiresim/fbw-sdk';
import { AtsuMessageDirection, CpdlcMessage, CpdlcMessagesUplink } from '@datalink/common';
import {
  constraintClearanceOf,
  levelInFeet,
  REJECT_FORMAT_ERROR,
  REJECT_OUT_OF_RANGE,
  timeInSeconds,
} from './AtcConstraintClearance';
import { TimeConstraintType } from './TimeConstraint';

/**
 * An uplink crossing constraint
 * @param typeId the message element (UM46...)
 * @param values the values of its parameters
 * @returns the message
 */
function uplink(typeId: string, ...values: string[]): CpdlcMessage {
  const message = new CpdlcMessage();
  message.Direction = AtsuMessageDirection.Uplink;
  const element = CpdlcMessagesUplink[typeId][1].deepCopy();
  values.forEach((value, i) => (element.Content[i].Value = value));
  message.Content.push(element);
  return message;
}

describe('ATC crossing constraints', () => {
  it('reads the CPDLC levels and times', () => {
    expect(levelInFeet('FL350')).toBe(35000);
    expect(levelInFeet('240')).toBe(24000);
    expect(levelInFeet('11000FT')).toBe(11000);
    expect(levelInFeet('5000')).toBe(5000);
    expect(levelInFeet('1500M')).toBe(4920);
    expect(levelInFeet('TUDRA')).toBeNull();
    expect(timeInSeconds('1205Z')).toBe(12 * 3600 + 5 * 60);
    expect(timeInSeconds('2460Z')).toBeNull();
  });

  it('turns the level messages into the altitude constraints of the VERT REV page', () => {
    expect(constraintClearanceOf(uplink('UM46', 'KIMMO', 'FL500'))?.altitude).toEqual({
      altitudeDescriptor: AltitudeDescriptor.AtAlt1,
      altitude1: 50000,
    });
    expect(constraintClearanceOf(uplink('UM47', 'KIMMO', 'FL240'))?.altitude?.altitudeDescriptor).toBe(
      AltitudeDescriptor.AtOrAboveAlt1,
    );
    expect(constraintClearanceOf(uplink('UM48', 'KIMMO', '11000FT'))?.altitude?.altitudeDescriptor).toBe(
      AltitudeDescriptor.AtOrBelowAlt1,
    );
    // A window: the upper altitude first
    expect(constraintClearanceOf(uplink('UM50', 'KIMMO', 'FL200', 'FL240'))?.altitude).toEqual({
      altitudeDescriptor: AltitudeDescriptor.BetweenAlt1Alt2,
      altitude1: 24000,
      altitude2: 20000,
    });
  });

  it('turns the time messages into an RTA, and keeps the values for the REJECTED ATC INFO page', () => {
    const clearance = constraintClearanceOf(uplink('UM52', 'TAN', '1205Z'))!;
    expect(clearance.position).toBe('TAN');
    expect(clearance.time).toEqual({ type: TimeConstraintType.AtOrBefore, utcSeconds: 43500 });
    expect(clearance.elements.time).toEqual({ description: 'RTA TIME', value: '12:05:00', at: 'TAN', error: '' });

    const both = constraintClearanceOf(uplink('UM58', 'TAN', '1205Z', 'FL330'))!;
    expect(both.time?.type).toBe(TimeConstraintType.At);
    expect(both.altitude?.altitude1).toBe(33000);
  });

  it('keeps the speeds in knots from 90 kt to VMO, and rejects a Mach number', () => {
    const level = constraintClearanceOf(uplink('UM61', 'TAN', 'FL100', '220KT'))!;
    expect(level.speed).toBe(220);
    expect(level.elements.speed?.value).toBe('220KT');
    expect(constraintClearanceOf(uplink('UM56', 'TAN', '250'))?.speed).toBe(250);

    expect(constraintClearanceOf(uplink('UM55', 'TAN', 'M.82'))?.rejected).toEqual([
      { description: 'ALT/SPD CSTR', value: 'M.82', at: 'TAN', error: REJECT_FORMAT_ERROR },
    ]);
    expect(constraintClearanceOf(uplink('UM55', 'TAN', '80'))?.rejected[0].error).toBe(REJECT_OUT_OF_RANGE);
  });

  it('is not a constraint message', () => {
    expect(constraintClearanceOf(uplink('UM20', 'FL340'))).toBeNull();
  });
});
