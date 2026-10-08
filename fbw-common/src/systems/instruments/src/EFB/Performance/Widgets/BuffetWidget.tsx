// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode, useContext, useState } from 'react';
import { Units, useArinc429Var, usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { Check2, ExclamationCircle } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { AircraftContext } from '../../AircraftContext';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3Banner, M3Card, M3Segmented, M3_INPUT } from '../../UtilComponents/Material/Material';
import { BuffetEnvelopeData, BuffetInputs, BuffetResult, buffetAlert, evaluateBuffet } from '../Data/buffet';
import { BuffetSource, buffetBanner, isBuffetTurn, liveBuffetInputs } from '../Data/buffetLive';
import {
  BuffetWeightUnit,
  buffetWeightUnitText,
  roundShownWeight,
  shownWeightToTonnes,
  tonnesToShownWeight,
} from '../Data/buffetUnits';
import { BuffetChart, BuffetChartLine } from './BuffetChart';
import { PERF_INPUT, PerfResult, PerfResultRow, PerfRow, PerfTitle, PerfValue } from './PerformanceKit';

/** The page refresh: "Read every second" */
const LIVE_PERIOD_MS = 1_000;

/** t() with named values: the flyPad placeholders are $name, one record per value */
const tv = (key: string, values: Record<string, string>) =>
  t(
    key,
    Object.keys(values).map((name) => ({ [name]: values[name] })),
  );

const formatMach = (mach: number) =>
  `.${Math.round(mach * 1000)
    .toString()
    .padStart(3, '0')}`;
const formatFl = (feet: number) => `FL${Math.round(feet / 100)}`;
const formatG = (g: number) => g.toFixed(2);
const formatSigned = (g: number) => `${g >= 0 ? '+' : ''}${g.toFixed(2)}`;
/** 37000 -> "37 000" */
const formatFeet = (feet: number) =>
  Math.round(feet)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type Mode = 'LIVE' | 'WHAT_IF';
type Tone = 'normal' | 'caution' | 'warning';

/** The what-if entries; undefined until entered or copied from the aircraft */
interface WhatIfEntries {
  /** Tonnes (shown in the flyPad weight unit) */
  weight?: number;
  cg?: number;
  altitude?: number;
  mach?: number;
  bank?: number;
}

/** A source tag next to a live value, or the A/C button of a what-if entry */
const SourceTag: FC<{ text: string }> = ({ text }) => (
  <span className="w-[74px] shrink-0 text-right">
    <span className="rounded-full bg-m3-primary-container px-2 py-0.5 text-xs font-bold text-m3-on-primary-container">
      {text}
    </span>
  </span>
);

const AircraftButton: FC<{ onClick: () => void }> = ({ onClick }) => (
  <span className="flex w-[74px] shrink-0 flex-row justify-end">
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-m3-tile px-2 py-0.5 text-xs font-bold text-m3-muted hover:text-m3-text"
    >
      {t('Performance.Buffet.Aircraft')}
    </button>
  </span>
);

/** A live value in the look of an input (not editable) */
const LiveValue: FC<{ text: string; unit: string }> = ({ text, unit }) => (
  <div className={`flex h-10 w-40 flex-row items-center px-3 ${M3_INPUT}`}>
    <span className="grow text-base font-bold text-m3-text">{text}</span>
    <span className="text-xs font-semibold text-m3-muted">{unit}</span>
  </div>
);

/** A line of the chart filter: 1.0 g, 1.3 g, 1.4 g */
const FilterChip: FC<{ selected: boolean; onClick: () => void }> = ({ selected, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`ml-2 flex h-9 shrink-0 flex-row items-center rounded-[10px] px-3.5 text-sm font-semibold ${
      selected
        ? 'bg-m3-primary-container text-m3-on-primary-container'
        : 'border border-m3-outline bg-transparent text-m3-text'
    }`}
  >
    {selected && <Check2 size={16} className="mr-1.5" />}
    <span className="text-sm font-semibold text-current">{children}</span>
  </button>
);

/** A legend item: a line sample (or the aircraft symbol) and its name */
const LegendItem: FC<{ colour?: string; dash?: string; point?: boolean; text: string }> = ({
  colour,
  dash,
  point,
  text,
}) => (
  <span className="mr-5 mt-1.5 flex flex-row items-center">
    {point ? (
      <svg width="16" height="16" className="mr-2">
        <circle cx="8" cy="8" r="5.5" strokeWidth={2.5} style={{ fill: 'var(--m3-card)', stroke: 'var(--m3-text)' }} />
      </svg>
    ) : (
      <svg width="26" height="10" className="mr-2">
        <line x1="1" x2="25" y1="5" y2="5" strokeWidth={3} strokeDasharray={dash} style={{ stroke: colour }} />
      </svg>
    )}
    <span className="whitespace-nowrap text-sm font-semibold text-m3-text">{text}</span>
  </span>
);

const toneValue = (tone: Tone) => ({ caution: tone === 'caution', warning: tone === 'warning' });
const toneOf = (alert: BuffetResult['alert']): Tone =>
  alert === 'warning' ? 'warning' : alert === 'caution' ? 'caution' : 'normal';

/** The big result of the panel: the buffet margin (level or in the turn) */
const MarginTile: FC<{ name: string; value: string; note: string; tone: Tone }> = ({ name, value, note, tone }) => {
  let colour = 'text-m3-on-primary-container';
  if (tone === 'warning') {
    colour = 'text-m3-on-error';
  } else if (tone === 'caution') {
    colour = 'text-m3-on-warn';
  }
  return (
    <div className="flex shrink-0 flex-col rounded-xl border border-m3-tile bg-m3-card px-3.5 py-3">
      <PerfTitle>{name}</PerfTitle>
      <span className={`whitespace-nowrap text-4xl font-bold ${colour}`}>
        {value}
        <span className="ml-1.5 text-sm font-semibold text-m3-muted">g</span>
      </span>
      <span className="text-xs font-semibold text-m3-muted">{note}</span>
    </div>
  );
};

/**
 * A tile name in the capitals of the eyebrow style, with the load factor unit g kept lowercase ("1.3 g CEILING"): g
 * in capitals would read as G, another unit
 */
const tileName = (name: string): ReactNode =>
  name.split(/(\bg\b)/).map((part, index) =>
    part === 'g' ? (
      // eslint-disable-next-line react/no-array-index-key
      <span key={index} className="text-xs font-bold normal-case text-current">
        g
      </span>
    ) : (
      part
    ),
  );

const Tile: FC<{ name: string; text: string; unit?: string; tone?: Tone }> = ({ name, text, unit, tone }) => (
  <PerfResult name={tileName(name)} className="!bg-m3-tile">
    <PerfValue text={text} unit={unit} {...toneValue(tone ?? 'normal')} />
  </PerfResult>
);

/**
 * Performance > Buffet: the buffet onset envelope ("coffin corner") of the A320 from the FCOM LIM-13 BUFFET ONSET
 * chart, live (ADR/IR, FMS gross weight, weight and balance CG) or for entered values (what if), with REC MAX of the
 * FMS. Shown only for an aircraft with buffet data (AircraftContext performanceCalculators.buffetEnvelope).
 */
export const BuffetWidget = () => {
  const data = useContext(AircraftContext).performanceCalculators.buffetEnvelope;
  return data !== null ? <BuffetEnvelope data={data} /> : null;
};

/** The page for an aircraft's buffet data */
const BuffetEnvelope: FC<{ data: BuffetEnvelopeData }> = ({ data }) => {
  const [mode, setMode] = useState<Mode>('LIVE');
  const [whatIf, setWhatIf] = useState<WhatIfEntries>({});
  /** The lines of the chart: 1.0 g and 1.3 g shown, 1.4 g (QRH turbulence margin) off by default */
  const [shownLines, setShownLines] = useState<Record<string, boolean>>({ '1.0': true, '1.3': true, '1.4': false });
  /** The flyPad weight unit, as on the other Performance pages: t or klb */
  const [weightUnitSetting] = usePersistentProperty('EFB_PREFERRED_WEIGHT_UNIT', Units.usingMetric ? 'kg' : 'lb');
  const weightUnit: BuffetWeightUnit = weightUnitSetting === 'lb' ? 'lb' : 'kg';
  const weightUnitText = buffetWeightUnitText(weightUnit);

  const [fmsGrossWeight] = useSimVar('L:A32NX_FM_GROSS_WEIGHT', 'number', LIVE_PERIOD_MS);
  const [airframeGrossWeight] = useSimVar('L:A32NX_AIRFRAME_GW', 'number', LIVE_PERIOD_MS);
  const [cg] = useSimVar('L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC', 'number', LIVE_PERIOD_MS);
  const adrAltitude = useArinc429Var('L:A32NX_ADIRS_ADR_1_ALTITUDE', LIVE_PERIOD_MS);
  const adrMach = useArinc429Var('L:A32NX_ADIRS_ADR_1_MACH', LIVE_PERIOD_MS);
  const irRoll = useArinc429Var('L:A32NX_ADIRS_IR_1_ROLL', LIVE_PERIOD_MS);
  const [simPressureAltitude] = useSimVar('PRESSURE ALTITUDE', 'feet', LIVE_PERIOD_MS);
  const [simMach] = useSimVar('AIRSPEED MACH', 'mach', LIVE_PERIOD_MS);
  const [simBank] = useSimVar('PLANE BANK DEGREES', 'degrees', LIVE_PERIOD_MS);
  /** REC MAX published by the FMS (A32NX_FMCMainDisplay), 0 when not available */
  const [recMaxLVar] = useSimVar('L:A32NX_FM_REC_MAX_FL', 'number', LIVE_PERIOD_MS);
  /** REC MAX is the FMS value for the aircraft: shown in Live only (not for the what-if weight) */
  const recMaxFl = mode === 'LIVE' && recMaxLVar > 0 ? recMaxLVar : null;

  const live = liveBuffetInputs({
    fmsGrossWeight,
    airframeGrossWeight,
    cg,
    adrAltitude: { value: adrAltitude.value, normal: adrAltitude.isNormalOperation() },
    simPressureAltitude,
    adrMach: { value: adrMach.value, normal: adrMach.isNormalOperation() },
    simMach,
    irRoll: { value: irRoll.value, normal: irRoll.isNormalOperation() },
    simBank,
  });

  /** Copies the live values into the empty what-if entries */
  const enterWhatIf = () => {
    setMode('WHAT_IF');
    setWhatIf((entries) => ({
      weight: entries.weight ?? shownWeightToTonnes(roundShownWeight(live.weightTonnes, weightUnit), weightUnit),
      cg: entries.cg ?? Math.round(live.cg * 10) / 10,
      altitude: entries.altitude ?? Math.round(live.pressureAltitude / 100) * 100,
      mach: entries.mach ?? Math.round(live.mach * 1000) / 1000,
      bank: entries.bank ?? Math.round(live.bank),
    }));
  };

  const inputs: BuffetInputs =
    mode === 'LIVE'
      ? live
      : {
          weightTonnes: whatIf.weight ?? 0,
          cg: whatIf.cg ?? 25,
          pressureAltitude: whatIf.altitude ?? 0,
          mach: whatIf.mach ?? 0,
          bank: whatIf.bank ?? 0,
        };
  const result = evaluateBuffet(data, inputs);
  const banner = buffetBanner(inputs, result);
  const turn = isBuffetTurn(inputs.bank);
  const bankText = Math.round(inputs.bank).toString();

  const parse = (value: string): number | undefined => {
    const n = parseFloat(value);
    return Number.isNaN(n) ? undefined : n;
  };

  // ---------------------------------------------------------------------------------------------- banner

  let bannerNode: React.ReactNode = null;
  if (banner === 'noWeight' || banner === 'outsideChart') {
    bannerNode = (
      <M3Banner tone="idle" icon={<ExclamationCircle size={18} />}>
        {banner === 'noWeight'
          ? t('Performance.Buffet.BannerNoWeight')
          : tv('Performance.Buffet.BannerOutsideChart', { mach: formatMach(inputs.mach) })}
      </M3Banner>
    );
  } else if (banner !== 'none' && result !== null) {
    const margin = formatG(result.levelMargin);
    let text = '';
    if (banner === 'turn') {
      text = tv('Performance.Buffet.BannerTurn', {
        bank: bankText,
        maxBank: Math.floor(result.maxBank).toString(),
        fl: Math.round(inputs.pressureAltitude / 100).toString(),
        mach: formatMach(inputs.mach),
      });
      if (buffetAlert(result.levelMargin) === 'warning') {
        text = `${text} ${tv('Performance.Buffet.BannerBelowWarning', { margin })}`;
      }
    } else {
      text = tv(
        banner === 'belowWarning' ? 'Performance.Buffet.BannerBelowWarning' : 'Performance.Buffet.BannerBelowCaution',
        { margin },
      );
    }
    bannerNode = (
      <M3Banner tone={banner === 'belowCaution' ? 'busy' : 'warn'} icon={<ExclamationCircle size={18} />}>
        {text}
      </M3Banner>
    );
  }

  // ---------------------------------------------------------------------------------------------- inputs

  const liveRow = (label: string, text: string, unit: string, source: BuffetSource) => (
    <PerfRow label={label}>
      <div className="flex flex-row items-center">
        <LiveValue text={text} unit={unit} />
        <SourceTag text={source} />
      </div>
    </PerfRow>
  );

  const whatIfRow = (
    label: string,
    key: keyof WhatIfEntries,
    unit: string,
    precision: number,
    min: number,
    max: number,
    fromAircraft?: number,
  ) => {
    // the weight is kept in tonnes and shown in the flyPad weight unit; the other entries as they are
    const isWeight = key === 'weight';
    const toShown = (value: number) => (isWeight ? roundShownWeight(value, weightUnit) : Math.round(value * 10) / 10);
    const fromShown = (value: number) => (isWeight ? shownWeightToTonnes(value, weightUnit) : value);
    const entry = whatIf[key];
    return (
      <PerfRow label={label}>
        <div className="flex flex-row items-center">
          <div className="relative w-40">
            <SimpleInput
              className={`w-full ${PERF_INPUT}`}
              fontSizeClassName="text-base"
              value={entry !== undefined && isWeight ? roundShownWeight(entry, weightUnit) : entry}
              placeholder={unit}
              min={min}
              max={max}
              decimalPrecision={precision}
              onChange={(value) => {
                const shown = parse(value);
                setWhatIf((entries) => ({ ...entries, [key]: shown !== undefined ? fromShown(shown) : undefined }));
              }}
              number
            />
            {/* the unit inside the field, as on the live values */}
            {entry !== undefined && (
              <span className="pointer-events-none absolute right-3 top-0 flex h-full items-center text-xs font-semibold text-m3-muted">
                {unit}
              </span>
            )}
          </div>
          {fromAircraft !== undefined ? (
            <AircraftButton
              onClick={() => setWhatIf((entries) => ({ ...entries, [key]: fromShown(toShown(fromAircraft)) }))}
            />
          ) : (
            <span className="w-[74px] shrink-0" />
          )}
        </div>
      </PerfRow>
    );
  };

  const inputsCard = (
    <M3Card className="shrink-0 px-4 py-3">
      <div className="flex h-6 flex-row items-center">
        <PerfTitle>{t('Performance.Buffet.Inputs')}</PerfTitle>
        <div className="grow" />
        <span className="text-xs font-semibold text-m3-muted">
          {mode === 'LIVE' ? t('Performance.Buffet.ReadEverySecond') : t('Performance.Buffet.AcFills')}
        </span>
      </div>
      <div className="mt-1 flex flex-col space-y-1">
        {mode === 'LIVE' ? (
          <>
            {liveRow(
              t('Performance.Buffet.GrossWeight'),
              live.weightTonnes > 0 ? tonnesToShownWeight(live.weightTonnes, weightUnit).toFixed(1) : '—',
              weightUnitText,
              live.sources.weight,
            )}
            {liveRow(t('Performance.Buffet.Cg'), live.cg > 0 ? live.cg.toFixed(1) : '—', '% MAC', live.sources.cg)}
            {liveRow(
              t('Performance.Buffet.Altitude'),
              formatFeet(live.pressureAltitude),
              'ft STD',
              live.sources.altitude,
            )}
            {liveRow(t('Performance.Buffet.Mach'), formatMach(live.mach), 'M', live.sources.mach)}
            {liveRow(t('Performance.Buffet.Bank'), Math.round(live.bank).toString(), '°', live.sources.bank)}
          </>
        ) : (
          <>
            {whatIfRow(
              t('Performance.Buffet.GrossWeight'),
              'weight',
              weightUnitText,
              1,
              Math.floor(tonnesToShownWeight(35, weightUnit)),
              Math.ceil(tonnesToShownWeight(90, weightUnit)),
              live.weightTonnes,
            )}
            {whatIfRow(t('Performance.Buffet.Cg'), 'cg', '% MAC', 1, 10, 45, live.cg)}
            {whatIfRow(t('Performance.Buffet.Altitude'), 'altitude', 'ft STD', 0, 0, 45_000)}
            {whatIfRow(t('Performance.Buffet.Mach'), 'mach', 'M', 3, 0, 0.9)}
            {whatIfRow(t('Performance.Buffet.Bank'), 'bank', '°', 0, 0, 67)}
          </>
        )}
      </div>
    </M3Card>
  );

  // ---------------------------------------------------------------------------------------------- results

  let results: React.ReactNode = <span className="mt-2 text-lg text-m3-muted">—</span>;
  if (result !== null) {
    // the level margin alone (amber under 0.3 g, red under 0.2 g); the turn has its own tone
    const levelTone = toneOf(buffetAlert(result.levelMargin));
    const range13 =
      result.range13 === null
        ? null
        : `${result.range13.low !== null ? formatMach(result.range13.low) : '< .500'} – ${
            result.range13.high !== null ? formatMach(result.range13.high) : 'MMO'
          }`;
    const rangeTile = (
      <Tile
        name={t('Performance.Buffet.MachRange13')}
        text={range13 ?? t('Performance.Buffet.None')}
        unit={
          range13 === null
            ? tv('Performance.Buffet.AtLevel', { fl: Math.round(inputs.pressureAltitude / 100).toString() })
            : ''
        }
        tone={range13 === null ? 'caution' : 'normal'}
      />
    );
    const ceiling13Tile = (
      <Tile
        name={t('Performance.Buffet.Ceiling13')}
        text={result.ceiling13 !== null ? formatFl(result.ceiling13) : '—'}
        unit={`M ${formatMach(inputs.mach)}`}
      />
    );
    const recMaxTile =
      mode === 'LIVE' ? (
        <Tile
          name={t('Performance.Buffet.RecMax')}
          text={recMaxFl !== null ? `FL${recMaxFl}` : '—'}
          unit={t('Performance.Buffet.Fms')}
        />
      ) : null;
    const maxBankTile = (
      <Tile
        name={t('Performance.Buffet.MaxBank')}
        text={`${Math.floor(result.maxBank)}°`}
        unit={t('Performance.Buffet.NoBuffet')}
        tone={turn && result.turnMargin < 0 ? 'warning' : levelTone}
      />
    );
    if (turn) {
      const turnTone: Tone = result.turnMargin < 0 ? 'warning' : levelTone;
      results = (
        <>
          <MarginTile
            name={t('Performance.Buffet.MarginInTurn')}
            value={formatSigned(result.turnMargin)}
            note={tv('Performance.Buffet.TurnNote', {
              turn: formatG(result.turnLoadFactor),
              n: formatG(result.buffetLoadFactor),
            })}
            tone={turnTone}
          />
          <PerfResultRow className="mt-2">
            {maxBankTile}
            <Tile
              name={t('Performance.Buffet.LevelMargin')}
              text={formatSigned(result.levelMargin)}
              unit="g"
              tone={levelTone}
            />
          </PerfResultRow>
          <PerfResultRow className="mt-2">
            {ceiling13Tile}
            {recMaxTile ?? rangeTile}
          </PerfResultRow>
          {recMaxTile && <PerfResultRow className="mt-2">{rangeTile}</PerfResultRow>}
        </>
      );
    } else {
      const aboveMaxAltitude = result.ceiling10 !== null && result.ceiling10 > data.maxOperatingAltitude;
      results = (
        <>
          <MarginTile
            name={t('Performance.Buffet.BuffetMargin')}
            value={formatSigned(result.levelMargin)}
            note={tv('Performance.Buffet.BuffetMarginNote', {
              n: formatG(result.buffetLoadFactor),
              mach: formatMach(inputs.mach),
            })}
            tone={levelTone}
          />
          <PerfResultRow className="mt-2">
            {maxBankTile}
            {ceiling13Tile}
          </PerfResultRow>
          <PerfResultRow className="mt-2">
            {rangeTile}
            <Tile
              name={t('Performance.Buffet.MaxOperating')}
              text={formatMach(result.maxOperatingMach)}
              unit={result.maxOperatingMach >= data.mmo ? 'MMO' : 'VMO'}
            />
          </PerfResultRow>
          <PerfResultRow className="mt-2">
            <Tile
              name={t('Performance.Buffet.Ceiling10')}
              text={result.ceiling10 !== null ? formatFl(result.ceiling10) : '—'}
              unit={
                aboveMaxAltitude
                  ? tv('Performance.Buffet.AboveMaxAltitude', {
                      fl: Math.round(data.maxOperatingAltitude / 100).toString(),
                    })
                  : ''
              }
              tone={aboveMaxAltitude ? 'caution' : 'normal'}
            />
            {recMaxTile}
          </PerfResultRow>
        </>
      );
    }
  }

  // ---------------------------------------------------------------------------------------------- chart

  const lines: BuffetChartLine[] = [];
  if (shownLines['1.0']) {
    lines.push({
      loadFactor: 1.0,
      colour: 'var(--m3-muted)',
      label: '1.0 g',
      fill: 'var(--m3-on-primary-container)',
      fillOpacity: 0.07,
      labelAt: 0.5,
    });
  }
  if (shownLines['1.3']) {
    lines.push({
      loadFactor: 1.3,
      colour: 'var(--m3-primary)',
      label: '1.3 g',
      fill: 'var(--m3-primary)',
      fillOpacity: 0.16,
      labelAt: 0.45,
    });
  }
  if (shownLines['1.4']) {
    // Design choice: the 1.4 g line (QRH turbulence margin) in the light primary, not filled
    lines.push({ loadFactor: 1.4, colour: 'var(--m3-primary-light)', label: '1.4 g', labelAt: 0.35 });
  }
  if (turn && result !== null) {
    lines.push({
      loadFactor: result.turnLoadFactor,
      colour: 'var(--m3-on-warn)',
      dash: '7 5',
      label: `${bankText}° bank`,
      labelAt: 0.62,
    });
  }

  const pointNote = `${formatFl(inputs.pressureAltitude)} M ${formatMach(inputs.mach)}${turn ? ` · ${bankText}°` : ''}`;

  return (
    <div className="flex h-content-section-reduced flex-col overflow-hidden text-base text-m3-text">
      {/*
        no fixed height: the segmented pill is 46 px (44 px buttons + its border) and was centred in a 44 px row, so its
        top stuck out above this overflow-hidden page and was cut off
      */}
      <div className="mb-3 flex shrink-0 flex-row items-center">
        <M3Segmented
          className="w-56 shrink-0"
          options={[
            { label: t('Performance.Buffet.Live'), selected: mode === 'LIVE', onClick: () => setMode('LIVE') },
            { label: t('Performance.Buffet.WhatIf'), selected: mode === 'WHAT_IF', onClick: enterWhatIf },
          ]}
        />
        <div className="ml-3 min-w-0 flex-1">{bannerNode}</div>
      </div>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="mr-4 flex h-full w-96 shrink-0 flex-col">
          {inputsCard}
          <M3Card className="mt-3 min-h-0 flex-1 px-4 py-3">
            <PerfTitle>{t('Performance.Buffet.Results')}</PerfTitle>
            <div className="mt-2 flex flex-col">{results}</div>
          </M3Card>
        </div>

        <M3Card className="h-full min-w-0 flex-1 px-4 py-3">
          <div className="flex h-9 shrink-0 flex-row items-center">
            <PerfTitle>{t('Performance.Buffet.ChartTitle')}</PerfTitle>
            <div className="grow" />
            {['1.0', '1.3', '1.4'].map((n) => (
              <FilterChip
                key={n}
                selected={shownLines[n]}
                onClick={() => setShownLines((shown) => ({ ...shown, [n]: !shown[n] }))}
              >
                {`${n} g`}
              </FilterChip>
            ))}
          </div>
          <div className="mt-1.5 shrink-0">
            <BuffetChart
              data={data}
              weightTonnes={inputs.weightTonnes}
              cg={inputs.cg}
              lines={lines}
              recMaxFl={recMaxFl}
              point={result !== null ? { ...inputs, note: pointNote } : undefined}
            />
          </div>
          <div className="flex shrink-0 flex-row flex-wrap">
            {shownLines['1.0'] && <LegendItem colour="var(--m3-muted)" text={t('Performance.Buffet.Legend10')} />}
            {shownLines['1.3'] && <LegendItem colour="var(--m3-primary)" text={t('Performance.Buffet.Legend13')} />}
            {shownLines['1.4'] && (
              <LegendItem colour="var(--m3-primary-light)" text={t('Performance.Buffet.Legend14')} />
            )}
            {turn && result !== null && (
              <LegendItem
                colour="var(--m3-on-warn)"
                dash="7 5"
                text={tv('Performance.Buffet.LegendBank', { bank: bankText, n: formatG(result.turnLoadFactor) })}
              />
            )}
            <LegendItem colour="var(--m3-on-error)" text={t('Performance.Buffet.LegendSpeedLimit')} />
            {recMaxFl !== null && (
              <LegendItem
                colour="var(--m3-on-primary-container)"
                dash="8 5"
                text={t('Performance.Buffet.LegendRecMax')}
              />
            )}
            <LegendItem
              point
              text={mode === 'LIVE' ? t('Performance.Buffet.LegendAircraft') : t('Performance.Buffet.LegendEntered')}
            />
          </div>
          <div className="grow" />
          <span className="text-xs font-semibold leading-snug text-m3-muted">
            {mode === 'LIVE' ? t('Performance.Buffet.FooterLive') : t('Performance.Buffet.FooterWhatIf')}
          </span>
        </M3Card>
      </div>
    </div>
  );
};
