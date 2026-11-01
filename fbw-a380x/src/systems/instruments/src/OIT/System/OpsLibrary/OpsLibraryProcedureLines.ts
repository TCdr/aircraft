// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { ChecklistState } from '../../../MsfsAvionicsCommon/providers/FwsPublisher';
import {
  ProcedureLinesGenerator,
  ProcedureType,
} from '../../../MsfsAvionicsCommon/EcamMessages/ProcedureLinesGenerator';
import { ChecklistLineStyle, EcamAbnormalProcedures, WdLineData } from '../../../MsfsAvionicsCommon/EcamMessages';

export type FwcColour = 'yellow' | 'red' | 'green' | 'amber' | 'cyan' | 'magenta' | 'white';

/** A run of text of one line with the attributes the EWD codes set */
export interface FwcTextSegment {
  readonly text: string;
  readonly colour: FwcColour;
  readonly underlined: boolean;
  readonly framed: boolean;
}

const CODE_COLOURS: Readonly<Record<string, FwcColour>> = {
  '<1m': 'yellow',
  '<2m': 'red',
  '<3m': 'green',
  '<4m': 'amber',
  '<5m': 'cyan',
  '<6m': 'magenta',
  '<7m': 'white',
};

/** The longest escape code: <5m and the like are three characters */
const LONGEST_CODE_LENGTH = 3;

/**
 * Splits an EWD text with its escape codes (colour, underline, frame) into runs of text, a line per carriage return or
 * newline. The EWD draws the same codes in SVG; this keeps the text as plain HTML for the OPS LIBRARY.
 * @param text the EWD text
 * @param defaultColour the colour before the first code
 * @returns the lines with their runs
 */
export function parseFwcText(text: string, defaultColour: FwcColour = 'white'): FwcTextSegment[][] {
  const lines: FwcTextSegment[][] = [[]];
  let colour = defaultColour;
  let underlined = false;
  let framed = false;
  let buffer = '';

  const flush = () => {
    if (buffer !== '') {
      lines[lines.length - 1].push({ text: buffer, colour, underlined, framed });
      buffer = '';
    }
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\x1b') {
      flush();
      let code = '';
      let matched = false;
      for (let j = i + 1; j < text.length && code.length < LONGEST_CODE_LENGTH + 1 && !matched; j++) {
        code += text[j];
        if (code === 'm') {
          underlined = false;
          framed = false;
          matched = true;
        } else if (code === '4m') {
          underlined = true;
          matched = true;
        } else if (code === ')m') {
          matched = true;
        } else if (code === "'m") {
          framed = true;
          matched = true;
        } else if (CODE_COLOURS[code] !== undefined) {
          colour = CODE_COLOURS[code];
          matched = true;
        }
        if (matched) {
          i = j;
        }
      }
    } else if (char === '\r' || char === '\n') {
      flush();
      lines.push([]);
    } else {
      buffer += char;
    }
  }
  flush();
  return lines;
}

/**
 * The colour a line style gives its text before the codes of the text
 * @param style the line style
 * @returns the colour
 */
export function lineStyleColour(style: ChecklistLineStyle): FwcColour {
  switch (style) {
    case ChecklistLineStyle.Cyan:
    case ChecklistLineStyle.ChecklistCondition:
      return 'cyan';
    case ChecklistLineStyle.Green:
    case ChecklistLineStyle.GreenTable:
      return 'green';
    case ChecklistLineStyle.Amber:
      return 'amber';
    case ChecklistLineStyle.Red:
    case ChecklistLineStyle.LandAsap:
    case ChecklistLineStyle.LandAnsa:
      return 'red';
    default:
      return 'white';
  }
}

/**
 * The state of a procedure that is not running: every line shown and active, nothing checked.
 * @param alertId the ECAM alert id
 * @returns the state
 */
export function defaultProcedureState(alertId: string): ChecklistState {
  const count = EcamAbnormalProcedures[alertId]?.items.length ?? 0;
  return {
    id: alertId,
    procedureActivated: false,
    itemsChecked: new Array(count).fill(false),
    itemsToShow: new Array(count).fill(true),
    itemsActive: new Array(count).fill(true),
    // The generator warns about a timed item without its time stamp entry
    itemsTimeStamp: new Array(count).fill(null),
  };
}

/**
 * The lines of an ECAM procedure, from the generator the EWD and the FWS use. The generator draws a procedure that is
 * not the active one as its title only, so the library asks for the active form; the ACTIVATE and CLEAR lines are
 * controls of the crew on the ECAM and are left out.
 * @param alertId the ECAM alert id
 * @param state the state of the procedure as it ran, null for the plain procedure
 * @returns the lines
 */
export function procedureLines(alertId: string, state: ChecklistState | null): WdLineData[] {
  return new ProcedureLinesGenerator(
    alertId,
    Subject.create(true),
    ProcedureType.Abnormal,
    state ?? defaultProcedureState(alertId),
  )
    .toLineData()
    .filter((line) => line.originalItemIndex === undefined || line.originalItemIndex >= 0);
}
