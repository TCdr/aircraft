// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useContext } from 'react';

import { t } from '../Localization/translation';
import { Navbar } from '../UtilComponents/Navbar';
import { LandingWidget } from './Widgets/LandingWidget';
import { TakeoffWidget } from './Widgets/TakeoffWidget';
import { DescentWidget } from './Widgets/DescentWidget';
import { TabRoutes, PageLink, PageRedirect } from '../Utils/routing';
import { AircraftContext } from '../AircraftContext';
import { TemperatureCorrectionWidget } from './Widgets/TemperatureCorrectionWidget';
import { BuffetWidget } from './Widgets/BuffetWidget';

export const Performance = () => {
  const calculators = useContext(AircraftContext).performanceCalculators;

  const tabs: PageLink[] = [
    calculators.takeoff
      ? {
          name: 'Takeoff',
          alias: t('Performance.Takeoff.Title'),
          component: <TakeoffWidget />,
        }
      : null,
    calculators.descent
      ? { name: 'Top of Descent', alias: t('Performance.TopOfDescent.Title'), component: <DescentWidget /> }
      : null,
    calculators.landing
      ? { name: 'Landing', alias: t('Performance.Landing.Title'), component: <LandingWidget /> }
      : null,
    {
      name: 'Temperature Correction',
      alias: t('Performance.TemperatureCorrection.Title'),
      component: <TemperatureCorrectionWidget />,
    },
    // Only for an aircraft with a buffet onset chart (A32NX: A320 FCOM LIM-13)
    calculators.buffetEnvelope
      ? { name: 'Buffet', alias: t('Performance.Buffet.Title'), component: <BuffetWidget /> }
      : null,
  ].filter((t) => t !== null);

  return (
    <div className="w-full">
      <div className="relative">
        <h1 className="font-bold">{t('Performance.Title')}</h1>
        <Navbar className="absolute right-0 top-0" tabs={tabs} basePath="/performance" />
      </div>
      <div className="mt-4">
        <PageRedirect basePath="/performance" tabs={tabs} />
        <TabRoutes basePath="/performance" tabs={tabs} />
      </div>
    </div>
  );
};
