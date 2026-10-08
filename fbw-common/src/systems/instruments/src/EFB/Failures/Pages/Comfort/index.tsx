// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AtaChapterNumber, AtaChaptersTitle, AtaChaptersDescription, Failure } from '@flybywiresim/fbw-sdk-react';
import React from 'react';
import { Route } from 'react-router';
import { Link } from 'react-router-dom';
import { ScrollableContainer } from '../../../UtilComponents/ScrollableContainer';
import { t } from '../../../Localization/translation';
import { pathify } from '../../../Utils/routing';
import { AtaChapterPage } from './AtaChapterPage';
import { useFailuresOrchestrator } from '../../../failures-orchestrator-provider';
import { failuresCountLabel } from '../../activeFailuresLabel';

interface ATAChapterCardProps {
  ataNumber: AtaChapterNumber;
  title: string;
  description: string;
  className?: string;
}

const ATAChapterCard = ({ ataNumber, description, title, className }: ATAChapterCardProps) => {
  const { activeFailures, allFailures } = useFailuresOrchestrator();

  const hasActiveFailure = allFailures
    .filter((it) => it.ata === ataNumber)
    .some((it) => activeFailures.has(it.identifier));

  const chapterFailures = allFailures.filter((it) => it.ata === ataNumber);
  const activeCount = chapterFailures.filter((it) => activeFailures.has(it.identifier)).length;

  return (
    <Link
      to={`/failures/comfort/${pathify(ataNumber.toString())}`}
      className={`flex flex-row rounded-2xl bg-m3-card p-3 transition duration-100 hover:bg-m3-tile ${className ?? ''}`}
    >
      <div className="relative mr-4 flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-m3-tile">
        <span className="text-xs font-bold tracking-widest text-m3-muted">ATA</span>
        <span className="text-3xl font-bold leading-none text-m3-text">{ataNumber}</span>
        {hasActiveFailure && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-m3-on-error" />}
      </div>

      <div className="flex min-w-0 grow flex-col">
        <div className="flex flex-row items-center">
          <span className="grow truncate text-base font-bold text-m3-text">{title}</span>
          {activeCount > 0 && (
            <span className="ml-2 whitespace-nowrap rounded-full bg-m3-error-container px-2 py-1 text-xs font-bold leading-none text-m3-on-error">
              {`${activeCount} ${t('Failures.Active')}`}
            </span>
          )}
          <span className="ml-2 whitespace-nowrap rounded-full bg-m3-tile px-2 py-1 text-xs font-bold leading-none text-m3-muted">
            {failuresCountLabel(chapterFailures.length, t)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-snug text-m3-muted">{description}</p>
      </div>
    </Link>
  );
};

interface ComfortUIProps {
  filteredChapters: AtaChapterNumber[];
  allChapters: AtaChapterNumber[];
  failures: Failure[];
}

export const ComfortUI = ({ filteredChapters, allChapters, failures }: ComfortUIProps) => (
  <>
    <Route exact path="/failures/comfort">
      <ScrollableContainer innerClassName="grid grid-cols-2" height={44}>
        {filteredChapters.map((chapter, index) => (
          <ATAChapterCard
            key={chapter}
            className={`${index % 2 !== 0 ? 'ml-3' : ''} ${index >= 2 ? 'mt-3' : ''}`}
            ataNumber={chapter}
            title={AtaChaptersTitle[chapter]}
            description={AtaChaptersDescription[chapter]}
          />
        ))}
      </ScrollableContainer>
      {filteredChapters.length === 0 && (
        <div className="flex h-96 items-center justify-center rounded-2xl bg-m3-card-low">
          <p className="text-lg text-m3-muted">{t('Failures.NoItemsFound')}</p>
        </div>
      )}
    </Route>

    {allChapters.map((chapter) => (
      <Route key={chapter} path={`/failures/comfort/${chapter.toString()}`}>
        <AtaChapterPage chapter={chapter} failures={failures} />
      </Route>
    ))}
  </>
);
