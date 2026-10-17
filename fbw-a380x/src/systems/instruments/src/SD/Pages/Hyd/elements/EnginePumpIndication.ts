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
 * The engine pump symbol of the SD HYD page:
 * - on, normal pressure: green, vertical line.
 * - depressurized (ENG PMP pb-sw OFF): horizontal line.
 * - abnormally pressurized, the pb-sw OFF but the pump section pressurized: amber, vertical line.
 * - on, pressure below normal (also on the ground with the engine not running): amber LO.
 * - disconnected from the engine accessory gearbox by the ENG PMP A+B DISC pb: horizontal line, DISC.
 * Design choice (the source gives the states, not the pictures): the abnormal pressurization symbol is the pressurized
 * symbol (vertical line) in amber.
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
