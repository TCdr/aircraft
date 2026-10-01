// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React from 'react';
import { BoxArrowRight, BriefcaseFill, PersonFill, PlayFill, Shuffle, StopFill } from 'react-bootstrap-icons';
import { AirframeInfo, Units } from '@flybywiresim/fbw-sdk-react';
import { t, TooltipWrapper, SimpleInput } from '@flybywiresim/flypad';
import { M3ActionChip, M3Button, M3_INPUT } from '../../../UtilComponents/Material/Material';

export type AirframeSpec = {
  prefix: string;
  weights: AirframeWeights;
  pax: PaxWeights;
};

export type AirframeWeights = {
  maxGw: number;
  maxZfw: number;
  minZfw: number;
  maxGwCg: number;
  maxZfwCg: number;
};

export type PaxWeights = {
  defaultPaxWeight: number;
  defaultBagWeight: number;
  minPaxWeight: number;
  maxPaxWeight: number;
  minBagWeight: number;
  maxBagWeight: number;
};

interface PayloadValueInputProps {
  min: number;
  max: number;
  value: number;
  onBlur: (v: string) => void;
  unit: string;
  disabled?: boolean;
}

/** A whole number with a thin space between thousands */
export const formatPayload = (value: number): string =>
  Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** A planned value of the load table: a number field with its unit */
export const PayloadValueInput: React.FC<PayloadValueInputProps> = ({ min, max, value, onBlur, unit, disabled }) => (
  <div className="relative w-40">
    <SimpleInput
      disabled={disabled}
      className={`w-full ${M3_INPUT} font-bold`}
      fontSizeClassName="text-lg"
      number
      min={min}
      max={max}
      value={value.toFixed(0)}
      onBlur={onBlur}
    />
    <span className="pointer-events-none absolute right-3 top-0 flex h-full items-center text-xs font-semibold text-m3-muted">
      {unit}
    </span>
  </div>
);

// TODO: To be removed, relocated from Constants
interface CargoStationInfo {
  name: string;
  weight: number;
  simVar: string;
  stationIndex: number;
  progressBarWidth: number;
  position: number;
}

interface CargoBarProps {
  cargoId: number;
  cargo: number[];
  cargoDesired: number[];
  cargoMap: CargoStationInfo[];
  onClickCargo: (cargoStation: number, event: any) => void;
  /** The short name of the hold */
  label: string;
  className?: string;
}

/**
 * A cargo hold: its load over its capacity, and a bar to set the planned load (the mark) by a click. The bar keeps
 * the width of the cabin configuration: the click position is read against it.
 */
export const CargoBar: React.FC<CargoBarProps> = ({
  cargoId,
  cargo,
  cargoDesired,
  cargoMap,
  onClickCargo,
  label,
  className,
}) => {
  const station = cargoMap[cargoId];
  const fraction = (weight: number) => Math.max(0, Math.min(1, weight / station.weight));
  return (
    <div className={`flex shrink-0 flex-col ${className ?? ''}`} style={{ minWidth: `${station.progressBarWidth}px` }}>
      <span className="whitespace-nowrap text-xs font-bold uppercase tracking-widest text-m3-muted">{label}</span>
      <span className="whitespace-nowrap text-xs font-semibold">
        {formatPayload(Units.kilogramToUser(cargo[cargoId]))}
        <span className="text-xs text-m3-muted">{` / ${formatPayload(Units.kilogramToUser(station.weight))}`}</span>
      </span>
      <div
        className="relative mt-1 h-3 cursor-pointer rounded-full bg-m3-tile"
        style={{ width: `${station.progressBarWidth}px` }}
        onClick={(e) => onClickCargo(cargoId, e)}
      >
        <div
          className="pointer-events-none h-3 rounded-full bg-m3-primary"
          style={{ width: `${fraction(cargo[cargoId]) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute h-5 w-1 rounded-full bg-m3-text"
          style={{ top: '-4px', left: `${fraction(cargoDesired[cargoId]) * station.progressBarWidth - 2}px` }}
        />
      </div>
    </div>
  );
};

interface MiscParamsProps {
  disable: boolean;
  minPaxWeight: number;
  maxPaxWeight: number;
  defaultPaxWeight: number;
  minBagWeight: number;
  maxBagWeight: number;
  defaultBagWeight: number;
  paxWeight: number;
  bagWeight: number;
  massUnitForDisplay: string;
  setPaxWeight: (w: number) => void;
  setBagWeight: (w: number) => void;
}

export const MiscParamsInput: React.FC<MiscParamsProps> = ({
  disable,
  minPaxWeight,
  maxPaxWeight,
  defaultPaxWeight,
  minBagWeight,
  maxBagWeight,
  defaultBagWeight,
  paxWeight,
  bagWeight,
  massUnitForDisplay,
  setPaxWeight,
  setBagWeight,
}) => (
  <>
    <TooltipWrapper text={t('Ground.Payload.TT.PerPaxWeight')}>
      <div className="mr-4 flex min-w-0 flex-1 flex-row items-center">
        <PersonFill size={20} className="mr-2 shrink-0 text-m3-muted" />
        <div className="relative min-w-0 flex-1">
          <SimpleInput
            disabled={disable}
            className={`w-full ${M3_INPUT} font-bold`}
            fontSizeClassName="text-base"
            number
            min={minPaxWeight}
            max={maxPaxWeight}
            placeholder={defaultPaxWeight.toString()}
            value={Units.kilogramToUser(paxWeight).toFixed(0)}
            onBlur={(x) => {
              if (!Number.isNaN(parseInt(x)) || parseInt(x) === 0) setPaxWeight(Units.userToKilogram(parseInt(x)));
            }}
          />
          <span className="pointer-events-none absolute right-3 top-0 flex h-full items-center text-xs font-semibold text-m3-muted">
            {massUnitForDisplay}
          </span>
        </div>
      </div>
    </TooltipWrapper>

    <TooltipWrapper text={t('Ground.Payload.TT.PerPaxBagWeight')}>
      <div className="flex min-w-0 flex-1 flex-row items-center">
        <BriefcaseFill size={20} className="mr-2 shrink-0 text-m3-muted" />
        <div className="relative min-w-0 flex-1">
          <SimpleInput
            disabled={disable}
            className={`w-full ${M3_INPUT} font-bold`}
            fontSizeClassName="text-base"
            number
            min={minBagWeight}
            max={maxBagWeight}
            placeholder={defaultBagWeight.toString()}
            value={Units.kilogramToUser(bagWeight).toFixed(0)}
            onBlur={(x) => {
              if (!Number.isNaN(parseInt(x)) || parseInt(x) === 0) setBagWeight(Units.userToKilogram(parseInt(x)));
            }}
          />
          <span className="pointer-events-none absolute right-3 top-0 flex h-full items-center text-xs font-semibold text-m3-muted">
            {massUnitForDisplay}
          </span>
        </div>
      </div>
    </TooltipWrapper>
  </>
);

interface BoardingInputProps {
  boardingStarted: boolean;
  totalPax: number;
  totalCargo: number;
  setBoardingStarted: (boardingStarted: boolean) => void;
  handleDeboarding: () => void;
}

/** Start or stop the boarding (towards the planned load), and deboard everything */
export const BoardingInput: React.FC<BoardingInputProps> = ({
  boardingStarted,
  totalPax,
  totalCargo,
  setBoardingStarted,
  handleDeboarding,
}) => (
  <>
    <M3Button tone={boardingStarted ? 'warn' : 'primary'} onClick={() => setBoardingStarted(!boardingStarted)}>
      {boardingStarted ? <StopFill size={22} /> : <PlayFill size={22} />}
      <span className="text-lg text-current">
        {boardingStarted ? t('Ground.Payload.StopBoarding') : t('Ground.Payload.TT.StartBoarding')}
      </span>
    </M3Button>
    <M3Button
      tone="outline"
      className="mt-2"
      disabled={(totalPax === 0 && totalCargo === 0) || boardingStarted}
      onClick={handleDeboarding}
    >
      <BoxArrowRight size={20} />
      <span className="text-lg text-current">{t('Ground.Payload.TT.StartDeboarding')}</span>
    </M3Button>
  </>
);

interface NumberUnitDisplayProps {
  /**
   * The value to show
   */
  value: number;

  /**
   * The amount of leading zeroes to pad with
   */
  padTo: number;

  /**
   * The unit to show at the end
   */
  unit: string;
}

/** A current value of the load table (padTo is kept for the callers: the value is no longer zero padded) */
export const PayloadValueUnitDisplay: React.FC<NumberUnitDisplayProps> = ({ value, unit }) => (
  <span className="whitespace-nowrap text-base font-semibold">
    {formatPayload(value)}
    <span className="ml-1 text-xs text-m3-muted">{unit}</span>
  </span>
);

export const PayloadPercentUnitDisplay: React.FC<{ value: number }> = ({ value }) => (
  <span className="whitespace-nowrap text-base font-semibold">
    {value.toFixed(2)}
    <span className="ml-1 text-xs text-m3-muted">%</span>
  </span>
);

interface PayloadInputTableProps {
  airframeInfo: AirframeInfo;
  emptyWeight: number;
  massUnitForDisplay: string;
  displayZfw: boolean;
  BoardingInProgress: boolean;
  totalPax: number;
  totalPaxDesired: number;
  maxPax: number;
  totalCargo: number;
  totalCargoDesired: number;
  maxCargo: number;
  zfw: number;
  zfwDesired: number;
  zfwCgMac: number;
  desiredZfwCgMac: number;
  gw: number;
  gwDesired: number;
  gwCgMac: number;
  desiredGwCgMac: number;
  setTargetPax: (targetPax: number) => void;
  setTargetCargo: (targetCargo: number, cargoStation: number) => void;
  processZfw: (zfw: number) => void;
  processGw: (zfw: number) => void;
  setDisplayZfw: (displayZfw: boolean) => void;
}

export const PayloadInputTable: React.FC<PayloadInputTableProps> = ({
  airframeInfo,
  emptyWeight,
  massUnitForDisplay,
  BoardingInProgress,
  displayZfw,
  totalPax,
  totalPaxDesired,
  maxPax,
  totalCargo,
  totalCargoDesired,
  maxCargo,
  zfw,
  zfwDesired,
  zfwCgMac,
  desiredZfwCgMac,
  gw,
  gwDesired,
  gwCgMac,
  desiredGwCgMac,
  setTargetPax,
  setTargetCargo,
  processZfw,
  processGw,
  setDisplayZfw,
}) => {
  const weights = airframeInfo?.designLimits.weights;
  const row = 'flex h-12 flex-row items-center';
  const name = 'min-w-0 grow truncate text-base font-semibold';
  const current = 'w-28 shrink-0 text-right';
  return (
    <div className="flex flex-col">
      <div className="mb-1 flex flex-row items-center">
        <div className="grow" />
        <span className="w-40 shrink-0 text-center text-xs font-bold uppercase tracking-widest text-m3-muted">
          {t('Ground.Payload.Planned')}
        </span>
        <span className={`${current} text-xs font-bold uppercase tracking-widest text-m3-muted`}>
          {t('Ground.Payload.Current')}
        </span>
      </div>

      <div className={row}>
        <span className={name}>{t('Ground.Payload.Passengers')}</span>
        <TooltipWrapper text={`${t('Ground.Payload.TT.MaxPassengers')} ${maxPax}`}>
          <div>
            <PayloadValueInput
              min={0}
              max={maxPax > 0 ? maxPax : 999}
              value={totalPaxDesired}
              onBlur={(x) => {
                if (!Number.isNaN(parseInt(x) || parseInt(x) === 0)) {
                  setTargetPax(parseInt(x));
                  setTargetCargo(parseInt(x), 0);
                }
              }}
              unit="PAX"
              disabled={BoardingInProgress}
            />
          </div>
        </TooltipWrapper>
        <span className={current}>
          <PayloadValueUnitDisplay value={totalPax} padTo={3} unit="PAX" />
        </span>
      </div>

      <div className={row}>
        <span className={name}>{t('Ground.Payload.Cargo')}</span>
        <TooltipWrapper
          text={`${t('Ground.Payload.TT.MaxCargo')} ${Units.kilogramToUser(maxCargo).toFixed(0)} ${massUnitForDisplay}`}
        >
          <div>
            <PayloadValueInput
              min={0}
              max={maxCargo > 0 ? Math.round(Units.kilogramToUser(maxCargo)) : 99999}
              value={Units.kilogramToUser(totalCargoDesired)}
              onBlur={(x) => {
                if (!Number.isNaN(parseInt(x)) || parseInt(x) === 0) {
                  setTargetCargo(0, Units.userToKilogram(parseInt(x)));
                }
              }}
              unit={massUnitForDisplay}
              disabled={BoardingInProgress}
            />
          </div>
        </TooltipWrapper>
        <span className={current}>
          <PayloadValueUnitDisplay value={Units.kilogramToUser(totalCargo)} padTo={5} unit={massUnitForDisplay} />
        </span>
      </div>

      <div className={row}>
        <span className="flex min-w-0 grow flex-row items-center">
          <span className="mr-2 text-base font-semibold">
            {displayZfw ? t('Ground.Payload.ZFW') : t('Ground.Payload.GW')}
          </span>
          {/* the table shows the zero fuel weight or the gross weight */}
          <M3ActionChip onClick={() => setDisplayZfw(!displayZfw)} aria-label="ZFW / GW">
            <span className="flex flex-row items-center text-sm text-current">
              <Shuffle size={14} className="mr-1" />
              {displayZfw ? t('Ground.Payload.GW') : t('Ground.Payload.ZFW')}
            </span>
          </M3ActionChip>
        </span>
        <TooltipWrapper
          text={
            displayZfw
              ? `${t('Ground.Payload.TT.MaxZFW')} ${Units.kilogramToUser(weights?.maxZfw).toFixed(0)} ${massUnitForDisplay}`
              : `${t('Ground.Payload.TT.MaxGW')} ${Units.kilogramToUser(weights?.maxGw).toFixed(0)} ${massUnitForDisplay}`
          }
        >
          <div>
            {displayZfw ? (
              <PayloadValueInput
                min={Math.round(Units.kilogramToUser(emptyWeight))}
                max={Math.round(Units.kilogramToUser(weights?.maxZfw))}
                value={Units.kilogramToUser(zfwDesired)}
                onBlur={(x) => {
                  if (!Number.isNaN(parseInt(x)) || parseInt(x) === 0) processZfw(Units.userToKilogram(parseInt(x)));
                }}
                unit={massUnitForDisplay}
                disabled={BoardingInProgress}
              />
            ) : (
              <PayloadValueInput
                min={Math.round(Units.kilogramToUser(emptyWeight))}
                max={Math.round(Units.kilogramToUser(weights?.maxGw))}
                value={Units.kilogramToUser(gwDesired)}
                onBlur={(x) => {
                  if (!Number.isNaN(parseInt(x)) || parseInt(x) === 0) processGw(Units.userToKilogram(parseInt(x)));
                }}
                unit={massUnitForDisplay}
                disabled={BoardingInProgress}
              />
            )}
          </div>
        </TooltipWrapper>
        <span className={current}>
          <PayloadValueUnitDisplay
            value={displayZfw ? Units.kilogramToUser(zfw) : Units.kilogramToUser(gw)}
            padTo={5}
            unit={massUnitForDisplay}
          />
        </span>
      </div>

      <div className="flex h-9 flex-row items-center">
        <span className={name}>{t(displayZfw ? 'Ground.Payload.ZFWCG' : 'Ground.Payload.GWCG')}</span>
        <TooltipWrapper
          text={
            displayZfw
              ? `${t('Ground.Payload.TT.MaxZFWCG')} ${weights?.maxZfwCg}%`
              : `${t('Ground.Payload.TT.MaxGWCG')} ${weights?.maxGwCg}%`
          }
        >
          <div className="w-40 shrink-0 text-center">
            {/* TODO FIXME: Setting pax/cargo given desired ZFWCG, ZFW, total pax, total cargo */}
            <PayloadPercentUnitDisplay value={displayZfw ? desiredZfwCgMac : desiredGwCgMac} />
          </div>
        </TooltipWrapper>
        <span className={current}>
          <PayloadPercentUnitDisplay value={displayZfw ? zfwCgMac : gwCgMac} />
        </span>
      </div>
    </div>
  );
};
