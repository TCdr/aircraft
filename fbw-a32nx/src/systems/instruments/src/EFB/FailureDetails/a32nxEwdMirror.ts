// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AlertProcedure, ProcedureLine, ProcedureLineState, parseEcamText } from '@flybywiresim/fbw-sdk';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { EwdMessageCodeOrder, formatEwdMessages } from '@shared/EwdMessages';

const ALERT_KEY_LENGTH = 7;
const CODE_LENGTH = 9;

/** Every EwdMessages code of an alert (its 7-digit prefix), title first, in EWD order. */
export function alertCodes(alertKey: string): string[] {
  return Array.from(EwdMessageCodeOrder.keys())
    .filter((code) => code.startsWith(alertKey))
    .sort((a, b) => (EwdMessageCodeOrder.get(a) as number) - (EwdMessageCodeOrder.get(b) as number));
}

export function alertExists(alertKey: string): boolean {
  return EwdMessageCodeOrder.has(`${alertKey}01`);
}

/** Line L:var values (numbers, 0 = empty line) to message codes. */
export function lineCodes(values: readonly number[]): string[] {
  return values.map((value) => (value > 0 ? String(value).padStart(CODE_LENGTH, '0') : ''));
}

function buildLines(codes: readonly string[], state: ProcedureLineState): ProcedureLine[] {
  // formatted together so a line of the same group as the title is indented like on the EWD
  return formatEwdMessages(codes.slice()).map((text) => ({ segments: parseEcamText(text), level: 0, state }));
}

/**
 * The warning system drops done lines before it writes the EWD, so a shown line is always still to do. The EWD keeps
 * only its first lines on overflow, so the last shown line tells whether this alert's tail is hidden.
 */
export function alertProcedures(
  alertKeys: readonly string[],
  shownCodes: readonly string[],
  overflow: boolean,
): AlertProcedure[] {
  const procedures: AlertProcedure[] = [];
  const lastShownCode = shownCodes.length > 0 ? shownCodes[shownCodes.length - 1] : '';

  for (const alertKey of alertKeys) {
    if (!alertExists(alertKey)) {
      continue;
    }

    const titleCode = `${alertKey}01`;
    const firstShownIndex = shownCodes.findIndex((code) => code.substring(0, ALERT_KEY_LENGTH) === alertKey);

    if (firstShownIndex < 0) {
      const formatted = buildLines(alertCodes(alertKey), 'reference');
      procedures.push({
        alertId: alertKey,
        title: formatted[0].segments,
        lines: formatted.slice(1),
        mayBeBelowEwd: overflow,
      });
      continue;
    }

    const lineCodesOfAlert = shownCodes.filter(
      (code) => code.substring(0, ALERT_KEY_LENGTH) === alertKey && code !== titleCode,
    );
    const formatted = buildLines([titleCode, ...lineCodesOfAlert], 'pending');
    procedures.push({
      alertId: alertKey,
      title: formatted[0].segments,
      lines: formatted.slice(1),
      ewdOrder: firstShownIndex,
      continuesOnEwd: overflow && lastShownCode.substring(0, ALERT_KEY_LENGTH) === alertKey,
    });
  }

  return procedures;
}

/** Reads the EWD left column live; only call it while the detail view is mounted. */
export function useA32nxAlertProcedures(alertKeys: readonly string[]): AlertProcedure[] {
  const [line1] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_1', 'number', 250);
  const [line2] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_2', 'number', 250);
  const [line3] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_3', 'number', 250);
  const [line4] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_4', 'number', 250);
  const [line5] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_5', 'number', 250);
  const [line6] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_6', 'number', 250);
  const [line7] = useSimVar('L:A32NX_EWD_LOWER_LEFT_LINE_7', 'number', 250);
  const [overflow] = useSimVar('L:A32NX_EWD_LOWER_LEFT_OVERFLOW', 'bool', 250);

  const shownCodes = lineCodes([line1, line2, line3, line4, line5, line6, line7]).filter((code) => code !== '');
  return alertProcedures(alertKeys, shownCodes, !!overflow);
}
