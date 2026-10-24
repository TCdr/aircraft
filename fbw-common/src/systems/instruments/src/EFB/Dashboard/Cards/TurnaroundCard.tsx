// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { t } from '../../Localization/translation';
import { M3Tone } from '../../UtilComponents/Material/Material';
import { TurnaroundRow, TurnaroundStep, TurnaroundStepState } from '../logic/turnaround';
import { formatUtcClock } from '../logic/dashboardFormat';
import { DashboardCard, InfoLine, StatusBox } from './CardParts';

const STEP_KEYS: Record<TurnaroundStep, string> = {
  refuel: 'Dashboard.Turnaround.Refuel',
  cargo: 'Dashboard.Turnaround.Cargo',
  boarding: 'Dashboard.Turnaround.Boarding',
  doorsClosed: 'Dashboard.Turnaround.DoorsClosed',
  pushback: 'Dashboard.Turnaround.Pushback',
};

const STATE_KEYS: Record<TurnaroundStepState, string> = {
  notStarted: 'Dashboard.Service.NotStarted',
  running: 'Dashboard.Turnaround.InProgress',
  complete: 'Dashboard.Service.Complete',
};

const STATE_TONES: Record<TurnaroundStepState, M3Tone> = {
  notStarted: 'idle',
  running: 'busy',
  complete: 'active',
};

/** The steps to the off-blocks time; a running step shows when it should end, amber when that is after the STD */
export const TurnaroundCard: FC<{ rows: TurnaroundRow[]; className?: string }> = ({ rows, className }) => (
  <DashboardCard title={t('Dashboard.Turnaround.Title')} section="turnaround" className={className}>
    {rows.map((row) => (
      <InfoLine
        key={row.step}
        className="!h-8"
        name={t(STEP_KEYS[row.step])}
        value={
          <>
            <StatusBox tone={STATE_TONES[row.state]}>{t(STATE_KEYS[row.state])}</StatusBox>
            <span
              className={`ml-3 w-20 text-right text-sm font-semibold ${row.late ? 'text-m3-on-warn' : 'text-m3-muted'}`}
            >
              {row.endMs !== null ? formatUtcClock(row.endMs) : '--:--'}
            </span>
          </>
        }
      />
    ))}
  </DashboardCard>
);
