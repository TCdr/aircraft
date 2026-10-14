// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The line inside the engine pump square of the SD HYD page */
export enum EnginePumpLine {
  /** vertical line: the pump pressurizes the system */
  Vertical,
  /** horizontal line: the pump is depressurized (ENG PMP pb-sw OFF) or disconnected */
  Horizontal,
  /** no line, LO written in the square */
  None,
}

export interface EnginePumpIndication {
  colour: 'Green' | 'Amber';
  line: EnginePumpLine;
  /** LO in the square: the pump is on and its pressure is below normal */
  lowPressure: boolean;
}

/**
 * The engine pump symbol of the SD HYD page, A380 FCOM DSC-29-20 ENGINE PUMPS (a380_fcom.txt l.61470-61492):
 * - "The engine pump is on, and hydraulic pressure is normal." (green, vertical line)
 * - "The engine pump is depressurized." (ENG PMP pb-sw OFF: horizontal line, as the page always drew it)
 * - "The engine pump is abnormally pressurized (ENG PMP pb-sw is OFF)." (amber, vertical line: the pb-sw is OFF, but
 *   the pump section is pressurized)
 * - "The engine pump is on, and the engine pump pressure is below normal [...] On ground, the associated engine is not
 *   running." (amber LO)
 * - "The pump is disconnected from the engine accessory gearbox, via the ENG PMP A+B DISC pb." (horizontal line, DISC)
 * The FCOM text gives the states, not the figures: the abnormal pressurization symbol is the pressurized symbol
 * (vertical line) in amber.
 * @param pressurized the pump section pressure switch reads pressure
 * @param pbAuto the ENG PMP pb-sw is in AUTO (not OFF)
 * @param disconnected the pump is disconnected (ENG PMP A+B DISC)
 */
export function enginePumpIndication(
  pressurized: boolean,
  pbAuto: boolean,
  disconnected: boolean,
): EnginePumpIndication {
  if (disconnected) {
    return { colour: 'Amber', line: EnginePumpLine.Horizontal, lowPressure: false };
  }
  if (!pbAuto) {
    return {
      colour: 'Amber',
      line: pressurized ? EnginePumpLine.Vertical : EnginePumpLine.Horizontal,
      lowPressure: false,
    };
  }
  return pressurized
    ? { colour: 'Green', line: EnginePumpLine.Vertical, lowPressure: false }
    : { colour: 'Amber', line: EnginePumpLine.None, lowPressure: true };
}
