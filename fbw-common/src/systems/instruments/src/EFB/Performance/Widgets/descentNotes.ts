// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The separator between the notes under the descent results (crossover, deceleration, idle below...) */
export const DESCENT_NOTES_SEPARATOR = ' · ';

/**
 * Joins the notes under the descent results with a separator between them, skipping the absent or empty ones, so the
 * line never starts or ends with a separator ("Crossover FL290 · Decel to speed limit from FL150").
 */
export const joinDescentNotes = (notes: readonly (string | undefined | null | false)[]): string =>
  notes.filter((note): note is string => typeof note === 'string' && note.length > 0).join(DESCENT_NOTES_SEPARATOR);
