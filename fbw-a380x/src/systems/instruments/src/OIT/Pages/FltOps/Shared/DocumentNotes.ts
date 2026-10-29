// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The longest note. Design choice: a note is one short line in an entry field: the crew types it on the laptop keyboard. */
export const DOCUMENT_NOTE_MAX_LENGTH = 120;

/** The notes of the crew on the units of a document tree, one text per unit */
export class DocumentNotes {
  private notes: Record<string, string> = {};

  /** @param onChange called after every change with the unit and its new text (null once deleted), to store the notes */
  constructor(private readonly onChange: (unitId: string, text: string | null) => void = () => {}) {}

  public get(unitId: string): string | null {
    return this.notes[unitId] ?? null;
  }

  public has(unitId: string): boolean {
    return this.notes[unitId] !== undefined;
  }

  /** @returns the units that have a note */
  public unitIds(): string[] {
    return Object.keys(this.notes);
  }

  /**
   * Save of the note field: an empty text deletes the note.
   * @param unitId the unit
   * @param text the note text
   */
  public save(unitId: string, text: string): void {
    const trimmed = text.trim().substring(0, DOCUMENT_NOTE_MAX_LENGTH);
    if (trimmed === '') {
      this.delete(unitId);
      return;
    }
    this.notes = { ...this.notes, [unitId]: trimmed };
    this.onChange(unitId, trimmed);
  }

  public delete(unitId: string): void {
    if (!this.has(unitId)) {
      return;
    }
    const rest = { ...this.notes };
    delete rest[unitId];
    this.notes = rest;
    this.onChange(unitId, null);
  }

  /** @returns the notes for the store */
  public toRecord(): Record<string, string> {
    return { ...this.notes };
  }

  /**
   * @param stored the notes read from the store, anything for a damaged store
   */
  public load(stored: unknown): void {
    this.notes = {};
    if (stored === null || typeof stored !== 'object') {
      return;
    }
    const record = stored as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (typeof record[key] === 'string' && record[key] !== '') {
        this.notes[key] = record[key] as string;
      }
    }
  }
}
