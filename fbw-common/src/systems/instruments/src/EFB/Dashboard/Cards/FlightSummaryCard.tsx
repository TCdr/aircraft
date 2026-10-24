// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { FlightPlanFigures, FlightSummary } from '../logic/flightLog';
import { formatHoursMinutes, formatWeight } from '../logic/dashboardFormat';
import { DashboardCard, Field, FieldRow } from './CardParts';

interface FlightSummaryCardProps {
  summary: FlightSummary;
  plan: FlightPlanFigures;
  className?: string;
}

/** The flight against its plan: an actual value that was not recorded shows as -- */
export const FlightSummaryCard: FC<FlightSummaryCardProps> = ({ summary, plan, className }) => {
  const metric = Units.usingMetric;
  const time = (minutes: number | null) => (minutes === null ? '--' : formatHoursMinutes(minutes));
  const weight = (kg: number | null) => (kg === null ? '--' : formatWeight(kg, metric));
  const planned = (value: string) => t('Dashboard.Summary.Plan', [{ value }]);

  return (
    <DashboardCard title={t('Dashboard.Summary.Title')} section="flight" className={className}>
      <FieldRow>
        <Field
          label={t('Dashboard.Summary.BlockTime')}
          value={time(summary.blockMinutes)}
          detail={planned(time(plan.blockMinutes))}
        />
        <Field
          label={t('Dashboard.Summary.FlightTime')}
          value={time(summary.flightMinutes)}
          detail={planned(time(plan.flightMinutes))}
        />
        <Field
          label={t('Dashboard.Summary.FuelUsed')}
          value={weight(summary.fuelUsedKg)}
          detail={planned(weight(plan.tripFuelKg))}
        />
        <Field
          label={t('Dashboard.Summary.LandingWeight')}
          value={weight(summary.landingWeightKg)}
          detail={planned(weight(plan.landingWeightKg))}
        />
      </FieldRow>
    </DashboardCard>
  );
};
