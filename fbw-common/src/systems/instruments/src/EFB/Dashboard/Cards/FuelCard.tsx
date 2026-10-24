// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { useAppSelector } from '../../Store/store';
import { DashboardLayout, ServiceChip } from '../logic/dashboardLayout';
import {
  formatSignedWeight,
  formatWeight,
  formatWeightThousands,
  formatWeightValue,
  simbriefWeightKg,
  simbriefWeightSumKg,
  weightUnitLabel,
} from '../logic/dashboardFormat';
import { DashboardCard, Field, FieldRow, HeaderChip, ServiceProgress, ServiceStatusChip } from './CardParts';

interface FuelCardProps {
  layout: DashboardLayout;
  /** The refuel status; shown on the ground only */
  chip: ServiceChip | null;
  fobKg: number;
  fuelFlowKgPerHour: number;
  /** Fuel on board against the navlog plan now, kg; null before takeoff or without a navlog fuel plan */
  versusPlanKg: number | null;
  className?: string;
}

export const FuelCard: FC<FuelCardProps> = ({ layout, chip, fobKg, fuelFlowKgPerHour, versusPlanKg, className }) => {
  const { fuels, units, altBurn, arrivingAirport } = useAppSelector((state) => state.simbrief.data);
  const metric = Units.usingMetric;
  // The in-flight columns are narrow: their fields show tonnes (or thousands of pounds)
  const narrow = layout === 'flight' || layout === 'noOfp';
  const weight = (kg: number) => (narrow ? formatWeightThousands(kg, metric) : formatWeight(kg, metric));
  const planned = (value: number) => simbriefWeightKg(value, units);

  let tiles: JSX.Element[];
  switch (layout) {
    case 'gateOfp':
      tiles = [
        <Field key="planned" label={t('Dashboard.Fuel.PlannedBlock')} value={weight(planned(fuels.planRamp))} />,
        <Field key="loaded" label={t('Dashboard.Fuel.Loaded')} value={weight(fobKg)} />,
        <Field
          key="trip"
          label={t('Dashboard.Fuel.TripAltn')}
          value={`${formatWeightValue(planned(fuels.enrouteBurn), metric)} · ${weight(planned(altBurn ?? 0))}`}
        />,
      ];
      break;
    case 'flight':
      tiles = [
        <Field key="fob" label={t('Dashboard.Fuel.Fob')} value={weight(fobKg)} />,
        <Field
          key="landing"
          label={t('Dashboard.Fuel.Efob', [{ icao: arrivingAirport }])}
          value={weight(planned(fuels.planLanding))}
          detail={t('Dashboard.Fuel.Planned')}
        />,
        <Field
          key="reserve"
          label={t('Dashboard.Fuel.AltnFinal')}
          value={weight(simbriefWeightSumKg([altBurn, fuels.reserve], units))}
          detail={t('Dashboard.Fuel.Planned')}
        />,
      ];
      break;
    case 'arrived':
      tiles = [
        <Field key="fob" label={t('Dashboard.Fuel.Fob')} value={weight(fobKg)} />,
        <Field key="landing" label={t('Dashboard.Fuel.PlannedLanding')} value={weight(planned(fuels.planLanding))} />,
      ];
      break;
    default:
      tiles = [
        <Field key="fob" label={t('Dashboard.Fuel.Fob')} value={weight(fobKg)} />,
        <Field
          key="flow"
          label={t('Dashboard.Fuel.FuelFlow')}
          value={`${formatWeightValue(fuelFlowKgPerHour, metric)} ${weightUnitLabel(metric)}/h`}
        />,
      ];
  }

  return (
    <DashboardCard
      title={t('Dashboard.Fuel.Title')}
      section="fuel"
      className={className}
      trailing={
        chip ? (
          <ServiceStatusChip chip={chip} />
        ) : layout === 'flight' && versusPlanKg !== null ? (
          <HeaderChip tone="idle">
            {t('Dashboard.Fuel.VersusPlan', [{ delta: formatSignedWeight(versusPlanKg, metric) }])}
          </HeaderChip>
        ) : undefined
      }
    >
      <FieldRow>{tiles}</FieldRow>
      {chip && <ServiceProgress chip={chip} />}
    </DashboardCard>
  );
};
