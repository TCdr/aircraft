// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/**
 * The text of an entry field. The field validates its entry only at ENT or when another field is selected, but a
 * button next to it (SEARCH, Save) is clicked before that: the characters typed so far are kept apart, so the button
 * acts on what the crew sees in the field.
 */
export class DocumentTextEntry {
  /** The validated text, which the field shows */
  public readonly value = Subject.create<string | null>(null);

  private typed: string | null = null;

  /** @param onEdited called with the text in the field after every key press and every validated entry */
  constructor(private readonly onEdited: (text: string) => void = () => {}) {}

  /** @returns the text in the field now: the characters typed, else the validated text */
  public current(): string {
    return this.typed ?? this.value.get() ?? '';
  }

  /**
   * @param text the text to show in the field, null to empty it
   */
  public set(text: string | null): void {
    this.typed = null;
    this.value.set(text);
  }

  /**
   * The characters in the field after a key press
   * @param text the characters in the field
   */
  public readonly onInput = (text: string): void => {
    this.typed = text;
    this.onEdited(text);
  };

  /**
   * The validated entry
   * @param text the validated text, null when the field was emptied
   */
  public readonly onModified = (text: string | null): void => {
    this.typed = null;
    this.value.set(text);
    this.onEdited(text ?? '');
  };
}
