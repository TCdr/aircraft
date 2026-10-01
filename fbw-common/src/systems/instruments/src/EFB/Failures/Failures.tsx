// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { AtaChaptersTitle } from '@flybywiresim/fbw-sdk-react';
import { Route } from 'react-router-dom';
import { ExclamationTriangle, InfoCircleFill } from 'react-bootstrap-icons';
import { t } from '../Localization/translation';
import { CompactUI } from './Pages/Compact';
import { ComfortUI } from './Pages/Comfort';
import { Navbar } from '../UtilComponents/Navbar';
import { useAppDispatch, useAppSelector } from '../Store/store';
import { SimpleInput } from '../UtilComponents/Form/SimpleInput/SimpleInput';
import { PageLink, PageRedirect } from '../Utils/routing';
import { useFailuresOrchestrator } from '../failures-orchestrator-provider';
import { setSearchQuery } from '../Store/features/failuresPage';
import { M3_INPUT, M3Banner, M3Chip } from '../UtilComponents/Material/Material';

export const Failures = () => {
  const { allFailures, activeFailures } = useFailuresOrchestrator();
  const chapters = Array.from(new Set(allFailures.map((it) => it.ata))).sort((a, b) => a - b);

  const dispatch = useAppDispatch();
  const { searchQuery } = useAppSelector((state) => state.failuresPage);

  const filteredFailures = allFailures.filter((failure) => {
    if (searchQuery === '') {
      return true;
    }

    const failureNameUpper = failure.name.toUpperCase();

    return (
      failureNameUpper.includes(searchQuery) ||
      failure.identifier.toString().includes(searchQuery) ||
      AtaChaptersTitle[failure.ata].toUpperCase().includes(searchQuery)
    );
  });

  const filteredChapters = chapters.filter((chapter) =>
    filteredFailures.map((failure) => failure.ata).includes(chapter),
  );

  const tabs: PageLink[] = [
    {
      name: 'Comfort',
      alias: t('Failures.Comfort.Title'),
      component: <ComfortUI filteredChapters={filteredChapters} allChapters={chapters} failures={filteredFailures} />,
    },
    {
      name: 'Compact',
      alias: t('Failures.Compact.Title'),
      component: <CompactUI chapters={filteredChapters} failures={filteredFailures} />,
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-row items-center">
        <h1 className="grow font-bold">{t('Failures.Title')}</h1>
        {activeFailures.size > 0 && (
          <M3Chip tone="warn" className="mr-3" icon={<ExclamationTriangle size={16} />}>
            {`${activeFailures.size} ${t('Failures.ActiveFailures')}`}
          </M3Chip>
        )}
        <Navbar basePath="/failures" tabs={tabs} />
      </div>

      <div className="flex h-content-section-reduced flex-col overflow-hidden">
        <M3Banner tone="busy" icon={<InfoCircleFill size={16} />} className="mb-3 shrink-0">
          {t('Failures.FullSimulationOfTheFailuresBelowIsntYetGuaranteed')}
        </M3Banner>

        <SimpleInput
          placeholder={t('Failures.Search')}
          className={`mb-3 w-full shrink-0 uppercase ${M3_INPUT}`}
          fontSizeClassName="text-base"
          value={searchQuery}
          onChange={(value) => dispatch(setSearchQuery(value.toUpperCase()))}
        />

        <Route path="/failures/comfort">
          <ComfortUI filteredChapters={filteredChapters} allChapters={chapters} failures={filteredFailures} />
        </Route>

        <Route path="/failures/compact">
          <CompactUI chapters={filteredChapters} failures={filteredFailures} />
        </Route>
      </div>

      <PageRedirect basePath="/failures" tabs={tabs} />
    </>
  );
};
