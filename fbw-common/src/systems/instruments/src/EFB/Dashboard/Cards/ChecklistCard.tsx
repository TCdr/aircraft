// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useLayoutEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { ArrowRightSquareFill, CheckSquareFill, DashSquare, Square, XSquare } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { useAppDispatch, useAppSelector } from '../../Store/store';
import { setSelectedChecklistIndex } from '../../Store/features/checklists';
import { ChecklistRow, checklistMarks, checklistRatingPhase, checklistRows } from '../logic/dashboardLayout';
import { checklistPreview, checklistProgress } from '../logic/checklistPreview';
import { CardButton, DashboardCard, FieldLabel, HeaderNote } from './CardParts';

const RowIcon: FC<{ row: ChecklistRow }> = ({ row }) => {
  if (row.mark === 'done') {
    return <CheckSquareFill size={14} className="shrink-0 text-m3-on-primary-container" />;
  }
  if (row.mark === 'next') {
    return <ArrowRightSquareFill size={14} className="shrink-0 text-m3-on-warn" />;
  }
  if (row.mark === 'missed') {
    return <XSquare size={14} className="shrink-0 text-m3-on-error" />;
  }
  if (row.mark === 'optional') {
    return <DashSquare size={14} className="shrink-0 text-m3-muted" />;
  }
  return <Square size={14} className="shrink-0 text-m3-muted" />;
};

/** The h-8 of a row */
const ROW_HEIGHT_PX = 32;

const MARK_KEYS: Record<ChecklistRow['mark'], string | null> = {
  done: null,
  missed: 'Dashboard.Checklist.Missed',
  optional: 'Dashboard.Checklist.NotNeeded',
  next: 'Dashboard.Checklist.Next',
  later: null,
};

const ROW_TEXT: Record<ChecklistRow['mark'], string> = {
  done: 'font-semibold text-m3-text',
  missed: 'text-m3-on-error',
  optional: 'text-m3-muted',
  next: 'font-extrabold text-m3-on-warn',
  later: 'text-m3-muted',
};

interface ChecklistCardProps {
  maxRows: number;
  /** Shows the items of the next checklist beside the list; the in-flight column is wide enough for it */
  withPreview?: boolean;
  /** The flight has arrived: the checklists are rated as at the end of the flight */
  arrived?: boolean;
  className?: string;
}

/** The checklists of the flight around the next one, the next one's items, and the button that opens it */
export const ChecklistCard: FC<ChecklistCardProps> = ({ maxRows, withPreview, arrived, className }) => {
  const dispatch = useAppDispatch();
  const history = useHistory();
  const { checklists, aircraftChecklists } = useAppSelector((state) => state.trackingChecklists);
  const [fwcPhase] = useSimVar('L:A32NX_FWC_FLIGHT_PHASE', 'Enum', 1_000);
  const checklistPhases = aircraftChecklists.map((checklist) => checklist.flightphase ?? 0);
  const marks = checklistMarks(checklists, checklistPhases, checklistRatingPhase(fwcPhase, checklistPhases, !!arrived));
  const nextIndex = marks.indexOf('next');
  // The card height follows the page and the cards above it: the rows that fit are counted after layout, so no row is
  // cut in half
  const listRef = useRef<HTMLDivElement>(null);
  const [fittingRows, setFittingRows] = useState(maxRows);
  useLayoutEffect(() => {
    const height = listRef.current ? listRef.current.clientHeight : 0;
    const fitting = Math.max(1, Math.floor(height / ROW_HEIGHT_PX));
    if (height > 0 && fitting !== fittingRows) {
      setFittingRows(fitting);
    }
  });
  const rowCount = Math.min(maxRows, fittingRows);
  const rows = checklistRows(checklists, marks, rowCount);
  const progress = checklistProgress(checklists);
  const nextName = nextIndex >= 0 && checklists[nextIndex] ? checklists[nextIndex].name : null;
  // The label line of the preview takes one row
  const previewItems =
    withPreview && nextIndex >= 0 ? checklistPreview(aircraftChecklists[nextIndex], rowCount - 1) : [];

  const open = (index: number) => {
    dispatch(setSelectedChecklistIndex(index));
    history.push('/checklists');
  };

  return (
    <DashboardCard
      title={t('Dashboard.Checklist.Title')}
      section="checklists"
      className={className}
      trailing={
        progress.total > 0 ? (
          <HeaderNote>
            {t('Dashboard.Checklist.DoneCount', [{ done: String(progress.done) }, { total: String(progress.total) }])}
          </HeaderNote>
        ) : undefined
      }
      footer={
        <CardButton tone="primary" onClick={() => open(nextIndex >= 0 ? nextIndex : 0)}>
          {nextName !== null
            ? t('Dashboard.Checklist.OpenNext', [{ name: nextName }])
            : t('Dashboard.Checklist.OpenAll')}
        </CardButton>
      }
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div ref={listRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {rows.length === 0 && <span className="text-sm text-m3-muted">{t('Dashboard.Checklist.None')}</span>}
          {rows.map((row) => {
            const markKey = MARK_KEYS[row.mark];
            return (
              <div key={row.index} className="flex h-8 shrink-0 flex-row items-center">
                <RowIcon row={row} />
                <span className={`ml-3 min-w-0 truncate text-sm ${ROW_TEXT[row.mark]}`}>
                  {markKey ? `${row.name} · ${t(markKey)}` : row.name}
                </span>
              </div>
            );
          })}
        </div>
        {withPreview && nextName !== null && previewItems.length > 0 && (
          <div className="ml-3 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-m3-outline pl-3">
            <div className="flex h-8 shrink-0 flex-row items-center">
              <FieldLabel>{t('Dashboard.Checklist.NextPreview', [{ name: nextName }])}</FieldLabel>
            </div>
            {previewItems.map((line, index) => (
              <div key={index} className="flex h-8 shrink-0 flex-row items-center border-b border-m3-outline">
                <span className="min-w-0 shrink truncate text-xs font-extrabold text-m3-text">{line.item}</span>
                <div className="mx-2 h-0 min-w-[1rem] flex-1 border-b border-dotted border-m3-muted" />
                <span className="min-w-0 max-w-[60%] shrink-0 truncate text-xs font-bold text-m3-muted">
                  {line.result}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardCard>
  );
};
