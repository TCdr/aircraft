// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The IDs of the preset rows (the IDs of the WASM implementation). Add or remove numbers to add or remove rows */
export const PRESET_IDS = [1, 2, 3, 4, 5, 6, 7, 8];

export interface PresetSelectionOption {
  value: number;
  displayValue: string;
}

/**
 * The options of the auto-load selections: "None" first, then every preset row by its number and its name (also the
 * unnamed ones, which used to be left out: with no named preset the list only offered "None").
 * @param namesMap the preset names by preset ID
 * @param translate the translation function of the flyPad
 */
export function buildPresetSelectionOptions(
  namesMap: Map<number, string>,
  translate: (key: string) => string,
): PresetSelectionOption[] {
  const options: PresetSelectionOption[] = [
    { value: 0, displayValue: translate('Presets.InteriorLighting.AutoLoadNoneSelection') },
  ];
  PRESET_IDS.forEach((id) => {
    const name = namesMap.get(id);
    options.push({ value: id, displayValue: `${id} - ${name || translate('Presets.InteriorLighting.NoName')}` });
  });
  return options;
}
