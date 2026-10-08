// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'react-bootstrap-icons';
import { AtaChapterNumber, AtaChaptersTitle, Failure } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../../Localization/translation';
import { FailureButton } from '../../FailureButton';
import { useFailuresOrchestrator } from '../../../failures-orchestrator-provider';
import { ScrollableContainer } from '../../../UtilComponents/ScrollableContainer';
import { useAppSelector } from '../../../Store/store';

interface AtaChapterPageProps {
  chapter: AtaChapterNumber;
  failures: Failure[];
}

export const AtaChapterPage = ({ chapter, failures }: AtaChapterPageProps) => {
  const { activeFailures, activate, deactivate } = useFailuresOrchestrator();
  const { searchQuery } = useAppSelector((state) => state.failuresPage);
  const filteredFailures = failures.filter((failure) => failure.ata === chapter);

  const handleFailureButtonClick = (failureIdentifier: number) => {
    if (!activeFailures.has(failureIdentifier)) {
      activate(failureIdentifier);
    } else {
      deactivate(failureIdentifier);
    }
  };

  const getHighlightedTerm = (failureName: string) => {
    const searchQueryIdx = failureName.toUpperCase().indexOf(searchQuery);

    if (searchQuery === '' || searchQueryIdx === -1) return undefined;

    return failureName.substring(searchQueryIdx, searchQueryIdx + searchQuery.length);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link to="/failures/comfort" className="mb-3 inline-flex shrink-0 flex-row items-center self-start">
        <span className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl bg-m3-tile text-m3-text">
          <ArrowLeft size={20} />
        </span>
        <span className="text-2xl font-bold text-m3-text">{`ATA ${chapter} · ${AtaChaptersTitle[chapter]}`}</span>
      </Link>

      {filteredFailures.length === 0 ? (
        <div className="flex h-96 items-center justify-center rounded-2xl bg-m3-card-low">
          <p className="text-lg text-m3-muted">{t('Failures.NoItemsFound')}</p>
        </div>
      ) : (
        <ScrollableContainer innerClassName="grid grid-cols-4 auto-rows-auto" height={40}>
          {filteredFailures.map((failure, index) => (
            <FailureButton
              key={failure.identifier}
              name={failure.name}
              isActive={activeFailures.has(failure.identifier)}
              highlightedTerm={getHighlightedTerm(failure.name)}
              onClick={() => handleFailureButtonClick(failure.identifier)}
              className={`${index % 4 !== 0 ? 'ml-3' : ''} ${index >= 4 ? 'mt-3' : ''} h-20`}
            />
          ))}
        </ScrollableContainer>
      )}
    </div>
  );
};
