// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A button of an OIS message window */
export interface OisDialogButton {
  readonly label: string;
  readonly action?: () => void;
}

/**
 * An OIS message window: Information or Caution, its text and buttons. Without buttons it stays until the operation it
 * tells about ends. With an identification, it asks the personal ID (and the password when the logbook opens) and OK
 * needs them.
 */
export interface OisDialog {
  readonly kind: 'Information' | 'Caution';
  readonly lines: readonly string[];
  readonly buttons: readonly OisDialogButton[];
  readonly identification?: 'signature' | 'authentication';
}

/**
 * The PERSONAL ID after a button of a message window: an accepted identification or signature keeps it for the next
 * signature of the same log-on, so the crew types it once per flight phase; cancelling drops it. The password is never
 * kept.
 * @param personalId the personal ID typed
 * @param buttonLabel the button pressed
 * @returns the personal ID to keep
 */
export function personalIdAfterButton(personalId: string | null, buttonLabel: string): string | null {
  return buttonLabel === 'CANCEL' ? null : personalId;
}
