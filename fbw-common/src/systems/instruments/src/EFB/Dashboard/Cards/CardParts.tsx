// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
import { M3Button, M3Chip, M3Progress, M3Tone } from '../../UtilComponents/Material/Material';
import { ServiceChip } from '../logic/dashboardLayout';
import { t } from '../../Localization/translation';

/** The square panel frame; styled here so the dashboard keeps its look whatever the shared kit's card looks like */
export const PANEL_FRAME = 'rounded border border-m3-outline bg-m3-card';

/** The panels whose header bar gets a section colour (from the theme stylesheet) */
export type DashboardSection =
  | 'flight'
  | 'aircraftState'
  | 'turnaround'
  | 'advisories'
  | 'checklists'
  | 'fuel'
  | 'payload'
  | 'flightPlan'
  | 'destination'
  | 'cabin';

/** The class that colours a section's header bar; the theme stylesheet sets its background and title colour */
export const sectionHeaderClass = (section: DashboardSection): string => `dashboard-header-${section}`;

/** The header title: its colour comes from the section rule of the theme stylesheet, so it carries no colour class */
export const HEADER_TITLE = 'dashboard-header-title text-xs font-extrabold uppercase tracking-widest';

interface DashboardCardProps {
  title: string;
  /** The header colour; a panel without a section (e.g. the weather page's detail panels) has the neutral tile bar */
  section?: DashboardSection;
  /** Status boxes or a note on the right of the header bar */
  trailing?: ReactNode;
  /** The buttons of the panel: always at its bottom, so side-by-side panels share one baseline */
  footer?: ReactNode;
  /** Replaces the default body padding, e.g. for a list that runs to the panel edges */
  bodyClassName?: string;
  className?: string;
}

/** A dashboard panel: the header bar with its title, the content, the buttons pushed to the bottom */
export const DashboardCard: FC<DashboardCardProps> = ({
  title,
  section,
  trailing,
  footer,
  bodyClassName,
  className,
  children,
}) => (
  <div className={`flex min-h-0 flex-col overflow-hidden ${PANEL_FRAME} ${className ?? ''}`}>
    <div
      className={`flex h-9 shrink-0 flex-row items-center border-b border-m3-outline px-3 ${section ? sectionHeaderClass(section) : 'bg-m3-tile'}`}
    >
      <span className={`truncate ${HEADER_TITLE} ${section ? '' : 'text-m3-text'}`}>{title}</span>
      <div className="grow" />
      {trailing && <div className="ml-2 flex shrink-0 flex-row items-center space-x-2">{trailing}</div>}
    </div>
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${bodyClassName ?? 'px-3 py-2'}`}>{children}</div>
    {footer && <div className="flex shrink-0 flex-row space-x-3 px-3 pb-3">{footer}</div>}
  </div>
);

/** A status box sized for the header bar */
export const HeaderChip: FC<{ tone: M3Tone }> = ({ tone, children }) => (
  <M3Chip tone={tone} className="!h-6 !rounded-sm !px-2 !text-xs !font-bold">
    {children}
  </M3Chip>
);

/** A plain note on the right of the header bar, e.g. "5 / 11 done" */
export const HeaderNote: FC = ({ children }) => (
  <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-m3-muted">{children}</span>
);

/** The small uppercase name above a value */
export const FieldLabel: FC<{ className?: string }> = ({ className, children }) => (
  <span className={`truncate text-xs font-bold uppercase tracking-wider text-m3-muted ${className ?? ''}`}>
    {children}
  </span>
);

const VALUE_TONES: Record<M3Tone, string> = {
  active: 'text-m3-on-primary-container',
  busy: 'text-m3-on-warn',
  warn: 'text-m3-on-error',
  idle: 'text-m3-text',
};

interface FieldProps {
  label: string;
  /** A figure, or a status box */
  value: ReactNode;
  detail?: string;
  tone?: M3Tone;
}

/** A figure: its name, its value, an optional detail line */
export const Field: FC<FieldProps> = ({ label, value, detail, tone }) => (
  <div className="flex min-w-0 flex-1 flex-col justify-center">
    <FieldLabel>{label}</FieldLabel>
    {typeof value === 'string' ? (
      <span className={`truncate text-lg font-extrabold leading-snug ${VALUE_TONES[tone ?? 'idle']}`}>{value}</span>
    ) : (
      <div className="mt-1 flex flex-row">{value}</div>
    )}
    {detail && <span className="truncate text-xs font-semibold text-m3-muted">{detail}</span>}
  </div>
);

/** Fields of one group on one row, equal width, split by thin rules */
export const FieldRow: FC<{ className?: string }> = ({ className, children }) => {
  const fields = React.Children.toArray(children).filter(Boolean);
  return (
    <div className={`flex shrink-0 flex-row ${className ?? ''}`}>
      {fields.map((field, index) => (
        <div
          key={index}
          className={`flex min-w-0 flex-1 flex-row ${index > 0 ? 'border-l border-m3-outline pl-3' : ''} ${
            index < fields.length - 1 ? 'pr-3' : ''
          }`}
        >
          {field}
        </div>
      ))}
    </div>
  );
};

interface CardButtonProps {
  onClick: () => void;
  tone?: 'primary' | 'tonal' | 'outline';
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export const CardButton: FC<CardButtonProps> = ({ onClick, tone, icon, disabled, className, children }) => (
  <M3Button
    tone={tone ?? 'tonal'}
    disabled={disabled}
    onClick={onClick}
    className={`!h-10 min-w-0 flex-1 !rounded ${className ?? ''}`}
  >
    {icon}
    <span className="truncate text-sm font-extrabold uppercase tracking-wider text-current">{children}</span>
  </M3Button>
);

/** A name on the left, its value on the right */
export const InfoLine: FC<{ name: string; value: ReactNode; className?: string }> = ({ name, value, className }) => (
  <div className={`flex h-9 shrink-0 flex-row items-center ${className ?? ''}`}>
    <span className="min-w-0 grow truncate text-sm text-m3-text">{name}</span>
    <div className="ml-2 flex shrink-0 flex-row items-center">{value}</div>
  </div>
);

/** A status box in a list row */
export const StatusBox: FC<{ tone: M3Tone }> = ({ tone, children }) => (
  <M3Chip tone={tone} className="!h-7 !rounded-sm !px-3 !text-xs !font-bold">
    {children}
  </M3Chip>
);

/** The fuel or payload status box; the thin progress line under the panel shows while it runs */
export const ServiceStatusChip: FC<{ chip: ServiceChip }> = ({ chip }) => (
  <HeaderChip tone={chip.tone}>{t(chip.key, chip.replacements)}</HeaderChip>
);

export const ServiceProgress: FC<{ chip: ServiceChip }> = ({ chip }) =>
  chip.progress === null ? null : <M3Progress value={chip.progress} tone="busy" className="mt-2 shrink-0" />;
