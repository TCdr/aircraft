// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Helpers of the Logic module specs (no shipped code imports this file)

import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { StatusLines } from './CondStatus';
import { FwcAlertItem } from './FwcAlertItem';

/** An E/WD or STATUS text without its colour and format escape sequences */
export function withoutColourCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b[^m]*m/g, '');
}

const plain = withoutColourCodes;

/** The E/WD lines an alert item shows now, without the colour codes */
export function ewdLines(item: FwcAlertItem): string[] {
  const codes = item
    .whichCodeToReturn()
    .filter((line): line is number => line !== null)
    .map((line) => item.codesToReturn[line]);
  return formatEwdMessages(codes).map(plain);
}

/** The E/WD lines of codes, with their colour codes */
export function ewdTexts(codes: string[]): string[] {
  return formatEwdMessages(codes);
}

/** The STATUS page lines (left and right column) of status lines, without the colour codes */
export function statusLines(status: StatusLines): { left: string[]; right: string[] } {
  const page = formatStatusPage(status.left, status.inopSys);
  const split = (text: string) => (text === '' ? [] : text.split('\r').map(plain));
  return { left: split(page.left), right: split(page.right) };
}
