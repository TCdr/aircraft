// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode, useContext, useState } from 'react';
import {
  AlertProcedure,
  AtaChaptersTitle,
  EcamTextSegment,
  Failure,
  LogbookWriteResult,
  logbookProcedures,
  orderByEwd,
  plainEcamText,
  SeenEffect,
  parseEcamText,
  resolveFailureDetail,
} from '@flybywiresim/fbw-sdk-react';
import { ArrowCounterclockwise, ArrowLeft, Check, ExclamationTriangle } from 'react-bootstrap-icons';
import { AircraftContext } from '../AircraftContext';
import { t } from '../Localization/translation';
import { useAppSelector } from '../Store/store';
import { useFailuresOrchestrator } from '../failures-orchestrator-provider';
import { useToggleFailure } from './useToggleFailure';
import { M3Button, M3Chip } from '../UtilComponents/Material/Material';
import { ScrollableContainer } from '../UtilComponents/ScrollableContainer';
import { EcamText } from './EcamText';

const NO_ALERTS: readonly string[] = [];

/** Stands in for the source's hook when there is none, so every render calls the same hooks */
const useNoProcedures = (): AlertProcedure[] => [];

/** Height of the two cards (the tailwind content-section-reduced height) and of the detail header, in rem */
export const CARD_HEIGHT = 54;
const DETAIL_HEADER_HEIGHT = 7;

const Section: FC<{ title: string }> = ({ title, children }) => (
  <div className="mt-5 first:mt-0">
    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-m3-muted">{title}</span>
    {children}
  </div>
);

const BulletList: FC<{ items: readonly string[]; muted?: boolean }> = ({ items, muted }) => (
  <>
    {items.map((item, index) => (
      // bullets may repeat and never reorder
      // eslint-disable-next-line react/no-array-index-key
      <div key={`${index}-${item}`} className="mb-1 flex flex-row">
        <span className={`mr-2 text-sm ${muted ? 'text-m3-muted' : 'text-m3-text'}`}>•</span>
        <span className={`min-w-0 text-sm leading-snug ${muted ? 'text-m3-muted' : 'text-m3-text'}`}>{item}</span>
      </div>
    ))}
  </>
);

const EffectList: FC<{ effects: readonly SeenEffect[] }> = ({ effects }) => (
  <>
    {effects.map((effect) => (
      <div key={`${effect.where}-${effect.text}`} className="mb-1 flex flex-row">
        <span className="mr-2 text-sm text-m3-text">•</span>
        <span className="min-w-0 text-sm leading-snug text-m3-text">
          {effect.where && <span className="mr-2 text-xs font-bold text-m3-muted">{effect.where}</span>}
          {effect.text}
        </span>
      </div>
    ))}
  </>
);

const segmentsText = (segments: readonly EcamTextSegment[]): string => segments.map((segment) => segment.text).join('');

/** The procedure as plain text lines, the way the EWD shows it, for the technical logbook */
function procedureLines(procedures: readonly AlertProcedure[], literalProcedure: readonly string[]): string[] {
  const lines: string[] = [];
  for (const procedure of procedures) {
    lines.push(segmentsText(procedure.title));
    for (const line of procedure.lines) {
      lines.push(segmentsText(line.segments));
    }
  }
  return lines.concat(literalProcedure.map(plainEcamText));
}

const ProcedureBlock: FC<{ procedure: AlertProcedure }> = ({ procedure }) => {
  const presented = procedure.ewdOrder !== undefined;

  return (
    <div className="mb-3 rounded-sm bg-m3-card px-4 py-3">
      <div className="mb-1">
        <EcamText segments={procedure.title} greyed={!presented} />
      </div>
      {!presented && (
        <span className="mb-1 block text-xs text-m3-muted">
          {t(procedure.mayBeBelowEwd ? 'Failures.Details.MaybeBelowEwd' : 'Failures.Details.NotOnEwd')}
        </span>
      )}
      {procedure.lines.map((line, index) => (
        <div
          // lines of one alert have no ids and never reorder
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          className="flex flex-row"
          style={{ paddingLeft: `${line.level * 1.25}rem` }}
        >
          {/* the tick is text only: the EWD checks the line, not the flyPad */}
          <span className="mr-2 w-4 shrink-0 text-base text-utility-green">
            {presented && line.state === 'done' ? <Check size={16} /> : null}
          </span>
          <span className="min-w-0">
            <EcamText
              segments={line.segments}
              greyed={!presented || line.state === 'reference' || line.state === 'inactive'}
            />
          </span>
        </div>
      ))}
      {presented && procedure.continuesOnEwd && (
        <span className="mt-1 block text-xs text-m3-muted">{t('Failures.Details.MoreOnEwd')}</span>
      )}
    </div>
  );
};

const LiteralLines: FC<{ lines: readonly string[] }> = ({ lines }) => (
  <div className="mb-3 rounded-sm bg-m3-card px-4 py-3">
    {lines.map((line) => (
      <div key={line}>
        <EcamText segments={parseEcamText(line)} greyed />
      </div>
    ))}
  </div>
);

interface FailureDetailViewProps {
  failure: Failure;
  onBack: () => void;
}

export const FailureDetailView: FC<FailureDetailViewProps> = ({ failure, onBack }) => {
  const { failureDetails } = useContext(AircraftContext);
  const writeLogbookEntry = failureDetails?.writeLogbookEntry;
  const { activeFailures } = useFailuresOrchestrator();
  const toggleFailure = useToggleFailure();
  const aircraftName = useAppSelector((state) => state.config.airframeInfo?.name);

  const detail = failureDetails ? resolveFailureDetail(failureDetails.table, failure.identifier) : undefined;
  const useAlertProcedures = failureDetails ? failureDetails.useAlertProcedures : useNoProcedures;
  const procedures = orderByEwd(useAlertProcedures(detail ? detail.alertIds : NO_ALERTS));

  const isActive = activeFailures.has(failure.identifier);
  const [logbookResult, setLogbookResult] = useState<{ identifier: number; result: LogbookWriteResult } | null>(null);

  let body: ReactNode;
  if (detail) {
    const literalProcedure = detail.literalProcedure;
    const hasLiteralProcedure = !!literalProcedure && literalProcedure.length > 0;
    body = (
      <>
        <Section title={t('Failures.Details.WhatItIs')}>
          <p className="text-sm leading-snug text-m3-text">{detail.whatItIs}</p>
        </Section>
        <Section title={t('Failures.Details.Impact')}>
          <BulletList items={detail.impact} />
        </Section>
        <Section title={t('Failures.Details.WhatYouWillSee')}>
          {procedures.length > 0 && (
            <div className="mb-2">
              {procedures.map((procedure) => (
                <div key={procedure.alertId}>
                  <EcamText segments={procedure.title} greyed={procedure.ewdOrder === undefined} />
                </div>
              ))}
            </div>
          )}
          <EffectList effects={detail.effects} />
          {detail.notSimulated && detail.notSimulated.length > 0 && (
            <div className="mt-2">
              <BulletList
                items={detail.notSimulated.map((note) => `${t('Failures.Details.NotSimulated')}: ${note}`)}
                muted
              />
            </div>
          )}
        </Section>
        <Section title={t('Failures.Details.Procedure')}>
          {procedures.map((procedure) => (
            <ProcedureBlock key={procedure.alertId} procedure={procedure} />
          ))}
          {hasLiteralProcedure && <LiteralLines lines={literalProcedure} />}
          {procedures.length === 0 && !hasLiteralProcedure && (
            <span className="text-sm text-m3-muted">{t('Failures.Details.NoProcedure')}</span>
          )}
        </Section>
        <Section title={t('Failures.Details.ClearingIt')}>
          <p className="text-sm leading-snug text-m3-text">{detail.clearing}</p>
          <p className="mt-2 text-sm leading-snug text-m3-text">
            {`${t(detail.logbook.required ? 'Failures.Details.LogbookRequired' : 'Failures.Details.LogbookNoEntry')} — ${detail.logbook.reason}`}
          </p>
          {writeLogbookEntry && (
            <div className="mt-3 flex flex-row items-center">
              <M3Button
                tone="outline"
                className="!h-9 !rounded-sm !text-sm"
                onClick={() =>
                  setLogbookResult({
                    identifier: failure.identifier,
                    result: writeLogbookEntry(
                      { name: failure.name, ata: failure.ata },
                      detail,
                      procedureLines(logbookProcedures(procedures), literalProcedure ?? []),
                    ),
                  })
                }
              >
                <span className="text-sm font-bold text-current">{t('Failures.Details.WriteLogbook')}</span>
              </M3Button>
              {logbookResult && logbookResult.identifier === failure.identifier && (
                <span className="ml-3 text-sm text-m3-muted">
                  {logbookResult.result.written ? t('Failures.Details.LogbookAdded') : logbookResult.result.reason}
                </span>
              )}
            </div>
          )}
        </Section>
      </>
    );
  } else {
    body = (
      <div className="flex h-96 items-center justify-center">
        <span className="text-lg text-m3-muted">{t('Failures.Details.NotWrittenYet')}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="flex shrink-0 flex-row items-center overflow-hidden px-5 pb-3.5 pt-4"
        style={{ height: `${DETAIL_HEADER_HEIGHT}rem` }}
      >
        <button
          type="button"
          aria-label={t('Failures.Details.Back')}
          onClick={onBack}
          className="mr-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-m3-tile text-m3-text hover:brightness-110"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex min-w-0 grow flex-col">
          <span className="line-clamp-2 text-xl font-bold leading-tight text-m3-text">{failure.name}</span>
          <span className="mt-1 text-sm text-m3-muted">
            {`ATA ${failure.ata} · ${AtaChaptersTitle[failure.ata]}${aircraftName ? ` · ${aircraftName}` : ''}`}
          </span>
        </div>
        <M3Chip
          tone={isActive ? 'warn' : 'idle'}
          icon={isActive ? <ExclamationTriangle size={16} /> : undefined}
          className="ml-4"
        >
          {isActive ? t('Failures.Details.Failed') : t('Failures.Details.Normal')}
        </M3Chip>
        <M3Button
          tone={isActive ? 'outline' : 'danger'}
          className="ml-3 !h-9 !rounded-sm !text-sm"
          onClick={() => toggleFailure(failure.identifier)}
        >
          {isActive && <ArrowCounterclockwise size={16} />}
          <span className="text-sm font-bold text-current">
            {isActive ? t('Failures.Details.Restore') : t('Failures.Details.Fail')}
          </span>
        </M3Button>
      </div>
      <ScrollableContainer
        key={failure.identifier}
        height={CARD_HEIGHT - DETAIL_HEADER_HEIGHT}
        className="px-5"
        innerClassName="pb-5"
      >
        {body}
      </ScrollableContainer>
    </>
  );
};
