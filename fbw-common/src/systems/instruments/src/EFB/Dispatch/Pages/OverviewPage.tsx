// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import React, { FC } from 'react';
import { useSimVar, Units, AirframeType } from '@flybywiresim/fbw-sdk-react';
import { IconPlane } from '@tabler/icons';
import { Box, LightningFill, PeopleFill, Rulers, Speedometer2 } from 'react-bootstrap-icons';
import { t, A320NoseOutline, A380NoseOutline, useAppSelector, getMaxPax } from '@flybywiresim/flypad';
import { M3Card, M3Chip } from '../../UtilComponents/Material/Material';

interface InformationEntryProps {
  title: string;
  info: string;
}

/** A figure of the aircraft: its icon, its name, its value */
const InformationEntry: FC<InformationEntryProps> = ({ children, title, info }) => (
  <div className="flex h-14 shrink-0 flex-row items-center px-4">
    <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-m3-tile text-m3-on-primary-container">
      {children}
    </span>
    <span className="grow truncate text-sm text-m3-muted">{title}</span>
    <span className="ml-3 whitespace-nowrap text-base font-bold text-m3-text">{info}</span>
  </div>
);

const SectionTitle: FC = ({ children }) => (
  <span className="px-4 pb-1 pt-4 text-xs font-bold uppercase tracking-widest text-m3-muted">{children}</span>
);

export const OverviewPage = () => {
  let [airline] = useSimVar('ATC AIRLINE', 'String', 1_000);

  airline ||= 'FlyByWire Simulations';
  const [actualGrossWeight] = useSimVar('TOTAL WEIGHT', 'kilograms', 5_000);

  const getConvertedInfo = (metricValue: number, unitType: 'weight' | 'volume' | 'distance') => {
    const numberWithCommas = (x: number) => x.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    switch (unitType) {
      case 'weight':
        return `${numberWithCommas(Units.kilogramToUser(metricValue))} [${Units.userWeightSuffixEis2}]`;
      case 'volume':
        return `${numberWithCommas(Units.litreToUser(metricValue))} [${Units.userVolumeSuffixEis2}]`;
      case 'distance':
        return `${numberWithCommas(metricValue)} [nm]`;
      default:
        throw new Error('Invalid unit type');
    }
  };

  const airframeInfo = useAppSelector((state) => state.config.airframeInfo);

  return (
    <div className="flex h-content-section-reduced flex-row overflow-hidden text-m3-text">
      {/* the aircraft */}
      <M3Card low className="relative mr-4 h-full min-w-0 flex-1">
        {/* TODO: Make this SVG configurable */}
        {airframeInfo.variant === AirframeType.A380_842 ? (
          <A380NoseOutline className="absolute inset-0 h-full w-full text-m3-muted" />
        ) : (
          <A320NoseOutline className="flip-horizontal absolute inset-0 h-full w-full text-m3-muted" />
        )}
        <div className="absolute right-6 top-5 flex flex-col items-end">
          <span className="text-3xl font-bold text-m3-text">{airframeInfo.name}</span>
          <span className="text-sm text-m3-muted">{airline}</span>
        </div>
        <div className="absolute bottom-5 left-6 flex flex-row space-x-2">
          <M3Chip
            tone="idle"
            icon={<IconPlane className="fill-current" size={18} stroke={1.5} strokeLinejoin="miter" />}
          >
            {`${airframeInfo.variant} [${airframeInfo.icao}]`}
          </M3Chip>
          <M3Chip tone="idle" icon={<LightningFill size={16} />}>
            {airframeInfo.engines}
          </M3Chip>
        </div>
      </M3Card>

      {/* its figures */}
      <div className="flex h-full w-[30rem] shrink-0 flex-col">
        <M3Card className="mb-4 shrink-0 pb-2">
          <SectionTitle>{t('Dispatch.Overview.Weights')}</SectionTitle>
          <InformationEntry
            title={t('Dispatch.Overview.ActualGW')}
            info={getConvertedInfo(actualGrossWeight, 'weight')}
          >
            <Box size={18} />
          </InformationEntry>
          <InformationEntry
            title={t('Dispatch.Overview.MTOW')}
            info={getConvertedInfo(airframeInfo.designLimits.weights.maxGw, 'weight')}
          >
            <Box size={18} />
          </InformationEntry>
          <InformationEntry
            title={t('Dispatch.Overview.MZFW')}
            info={getConvertedInfo(airframeInfo.designLimits.weights.maxZfw, 'weight')}
          >
            <Box size={18} />
          </InformationEntry>
        </M3Card>

        <M3Card className="mb-4 shrink-0 pb-2">
          <SectionTitle>{t('Dispatch.Overview.Capacity')}</SectionTitle>
          <InformationEntry
            title={t('Dispatch.Overview.MaximumFuelCapacity')}
            info={getConvertedInfo(airframeInfo.designLimits.weights.maxFuel, 'volume')}
          >
            <Box size={18} />
          </InformationEntry>
          <InformationEntry title={t('Dispatch.Overview.MaximumPassengers')} info={`${getMaxPax()} passengers`}>
            <PeopleFill size={18} />
          </InformationEntry>
          <InformationEntry
            title={t('Dispatch.Overview.MaximumCargo')}
            info={getConvertedInfo(airframeInfo.designLimits.weights.maxCargo, 'weight')}
          >
            <Box size={18} />
          </InformationEntry>
        </M3Card>

        <M3Card className="min-h-0 flex-1 pb-2">
          <SectionTitle>{t('Dispatch.Overview.Performance')}</SectionTitle>
          <InformationEntry
            title={t('Dispatch.Overview.Range')}
            info={getConvertedInfo(airframeInfo.designLimits.endurance.range, 'distance')}
          >
            <Rulers size={18} />
          </InformationEntry>
          <InformationEntry title={t('Dispatch.Overview.MMO')} info={airframeInfo.designLimits.endurance.mmo}>
            <Speedometer2 size={18} />
          </InformationEntry>
        </M3Card>
      </div>
    </div>
  );
};
