// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useMemo } from 'react';
import { usePersistentSetting } from '@flybywiresim/fbw-sdk-react';
import { encodeThemeChoice, legacyThemeOf, resolveThemeChoice, ThemeChoice } from './themePalette';

/**
 * The flyPad theme (the stored EFB_UI_PALETTE, the old EFB_UI_THEME until it is migrated) and its setter, which writes
 * both settings: EFB_UI_THEME keeps the preset of the base for anything still reading it.
 * @returns the theme, its stored text (a stable key for effects) and the setter
 */
export function useThemeChoice(): [ThemeChoice, string, (choice: ThemeChoice) => void] {
  const [palette, setPalette] = usePersistentSetting('EFB_UI_PALETTE');
  const [legacyTheme, setLegacyTheme] = usePersistentSetting('EFB_UI_THEME');

  const choice = useMemo(() => resolveThemeChoice(palette, legacyTheme), [palette, legacyTheme]);

  const setChoice = (next: ThemeChoice) => {
    setLegacyTheme(legacyThemeOf(next));
    setPalette(encodeThemeChoice(next));
  };

  return [choice, encodeThemeChoice(choice), setChoice];
}
