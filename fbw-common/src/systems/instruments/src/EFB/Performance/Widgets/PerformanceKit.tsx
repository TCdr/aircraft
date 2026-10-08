// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
import { CloudArrowDown } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { M3Card, M3_INPUT } from '../../UtilComponents/Material/Material';

/**
 * The parts shared by the performance calculators (takeoff, landing, top of descent, temperature correction) in the
 * Material kit: form cards with labelled rows, result tiles, the "fill data from" button.
 */

/** The look of a number field and of a drop-down of a calculator form (classes for SimpleInput and SelectInput) */
export const PERF_INPUT = `${M3_INPUT} font-bold`;
export const PERF_SELECT = '!border-m3-outline bg-m3-ground';

const eyebrow = 'text-xs font-bold uppercase tracking-widest text-m3-muted';

interface PerfSectionProps {
  title: string;
  /** A control beside the title */
  action?: ReactNode;
  className?: string;
}

/** A card of a calculator form; a drop-down may hang out of it */
export const PerfSection: FC<PerfSectionProps> = ({ title, action, className, children }) => (
  <M3Card className={`!overflow-visible px-4 py-3 ${className ?? ''}`}>
    <div className="mb-1 flex h-6 shrink-0 flex-row items-center">
      <span className={eyebrow}>{title}</span>
      <div className="grow" />
      {action}
    </div>
    <div className="flex flex-col space-y-1">{children}</div>
  </M3Card>
);

/** A labelled input; the label is amber while the input is `missing` (the calculation needs it) */
export const PerfRow: FC<{ label: string; missing?: boolean; note?: string }> = ({
  label,
  missing,
  note,
  children,
}) => (
  <div className="flex h-10 flex-row items-center justify-between">
    <span className="mr-2 flex flex-col">
      <span
        className={`whitespace-nowrap text-sm font-semibold leading-tight ${missing ? 'text-m3-on-warn' : 'text-m3-text'}`}
      >
        {label}
      </span>
      {/* a remark under the name, e.g. the wind components */}
      {note && <span className="whitespace-nowrap text-xs leading-tight text-m3-muted">{note}</span>}
    </span>
    {children}
  </div>
);

interface PerfValueProps {
  text: string;
  unit?: string;
  /** Not Airbus data: amber, with an asterisk */
  estimate?: boolean;
  big?: boolean;
  /** The main result of the panel */
  primary?: boolean;
  /** To watch: amber, without the asterisk of an estimate */
  caution?: boolean;
  /** Out of limits */
  warning?: boolean;
  /** Extrapolated beyond the data (e.g. a tailwind above the limit): amber, with ~ before and a dagger after */
  extrapolated?: boolean;
}

/**
 * A result value: white (teal for the main one), amber with an asterisk for an estimate, amber between ~ and a dagger
 * when extrapolated, its unit muted
 */
export const PerfValue: FC<PerfValueProps> = ({
  text,
  unit,
  estimate,
  big,
  primary,
  caution,
  warning,
  extrapolated,
}) => {
  let colour = primary ? 'text-m3-on-primary-container' : 'text-m3-text';
  if (warning) {
    colour = 'text-m3-on-error';
  } else if (estimate || caution || extrapolated) {
    colour = 'text-m3-on-warn';
  }
  let shown = `${text}${estimate ? '*' : ''}`;
  if (extrapolated) {
    shown = `~${text}\u2020`;
  }
  return (
    <span className={`whitespace-nowrap font-bold ${big ? 'text-2xl' : 'text-lg'} ${colour}`}>
      {shown}
      {unit && <span className="ml-1 text-xs font-semibold text-m3-muted">{unit}</span>}
    </span>
  );
};

/** A result as a tile: its name over its value */
export const PerfResult: FC<{ name: ReactNode; className?: string }> = ({ name, className, children }) => (
  <div className={`flex min-w-0 flex-1 flex-col rounded-xl bg-m3-card px-3 py-2 ${className ?? ''}`}>
    <span className={`truncate ${eyebrow}`}>{name}</span>
    {children}
  </div>
);

/** A row of result tiles */
export const PerfResultRow: FC<{ className?: string }> = ({ className, children }) => (
  <div className={`flex shrink-0 flex-row space-x-2 ${className ?? ''}`}>{children}</div>
);

/** The title of a results or drawing card */
export const PerfTitle: FC<{ className?: string }> = ({ className, children }) => (
  <span className={`${eyebrow} ${className ?? ''}`}>{children}</span>
);

interface PerfFillFromProps<T extends string> {
  /** The data can be fetched now */
  enabled: boolean;
  onClick: () => void;
  /** The data sources, when there is a choice */
  source?: T;
  sources?: T[];
  onSource?: (source: T) => void;
  /** The whole label, without a source list (e.g. "Fill data from FMS") */
  label?: string;
}

/** The "fill data from" button, with its list of sources */
export const PerfFillFrom = <T extends string>({
  enabled,
  onClick,
  source,
  sources,
  onSource,
  label,
}: PerfFillFromProps<T>) => (
  <div className="flex flex-row items-center">
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      className={`flex h-10 flex-row items-center rounded-xl bg-m3-primary-container px-4 text-m3-on-primary-container transition duration-100 ${
        enabled ? 'hover:brightness-110' : 'opacity-50'
      }`}
    >
      <CloudArrowDown size={20} className="mr-2" />
      <span className="whitespace-nowrap text-sm font-bold text-current">
        {label ?? t('Performance.Landing.FillDataFrom')}
      </span>
    </button>
    {sources && (
      <SelectInput
        fontSizeClassName="text-base"
        value={source}
        className={`ml-1 h-10 w-28 ${PERF_SELECT}`}
        options={sources.map((s) => ({ value: s, displayValue: s }))}
        onChange={(value) => onSource?.(value as T)}
      />
    )}
  </div>
);

/** A small button of a calculator: a stepper, a unit or data source toggle */
export const PERF_SMALL_BUTTON =
  'flex h-10 items-center justify-center rounded-xl border border-m3-outline bg-transparent text-m3-text';
