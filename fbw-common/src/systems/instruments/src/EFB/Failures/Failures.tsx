// @ts-strict-ignore
// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
import { AtaChapterNumber, AtaChaptersDescription, AtaChaptersTitle, Failure } from '@flybywiresim/fbw-sdk-react';
import { ArrowCounterclockwise, ExclamationTriangle, InfoCircle, Search, X } from 'react-bootstrap-icons';
import { t } from '../Localization/translation';
import { useAppDispatch, useAppSelector } from '../Store/store';
import { SimpleInput } from '../UtilComponents/Form/SimpleInput/SimpleInput';
import { TooltipWrapper } from '../UtilComponents/TooltipWrapper';
import { useFailuresOrchestrator } from '../failures-orchestrator-provider';
import { useToggleFailure } from './useToggleFailure';
import { closeFailureDetail, openFailureDetail, setSearchQuery, setSelection } from '../Store/features/failuresPage';
import { M3_INPUT, M3Button, M3Card, M3Chip } from '../UtilComponents/Material/Material';
import { ScrollableContainer } from '../UtilComponents/ScrollableContainer';
import { activeFailuresLabel, failuresCountLabel } from './activeFailuresLabel';
import { CARD_HEIGHT, FailureDetailView } from './FailureDetailView';
import { FailureRow } from './FailureRow';
import { failureMatchesSearch, FailuresSelection, groupByChapter, resolveSelection } from './failuresView';

interface NavItemProps {
  lead: ReactNode;
  title: string;
  count: number;
  activeCount?: number;
  selected: boolean;
  /** The look of the Active failures entry: red while something is failed */
  failedLook?: boolean;
  onClick: () => void;
}

const NavItem: FC<NavItemProps> = ({ lead, title, count, activeCount, selected, failedLook, onClick }) => {
  let look = selected ? 'bg-m3-primary-container' : 'bg-transparent hover:bg-m3-tile';
  let leadLook = selected ? 'bg-m3-tonal text-m3-on-primary-container' : 'bg-m3-tile text-m3-text';
  let textLook = 'text-m3-text';
  if (failedLook) {
    look = selected ? 'bg-m3-error-container' : 'bg-transparent hover:bg-m3-tile';
    leadLook = 'bg-m3-error-container text-m3-on-error';
    textLook = 'text-m3-on-error';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[52px] w-full shrink-0 flex-row items-center rounded-sm py-2 pl-2 pr-3 text-left ${look}`}
    >
      <span
        className={`mr-3 flex h-9 w-10 shrink-0 items-center justify-center rounded-sm text-base font-bold ${leadLook}`}
      >
        {lead}
      </span>
      <span
        className={`min-w-0 grow break-words text-sm leading-tight ${selected ? 'font-bold' : 'font-semibold'} ${textLook}`}
      >
        {title}
      </span>
      {activeCount > 0 && (
        <span className="ml-2 rounded-sm bg-m3-error-container px-2 py-1 text-xs font-bold leading-none text-m3-on-error">
          {activeCount}
        </span>
      )}
      <span
        className={`ml-2 min-w-[1.75rem] text-right text-sm font-semibold ${
          failedLook ? 'text-m3-on-error' : 'text-m3-muted'
        }`}
      >
        {count}
      </span>
    </button>
  );
};

interface FailureGridProps {
  failures: Failure[];
}

const FailureGrid: FC<FailureGridProps> = ({ failures }) => {
  const dispatch = useAppDispatch();
  const { activeFailures } = useFailuresOrchestrator();
  const toggleFailure = useToggleFailure();
  const { searchQuery } = useAppSelector((state) => state.failuresPage);

  return (
    <div className="grid grid-cols-2">
      {failures.map((failure, index) => {
        const isActive = activeFailures.has(failure.identifier);
        return (
          <FailureRow
            key={failure.identifier}
            name={failure.name}
            isActive={isActive}
            searchQuery={searchQuery}
            onToggle={() => toggleFailure(failure.identifier)}
            onOpen={() => dispatch(openFailureDetail(failure.identifier))}
            className={`${index % 2 !== 0 ? 'ml-2' : ''} ${index >= 2 ? 'mt-2' : ''}`}
          />
        );
      })}
    </div>
  );
};

/** The failures of several chapters, each under its chapter name */
const ChapterGroups: FC<FailureGridProps> = ({ failures }) => (
  <>
    {groupByChapter(failures).map(({ ata, failures: chapterFailures }, index) => (
      <div key={ata} className={index > 0 ? 'mt-4' : ''}>
        <span className="mb-2 ml-0.5 block text-xs font-bold uppercase tracking-widest text-m3-muted">
          {`ATA ${ata} · ${AtaChaptersTitle[ata]}`}
        </span>
        <FailureGrid failures={chapterFailures} />
      </div>
    ))}
  </>
);

const EmptyPane: FC<{ text: string }> = ({ text }) => (
  <div className="flex h-96 items-center justify-center">
    <span className="text-lg text-m3-muted">{text}</span>
  </div>
);

/** Height of the chapter header of the right card, in rem; the card height is shared with the detail view */
const PANE_HEADER_HEIGHT = 7;

export const Failures = () => {
  const dispatch = useAppDispatch();
  const { allFailures, activeFailures, deactivate } = useFailuresOrchestrator();
  const { searchQuery, selection: storedSelection, detailFailure } = useAppSelector((state) => state.failuresPage);

  const searching = searchQuery !== '';
  const shownFailures = allFailures.filter((failure) =>
    failureMatchesSearch(failure, searchQuery, AtaChaptersTitle[failure.ata]),
  );
  const shownChapters = groupByChapter(shownFailures);
  const selection = resolveSelection(
    storedSelection,
    searching,
    shownChapters.map((chapter) => chapter.ata),
    activeFailures.size,
  );
  const select = (newSelection: FailuresSelection) => dispatch(setSelection(newSelection));

  const activeCountOf = (ata: AtaChapterNumber) =>
    allFailures.filter((failure) => failure.ata === ata && activeFailures.has(failure.identifier)).length;

  const detailShown = allFailures.find((failure) => failure.identifier === detailFailure);

  let paneTitle: string;
  let paneCount: string;
  let paneAction: ReactNode = null;
  let paneDescription: string | undefined;
  let paneBody: ReactNode;
  if (selection === 'active') {
    const failed = allFailures.filter((failure) => activeFailures.has(failure.identifier));
    paneTitle = t('Failures.ActiveFailuresTitle');
    paneCount = `${failed.length} ${t('Failures.Active')}`;
    paneAction = failed.length > 0 && (
      <M3Button
        tone="danger"
        className="!h-9 !rounded-sm !text-sm"
        onClick={() => activeFailures.forEach((identifier) => deactivate(identifier))}
      >
        <ArrowCounterclockwise size={16} />
        <span className="text-sm font-bold text-current">{t('Failures.RestoreAll')}</span>
      </M3Button>
    );
    paneBody =
      failed.length > 0 ? <ChapterGroups failures={failed} /> : <EmptyPane text={t('Failures.NoActiveFailures')} />;
  } else if (selection === 'results') {
    paneTitle = `${t('Failures.ResultsFor')} “${searchQuery}”`;
    paneCount = `${shownFailures.length}`;
    paneBody =
      shownFailures.length > 0 ? (
        <ChapterGroups failures={shownFailures} />
      ) : (
        <EmptyPane text={t('Failures.NoItemsFound')} />
      );
  } else {
    const chapterFailures = shownChapters.find((chapter) => chapter.ata === selection).failures;
    paneTitle = `ATA ${selection} · ${AtaChaptersTitle[selection]}`;
    paneCount = failuresCountLabel(chapterFailures.length, t);
    paneDescription = searching ? undefined : AtaChaptersDescription[selection];
    paneBody = <FailureGrid failures={chapterFailures} />;
  }

  return (
    <>
      <div className="mb-4 flex flex-row items-center">
        <h1 className="font-bold">{t('Failures.Title')}</h1>
        <TooltipWrapper text={t('Failures.FullSimulationOfTheFailuresBelowIsntYetGuaranteed')}>
          <div className="ml-3 flex h-9 w-9 items-center justify-center rounded-sm text-m3-on-warn">
            <InfoCircle size={20} />
          </div>
        </TooltipWrapper>
        <div className="grow" />
        {activeFailures.size > 0 && (
          <M3Chip tone="warn" className="mr-3" icon={<ExclamationTriangle size={16} />}>
            {activeFailuresLabel(activeFailures.size, t)}
          </M3Chip>
        )}
        <div className="relative w-[340px]">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 z-10 flex items-center text-m3-muted">
            <Search size={18} />
          </span>
          <SimpleInput
            placeholder={t('Failures.Search')}
            className={`w-full !pl-10 !pr-10 uppercase ${M3_INPUT}`}
            fontSizeClassName="text-base"
            value={searchQuery}
            onChange={(value) => dispatch(setSearchQuery(value.toUpperCase()))}
          />
          {searching && (
            <button
              type="button"
              aria-label={t('Failures.ClearSearch')}
              onClick={() => dispatch(setSearchQuery(''))}
              className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-sm bg-m3-tile text-m3-text"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="flex h-content-section-reduced flex-row overflow-hidden">
        <M3Card className="mr-4 w-[340px] shrink-0">
          <ScrollableContainer height={CARD_HEIGHT} className="p-2" innerClassName="flex flex-col">
            {searching ? (
              <NavItem
                lead={<Search size={18} />}
                title={t('Failures.AllResults')}
                count={shownFailures.length}
                selected={selection === 'results'}
                onClick={() => select('results')}
              />
            ) : (
              <NavItem
                lead={<ExclamationTriangle size={18} />}
                title={t('Failures.ActiveFailuresTitle')}
                count={activeFailures.size}
                selected={selection === 'active'}
                failedLook={activeFailures.size > 0}
                onClick={() => select('active')}
              />
            )}
            <div className="mx-2 my-1.5 h-px shrink-0 bg-m3-outline" />
            {shownChapters.map(({ ata, failures }) => (
              <NavItem
                key={ata}
                lead={ata}
                title={AtaChaptersTitle[ata]}
                count={failures.length}
                activeCount={activeCountOf(ata)}
                selected={selection === ata}
                onClick={() => select(ata)}
              />
            ))}
          </ScrollableContainer>
        </M3Card>

        <M3Card low className="min-w-0 grow">
          {detailShown ? (
            <FailureDetailView failure={detailShown} onBack={() => dispatch(closeFailureDetail())} />
          ) : (
            <>
              <div
                className="flex shrink-0 flex-col overflow-hidden px-5 pb-3.5 pt-4"
                style={{ height: `${PANE_HEADER_HEIGHT}rem` }}
              >
                <div className="flex min-h-[2.25rem] flex-row items-center">
                  <span className="text-2xl font-bold text-m3-text">{paneTitle}</span>
                  <span className="ml-3 rounded-sm bg-m3-tile px-2 py-1 text-xs font-bold leading-none text-m3-muted">
                    {paneCount}
                  </span>
                  <div className="grow" />
                  {paneAction}
                </div>
                {paneDescription && <p className="mt-1 text-sm leading-snug text-m3-muted">{paneDescription}</p>}
              </div>
              <ScrollableContainer
                key={String(selection)}
                height={CARD_HEIGHT - PANE_HEADER_HEIGHT}
                className="px-5"
                innerClassName="pb-5"
              >
                {paneBody}
              </ScrollableContainer>
            </>
          )}
        </M3Card>
      </div>
    </>
  );
};
