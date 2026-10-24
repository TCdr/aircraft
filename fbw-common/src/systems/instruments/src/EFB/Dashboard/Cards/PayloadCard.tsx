// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { useAppSelector } from '../../Store/store';
import { DashboardLayout, ServiceChip } from '../logic/dashboardLayout';
import { formatWeight, formatWeightThousands, simbriefWeightKg } from '../logic/dashboardFormat';
import { DashboardCard, Field, FieldRow, ServiceProgress, ServiceStatusChip } from './CardParts';

interface PayloadCardProps {
  layout: DashboardLayout;
  /** The boarding status; shown on the ground only */
  chip: ServiceChip | null;
  paxOnBoard: number;
  paxTarget: number;
  cargoKg: number;
  zfwKg: number;
  grossWeightKg: number;
  zfwCgPercentMac: number;
  className?: string;
}

export const PayloadCard: FC<PayloadCardProps> = ({
  layout,
  chip,
  paxOnBoard,
  paxTarget,
  cargoKg,
  zfwKg,
  grossWeightKg,
  zfwCgPercentMac,
  className,
}) => {
  const { weights, units } = useAppSelector((state) => state.simbrief.data);
  const metric = Units.usingMetric;
  // The in-flight columns are narrow: their fields show tonnes (or thousands of pounds)
  const narrow = layout === 'flight' || layout === 'noOfp';
  const weight = (kg: number) => (narrow ? formatWeightThousands(kg, metric) : formatWeight(kg, metric));

  const cargo = <Field key="cargo" label={t('Dashboard.Payload.Cargo')} value={weight(cargoKg)} />;
  let tiles: JSX.Element[];
  switch (layout) {
    case 'gateOfp':
      tiles = [
        <Field key="pax" label={t('Dashboard.Payload.Pax')} value={`${paxOnBoard} / ${paxTarget}`} />,
        cargo,
        <Field
          key="zfw"
          label={t('Dashboard.Payload.ZfwPlan')}
          value={weight(simbriefWeightKg(weights.estZeroFuelWeight, units))}
        />,
      ];
      break;
    case 'flight':
      tiles = [
        <Field key="pax" label={t('Dashboard.Payload.Pax')} value={String(paxOnBoard)} />,
        cargo,
        <Field key="zfw" label={t('Dashboard.Payload.Zfw')} value={weight(zfwKg)} />,
        <Field key="cg" label={t('Dashboard.Payload.ZfwCgField')} value={`${zfwCgPercentMac.toFixed(1)} %`} />,
      ];
      break;
    case 'arrived':
      tiles = [
        <Field key="pax" label={t('Dashboard.Payload.PaxOnBoard')} value={`${paxOnBoard} / ${paxTarget}`} />,
        cargo,
      ];
      break;
    case 'noOfp':
      tiles = [
        <Field key="pax" label={t('Dashboard.Payload.Pax')} value={String(paxOnBoard)} />,
        cargo,
        <Field key="zfw" label={t('Dashboard.Payload.Zfw')} value={weight(zfwKg)} />,
        <Field key="gw" label={t('Dashboard.Payload.Gw')} value={weight(grossWeightKg)} />,
      ];
      break;
    default:
      tiles = [
        <Field key="pax" label={t('Dashboard.Payload.Pax')} value={String(paxOnBoard)} />,
        cargo,
        <Field key="zfw" label={t('Dashboard.Payload.Zfw')} value={weight(zfwKg)} />,
      ];
  }

  return (
    <DashboardCard
      title={t('Dashboard.Payload.Title')}
      section="payload"
      className={className}
      trailing={chip ? <ServiceStatusChip chip={chip} /> : undefined}
    >
      <FieldRow>{tiles}</FieldRow>
      {chip && <ServiceProgress chip={chip} />}
    </DashboardCard>
  );
};
