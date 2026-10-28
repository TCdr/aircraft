// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type TimeOfDay = 'day' | 'dawnDusk' | 'night';

/** The preset IDs assigned to each time of day (0 = none) */
export interface AutoLoadAssignment {
  day: number;
  dawnDusk: number;
  night: number;
}

const TIMES_OF_DAY: TimeOfDay[] = ['day', 'dawnDusk', 'night'];

/** The sim's TIME OF DAY enum: 1 = day, 2 = dawn/dusk, 3 = night; anything else is unknown */
export function timeOfDayFromSimValue(value: number): TimeOfDay | null {
  switch (value) {
    case 1:
      return 'day';
    case 2:
      return 'dawnDusk';
    case 3:
      return 'night';
    default:
      return null;
  }
}

/** The times of day a preset is loaded for automatically */
export function autoLoadTags(presetId: number, assignment: AutoLoadAssignment): TimeOfDay[] {
  if (presetId <= 0) {
    return [];
  }
  return TIMES_OF_DAY.filter((timeOfDay) => assignment[timeOfDay] === presetId);
}

type Translate = (key: string, replacements?: Record<string, string>[]) => string;

/** The name of a preset, or "Preset <n>" while it has none */
export function presetLabel(presetId: number, name: string | undefined, translate: Translate): string {
  return name || translate('Presets.InteriorLighting.PresetNumber', [{ number: String(presetId) }]);
}

/** A cleared name returns the preset to its unnamed state, stored as an empty string */
export function normalizePresetName(typed: string): string {
  return typed.trim();
}
