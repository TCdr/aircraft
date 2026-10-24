// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { useModals } from '@flybywiresim/flypad';
import { t } from '../../Localization/translation';
import { useAppSelector } from '../../Store/store';
import { formatHoursMinutes, formatWeightThousands, ofpRouteText, simbriefWeightKg } from '../logic/dashboardFormat';
import { CardButton, DashboardCard, Field, FieldLabel, FieldRow } from './CardParts';
import { RouteDialog } from './FlightStrip';

interface FlightPlanCardProps {
  /** Average wind component along the route: positive for a tailwind, negative for a headwind; null when unknown */
  avgWindComponentKt: number | null;
  className?: string;
}

/** The OFP figures of the trip and its route; a figure the OFP does not have is left out */
export const FlightPlanCard: FC<FlightPlanCardProps> = ({ avgWindComponentKt, className }) => {
  const { showModal } = useModals();
  const data = useAppSelector((state) => state.simbrief.data);
  const tripFuelKg = simbriefWeightKg(data.fuels.enrouteBurn, data.units);
  const route = ofpRouteText(data);

  let wind: string | null = null;
  if (avgWindComponentKt !== null && Number.isFinite(avgWindComponentKt)) {
    const speed = String(Math.round(Math.abs(avgWindComponentKt)));
    wind =
      avgWindComponentKt < 0
        ? t('Dashboard.FlightPlan.Headwind', [{ wind: speed }])
        : t('Dashboard.FlightPlan.Tailwind', [{ wind: speed }]);
  }

  return (
    <DashboardCard
      title={t('Dashboard.FlightPlan.Title')}
      section="flightPlan"
      className={className}
      footer={
        <CardButton tone="outline" disabled={!route} onClick={() => showModal(<RouteDialog route={route} />)}>
          {t('Dashboard.FlightPlan.ShowRoute')}
        </CardButton>
      }
    >
      <FieldRow>
        {tripFuelKg > 0 && (
          <Field label={t('Dashboard.FlightPlan.Trip')} value={formatWeightThousands(tripFuelKg, Units.usingMetric)} />
        )}
        {data.tripTime > 0 && (
          <Field label={t('Dashboard.FlightPlan.FlightTime')} value={formatHoursMinutes(data.tripTime / 60)} />
        )}
        {wind !== null && <Field label={t('Dashboard.FlightPlan.AvgWind')} value={wind} />}
      </FieldRow>
      {data.route && (
        <>
          <FieldLabel className="mt-2 shrink-0">{t('Dashboard.Strip.Route')}</FieldLabel>
          <p className="min-h-0 overflow-hidden font-mono text-sm leading-snug text-m3-text">{route}</p>
        </>
      )}
    </DashboardCard>
  );
};
