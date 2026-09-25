// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';

import { AirframeType } from '@flybywiresim/fbw-sdk-react';
import { t, Navbar, TabRoutes, PageLink, PageRedirect, useAppSelector } from '@flybywiresim/flypad';
import { OverviewPage } from './Pages/OverviewPage';
import { LoadSheetWidget } from './Pages/LoadsheetPage';
import { PrintoutsPage } from './Pages/PrintoutsPage';

export const Dispatch = () => {
  const airframeInfo = useAppSelector((state) => state.config.airframeInfo);

  const tabs: PageLink[] = [
    { name: 'OFP', alias: t('Dispatch.Ofp.Title'), component: <LoadSheetWidget /> },
    { name: 'Overview', alias: t('Dispatch.Overview.Title'), component: <OverviewPage /> },
  ];
  // The A380X cockpit printer has no paper: the FMS printouts are read here
  if (airframeInfo.variant === AirframeType.A380_842) {
    tabs.push({ name: 'Printouts', alias: t('Dispatch.Printouts.Title'), component: <PrintoutsPage /> });
  }

  return (
    <div className="w-full">
      <div className="relative mb-4">
        <h1 className="font-bold">{t('Dispatch.Title')}</h1>
        <Navbar className="absolute right-0 top-0" tabs={tabs} basePath="/dispatch" />
      </div>

      <PageRedirect basePath="/dispatch" tabs={tabs} />
      <TabRoutes basePath="/dispatch" tabs={tabs} />
    </div>
  );
};
