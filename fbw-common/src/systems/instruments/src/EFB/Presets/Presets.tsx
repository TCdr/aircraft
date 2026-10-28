// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { Check, X } from 'react-bootstrap-icons';
import { t } from '../Localization/translation';
import { M3Chip } from '../UtilComponents/Material/Material';
import { AircraftPresets } from './Widgets/AircraftPresets';
import { LightPresets } from './Widgets/LightPresets';

export const Presets = () => {
  const [simOnGround] = useSimVar('SIM ON GROUND', 'number', 200);
  const [isPowered] = useSimVar('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'number', 200);

  return (
    <div className="flex h-content-section-reduced w-full flex-col overflow-hidden">
      <div className="mb-4 flex shrink-0 flex-row items-center">
        <h1 className="grow font-bold">{t('Presets.Title')}</h1>
        <M3Chip tone={simOnGround ? 'active' : 'warn'} icon={simOnGround ? <Check size={16} /> : <X size={16} />}>
          {simOnGround ? t('Presets.OnGround') : t('Presets.InFlight')}
        </M3Chip>
        <M3Chip
          tone={isPowered ? 'active' : 'warn'}
          icon={isPowered ? <Check size={16} /> : <X size={16} />}
          className="ml-2.5"
        >
          {isPowered ? t('Presets.AcBusPowered') : t('Presets.AcBusNotPowered')}
        </M3Chip>
      </div>
      <AircraftPresets />
      <LightPresets />
    </div>
  );
};
