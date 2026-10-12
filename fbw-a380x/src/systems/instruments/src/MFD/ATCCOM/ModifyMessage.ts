// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Conversion, CpdlcMessage, CpdlcMessageContentType, CpdlcMessagesDownlink } from '@datalink/common';

import { RequestFieldKind } from './RequestFrames';

/**
 * The REPORT/MODIFY page (A380 FCOM DSC-46-10-20-30 P 22-23): the downlink message of the mailbox that the flight crew
 * modifies before sending it (the response prepared by the FMS for a confirm message), a line for each of its elements.
 */

/** A value of the message: element and content indexes, and its entry format */
export interface ModifyField {
  element: number;
  content: number;
  kind: RequestFieldKind;
  value: string;
}

/** A line of the page: texts and fields, from left to right */
export type ModifyLine = (string | ModifyField)[];

/** The entry formats of the message contents (FCOM DSC-46-10-20-50) */
const KINDS: Partial<Record<CpdlcMessageContentType, RequestFieldKind>> = {
  [CpdlcMessageContentType.Level]: 'altitude',
  [CpdlcMessageContentType.Position]: 'fix',
  [CpdlcMessageContentType.Time]: 'time',
  [CpdlcMessageContentType.Speed]: 'speed',
  [CpdlcMessageContentType.Degree]: 'degree',
  [CpdlcMessageContentType.Frequency]: 'frequency',
  [CpdlcMessageContentType.Procedure]: 'procedure',
  [CpdlcMessageContentType.Atis]: 'atisCode',
  [CpdlcMessageContentType.Fuel]: 'endurance',
  [CpdlcMessageContentType.Squawk]: 'squawk',
  [CpdlcMessageContentType.PersonsOnBoard]: 'souls',
  [CpdlcMessageContentType.Distance]: 'distance',
};

/** The texts of the page use the FCOM field names (e.g. PRESENT ALTITUDE for PRESENT LEVEL) */
function label(text: string): string {
  return text.replace(/\bLEVEL\b/g, 'ALTITUDE').trim();
}

/** The lines of the modified message: one for each element of the response */
export function modifyLines(message: CpdlcMessage): ModifyLine[] {
  const response = message.Response;
  if (!response) {
    return [];
  }
  return response.Content.map((element, elementIndex) => {
    const template = CpdlcMessagesDownlink[element.TypeId]?.[0][0] ?? '';
    const parts = template.split('%s');
    const line: ModifyLine = [];
    parts.forEach((part, i) => {
      if (part.trim() !== '') {
        line.push(label(part));
      }
      if (i < parts.length - 1) {
        const content = element.Content[i];
        line.push({
          element: elementIndex,
          content: i,
          kind: (content ? KINDS[content.Type] : undefined) ?? 'freetext',
          value: content?.Value ?? '',
        });
      }
    });
    return line;
  });
}

/**
 * The message with the modified values and the freetext of the page, for the mailbox
 * @param message the message of the mailbox
 * @param values the values of the fields, by element and content index
 * @param freetext the freetext frame, added to the response
 */
export function applyModification(
  message: CpdlcMessage,
  values: Map<string, string>,
  freetext: string | null,
): CpdlcMessage {
  const modified = Conversion.messageDataToMessage(message) as CpdlcMessage;
  const response = modified.Response;
  if (!response) {
    return modified;
  }
  response.Content.forEach((element, elementIndex) =>
    element.Content.forEach((content, contentIndex) => {
      const value = values.get(`${elementIndex}/${contentIndex}`);
      if (value !== undefined) {
        content.Value = value;
      }
    }),
  );
  if (freetext) {
    const element = CpdlcMessagesDownlink.DM67[1].deepCopy();
    element.Content[0].Value = freetext;
    response.Content.push(element);
  }
  return modified;
}
