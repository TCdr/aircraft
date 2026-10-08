// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NXDataStore } from '@flybywiresim/fbw-sdk-react';
import { themeSettingMigration } from '../Utils/themePalette';

type SimVarProp = { name: string; defaultValue: string };
type migrationSet = [oldSimvar: SimVarProp, newSimvar: string];

const migrateSetting = (oldSimvar: SimVarProp, newSimvar: string) => {
  NXDataStore.setLegacy(newSimvar, NXDataStore.getLegacy(oldSimvar.name, oldSimvar.defaultValue));
};

// Object is set so that a list of simvars will be migrated when the migrated flag is false.
const settingsToMigrate: Map<string, migrationSet[]> = new Map([
  [
    'SIMBRIDGE_MIGRATED',
    [
      [{ name: 'CONFIG_EXTERNAL_MCDU_PORT', defaultValue: '8380' }, 'CONFIG_SIMBRIDGE_PORT'],
      [{ name: 'CONFIG_EXTERNAL_MCDU_SERVER_ENABLED', defaultValue: 'AUTO ON' }, 'CONFIG_SIMBRIDGE_ENABLED'],
    ],
  ],
]);

/**
 * The theme setting EFB_UI_PALETTE (presets and custom colours) replaces EFB_UI_THEME (presets only): written once from
 * it, so an existing user keeps exactly their theme. EFB_UI_THEME stays written with the preset of the base.
 */
export function migrateThemeSetting() {
  const palette = NXDataStore.getSetting('EFB_UI_PALETTE');
  const migrated = themeSettingMigration(palette.get(), NXDataStore.getSetting('EFB_UI_THEME').get());
  if (migrated !== null) {
    palette.set(migrated);
  }
}

export function migrateSettings() {
  migrateThemeSetting();

  settingsToMigrate.forEach((migrations, migrationCheck) => {
    if (NXDataStore.getLegacy(migrationCheck, 'false') === 'false') {
      migrations.forEach((value) => {
        migrateSetting(value[0], value[1]);
      });
      NXDataStore.setLegacy(migrationCheck, 'true');
    }
  });
}
