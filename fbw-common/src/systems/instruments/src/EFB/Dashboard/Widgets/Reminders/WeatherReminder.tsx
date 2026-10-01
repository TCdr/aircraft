// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { t } from '../../../Localization/translation';
import { WeatherWidget } from '../WeatherWidget';
import { RemindersSection } from './RemindersSection';
import { useAppSelector } from '../../../Store/store';

export const WeatherReminder = () => {
  const { departingAirport, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const { userDepartureIcao, userDestinationIcao } = useAppSelector((state) => state.dashboard);

  return (
    <RemindersSection title={t('Dashboard.ImportantInformation.Weather.Title')} noLink>
      <div className="flex flex-col">
        <WeatherWidget name="origin" simbriefIcao={departingAirport} userIcao={userDepartureIcao} />
        <div className="my-3 h-px w-full bg-m3-tile" />
        <WeatherWidget name="destination" simbriefIcao={arrivingAirport} userIcao={userDestinationIcao} />
      </div>
    </RemindersSection>
  );
};
