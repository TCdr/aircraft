// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
import Slider from 'rc-slider';
import { CloudArrowDown, PlayFill, StopFill } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { SimpleInput } from '../../../UtilComponents/Form/SimpleInput/SimpleInput';
import {
  M3ActionChip,
  M3Button,
  M3Card,
  M3Page,
  M3Progress,
  M3Segmented,
  M3Tone,
  M3_INPUT,
  M3_STATUS_TONES,
} from '../../../UtilComponents/Material/Material';

/** The refuel duration setting (the persistent property REFUEL_RATE_SETTING) */
export enum RefuelRateSetting {
  REAL = '0',
  FAST = '1',
  INSTANT = '2',
}

/** A tank on the Fuel page, in the display unit */
export interface FuelTank {
  name: string;
  quantity: number;
  capacity: number;
}

/** A whole number with a thin space between thousands */
export const formatFuel = (value: number): string =>
  Math.round(Math.max(value, 0))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const eyebrow = 'text-xs font-bold uppercase tracking-widest text-m3-muted';

interface FuelHeadlineProps {
  quantity: number;
  capacity: number;
  unit: string;
  className?: string;
}

/** The fuel on board, over the drawing */
export const FuelHeadline: FC<FuelHeadlineProps> = ({ quantity, capacity, unit, className }) => (
  <div className={`flex flex-col ${className ?? ''}`}>
    <span className={eyebrow}>{t('Ground.Fuel.OnBoard')}</span>
    <span className="text-3xl font-bold">
      {formatFuel(quantity)}
      <span className="ml-2 text-sm font-semibold text-m3-muted">
        {`/ ${formatFuel(capacity)} ${unit} · ${Math.round((Math.max(quantity, 0) / capacity) * 100)} %`}
      </span>
    </span>
  </div>
);

interface FuelTankTableProps {
  title: string;
  unit: string;
  tanks: FuelTank[];
  className?: string;
}

/** The quantities of a group of tanks: a name, a bar, the quantity */
export const FuelTankTable: FC<FuelTankTableProps> = ({ title, unit, tanks, className }) => (
  <div className={`flex w-[264px] flex-col rounded-xl bg-m3-card px-4 py-3 ${className ?? ''}`}>
    <div className="mb-1 flex flex-row items-center">
      <span className={eyebrow}>{title}</span>
      <div className="grow" />
      <span className="text-xs text-m3-muted">{unit}</span>
    </div>
    {tanks.map((tank) => (
      <div key={tank.name} className="flex h-7 flex-row items-center">
        <span className={`w-24 shrink-0 truncate text-sm font-semibold ${tank.quantity > 0 ? '' : 'text-m3-muted'}`}>
          {tank.name}
        </span>
        <M3Progress value={tank.quantity / tank.capacity} className="mx-3 w-auto flex-1" />
        <span className={`w-14 shrink-0 text-right text-sm font-semibold ${tank.quantity > 0 ? '' : 'text-m3-muted'}`}>
          {formatFuel(tank.quantity)}
        </span>
      </div>
    ))}
  </div>
);

/** The quantity of one tank as a tile: the tanks of a small aircraft, in a row as on the aircraft */
export const FuelTankTile: FC<{ tank: FuelTank; unit: string; className?: string }> = ({ tank, unit, className }) => (
  <div className={`flex min-w-0 flex-1 flex-col rounded-xl bg-m3-card px-4 py-3 ${className ?? ''}`}>
    <span className="truncate text-xs font-bold uppercase tracking-wide text-m3-muted">{tank.name}</span>
    <span className={`mt-1 text-xl font-bold ${tank.quantity > 0 ? '' : 'text-m3-muted'}`}>
      {formatFuel(tank.quantity)}
      <span className="ml-1 text-xs font-semibold text-m3-muted">{`/ ${formatFuel(tank.capacity)} ${unit}`}</span>
    </span>
    <M3Progress value={tank.quantity / tank.capacity} className="mt-2" />
  </div>
);

export interface FuelRailProps {
  status: { text: string; tone: M3Tone };
  /** The estimated duration, in minutes ('0' when instant or done) */
  etaMinutes: string;
  unit: string;
  /** The target fuel field */
  target: number | string;
  targetMax: number;
  onTargetChange?: (value: string) => void;
  onTargetBlur?: (value: string) => void;
  /** The target as a percentage of the capacity, and the fuel on board on the same scale */
  sliderPercent: number;
  onBoardPercent: number;
  onSlider: (percent: number) => void;
  /** Refuelling (or defuelling) runs: the target is locked */
  started: boolean;
  /** The flyPad may start now (on the ground, engines off, or the instant duration) */
  allowed: boolean;
  /** The flyPad starts the refuel itself (GSX does when its fuel sync is on) */
  showStartStop: boolean;
  onStartStop: () => void;
  /** Target minus on board, in the display unit */
  delta: number;
  /** The SimBrief block fuel in the display unit, null without a flight plan */
  simbriefBlock: number | null;
  /** The target differs from the SimBrief block */
  showSimbrief: boolean;
  onSimbrief: () => void;
  onBoard: number;
  rate: string;
  setRate: (rate: RefuelRateSetting) => void;
  /** Engines running or airborne: only the instant duration */
  onlyInstant: boolean;
}

/** The refuel controls: the target, start and stop, the duration setting, the plan */
export const FuelRail: FC<FuelRailProps> = ({
  status,
  etaMinutes,
  unit,
  target,
  targetMax,
  onTargetChange,
  onTargetBlur,
  sliderPercent,
  onBoardPercent,
  onSlider,
  started,
  allowed,
  showStartStop,
  onStartStop,
  delta,
  simbriefBlock,
  showSimbrief,
  onSimbrief,
  onBoard,
  rate,
  setRate,
  onlyInstant,
}) => {
  const deltaText = `${delta >= 0 ? '+' : '−'}${formatFuel(Math.abs(delta))} ${unit}`;
  const eta = etaMinutes.trim();
  const scale = 'text-xs text-m3-muted';
  const planName = 'text-sm text-m3-muted';
  const planValue = 'text-sm font-semibold';
  return (
    <>
      <M3Card className="mb-4 shrink-0 px-4 py-4">
        <div className="flex flex-row items-center">
          <div className="mr-3 flex min-w-0 grow flex-col">
            <span className="text-base font-bold">{t('Ground.Fuel.Refuel')}</span>
            <span className={`text-xs leading-tight ${M3_STATUS_TONES[status.tone]}`}>{status.text}</span>
          </div>
          {eta !== '0' && (
            <span className="shrink-0 whitespace-nowrap rounded-lg bg-m3-tile px-2 py-1 text-xs font-bold text-m3-muted">
              {`${eta} ${t('Ground.Fuel.Minutes')}`}
            </span>
          )}
        </div>

        <span className={`mt-4 ${eyebrow}`}>{t('Ground.Fuel.Target')}</span>
        <div className={`relative mt-2 ${started ? 'opacity-50' : ''}`}>
          <SimpleInput
            className={`w-full ${M3_INPUT} !py-3 font-bold`}
            fontSizeClassName="text-2xl"
            number
            min={0}
            max={Math.round(targetMax)}
            placeholder={Math.round(targetMax).toString()}
            value={target}
            onChange={onTargetChange}
            onBlur={onTargetBlur}
            disabled={started}
          />
          <span className="pointer-events-none absolute right-4 top-0 flex h-full items-center text-sm font-semibold text-m3-muted">
            {unit}
          </span>
        </div>

        <div className={`relative mx-2 mt-4 ${started ? 'opacity-50' : ''}`}>
          <Slider disabled={started} value={sliderPercent} onChange={onSlider} />
          {/* the fuel on board, on the scale of the slider */}
          <span
            className="pointer-events-none absolute top-0 h-4 w-0.5 bg-m3-text"
            style={{ left: `${Math.max(0, Math.min(100, onBoardPercent))}%` }}
          />
        </div>
        <div className="mt-2 flex flex-row justify-between">
          <span className={scale}>0</span>
          <span className={scale}>{`${t('Ground.Fuel.OnBoard')} ${formatFuel(onBoard)}`}</span>
          <span className={scale}>{`${formatFuel(targetMax)} ${unit}`}</span>
        </div>

        {showSimbrief && !started && (
          <M3ActionChip primary className="mt-4 !h-10 w-full !rounded-xl" onClick={onSimbrief}>
            <span className="flex flex-row items-center justify-center text-sm text-current">
              <CloudArrowDown size={18} className="mr-2" />
              {t('Ground.Fuel.TT.FillBlockFuelFromSimBrief')}
            </span>
          </M3ActionChip>
        )}

        {showStartStop && (
          <M3Button
            className="mt-4"
            tone={started ? 'warn' : 'primary'}
            disabled={!started && !allowed}
            onClick={onStartStop}
          >
            {started ? <StopFill size={22} /> : <PlayFill size={22} />}
            <span className="text-lg text-current">
              {started
                ? t('Ground.Fuel.Stop')
                : `${t(delta < 0 ? 'Ground.Fuel.StartDefuel' : 'Ground.Fuel.Start')} · ${deltaText}`}
            </span>
          </M3Button>
        )}
      </M3Card>

      <M3Card className="mb-4 shrink-0 px-4 py-4">
        <span className={`mb-3 ${eyebrow}`}>{t('Ground.Fuel.RefuelTime')}</span>
        <M3Segmented
          options={[
            {
              label: t('Settings.Instant'),
              selected: rate === RefuelRateSetting.INSTANT,
              onClick: () => setRate(RefuelRateSetting.INSTANT),
            },
            {
              label: t('Settings.Fast'),
              selected: rate === RefuelRateSetting.FAST,
              disabled: onlyInstant,
              onClick: () => setRate(RefuelRateSetting.FAST),
            },
            {
              label: t('Settings.Real'),
              selected: rate === RefuelRateSetting.REAL,
              disabled: onlyInstant,
              onClick: () => setRate(RefuelRateSetting.REAL),
            },
          ]}
        />
        {onlyInstant && (
          <span className="mt-2 text-xs leading-tight text-m3-muted">
            {t('Ground.Fuel.TT.AircraftMustBeColdAndDarkToChangeRefuelTimes')}
          </span>
        )}
      </M3Card>

      <M3Card className="min-h-0 flex-1 px-4 py-4">
        <span className={`mb-2 ${eyebrow}`}>{t('Ground.Fuel.Plan')}</span>
        {simbriefBlock !== null && (
          <div className="flex h-7 flex-row items-center justify-between">
            <span className={planName}>{t('Ground.Fuel.SimbriefBlock')}</span>
            <span className={planValue}>{`${formatFuel(simbriefBlock)} ${unit}`}</span>
          </div>
        )}
        <div className="flex h-7 flex-row items-center justify-between">
          <span className={planName}>{t('Ground.Fuel.Target')}</span>
          <span className={planValue}>{`${formatFuel(onBoard + delta)} ${unit}`}</span>
        </div>
        <div className="flex h-7 flex-row items-center justify-between">
          <span className={planName}>{t('Ground.Fuel.OnBoard')}</span>
          <span className={planValue}>{`${formatFuel(onBoard)} ${unit}`}</span>
        </div>
        <div className="mt-2 flex h-9 flex-row items-center justify-between border-t border-m3-tile pt-2">
          <span className={planName}>{t(delta < 0 ? 'Ground.Fuel.ToDefuel' : 'Ground.Fuel.ToLoad')}</span>
          <span className={`text-sm font-bold ${M3_STATUS_TONES[started ? 'busy' : 'active']}`}>{deltaText}</span>
        </div>
      </M3Card>
    </>
  );
};

interface FuelLayoutProps {
  /** The status chips over the page */
  chips: ReactNode;
  /** The refuel controls on the right */
  rail: ReactNode;
  className?: string;
}

/** The Fuel page: the aircraft with its tanks on a wide card, the refuel controls on a rail at the right */
export const FuelLayout: FC<FuelLayoutProps> = ({ chips, rail, className, children }) => (
  <M3Page chips={chips}>
    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
      <M3Card low className={`relative mr-4 h-full min-w-0 flex-1 ${className ?? ''}`}>
        {children}
      </M3Card>
      <div className="flex h-full w-[360px] shrink-0 flex-col">{rail}</div>
    </div>
  </M3Page>
);
