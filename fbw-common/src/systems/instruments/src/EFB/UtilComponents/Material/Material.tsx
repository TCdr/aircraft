// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';

/**
 * The Material 3 kit of the flyPad: tonal surfaces and chips on the theme colours (Assets/Theme.css, the m3-* colours
 * of the Tailwind config). A tone is what a thing means: active (connected, open), busy (in progress, called),
 * warn (attention), or idle. Spacing is on the 4 px grid, with margins rather than flex gaps: the sim's rendering
 * engine (an old WebKit) ignores the gap property.
 */
export type M3Tone = 'active' | 'busy' | 'warn' | 'idle';

/** The tile of an icon in a list row */
const TILE_TONES: Record<M3Tone, string> = {
  active: 'bg-m3-primary-container text-m3-on-primary-container',
  busy: 'bg-m3-warn-container text-m3-on-warn',
  warn: 'bg-m3-error-container text-m3-on-error',
  idle: 'bg-m3-tile text-m3-muted',
};

/** The text of a status line */
export const M3_STATUS_TONES: Record<M3Tone, string> = {
  active: 'text-m3-on-primary-container',
  busy: 'text-m3-on-warn',
  warn: 'text-m3-on-error',
  idle: 'text-m3-muted',
};

const CHIP_TONES: Record<M3Tone, string> = {
  active: 'bg-m3-primary-container text-m3-on-primary-container',
  busy: 'bg-m3-warn-container text-m3-on-warn',
  warn: 'bg-m3-error-container text-m3-on-error',
  idle: 'border border-m3-outline text-m3-text',
};

const BAR_TONES: Record<M3Tone, string> = {
  active: 'bg-m3-primary',
  busy: 'bg-m3-on-warn',
  warn: 'bg-m3-on-error',
  idle: 'bg-m3-muted',
};

/**
 * The Material look of a text field, for the className of SimpleInput and SelectInput (important utilities: these
 * components bring their own border and background)
 */
export const M3_INPUT =
  '!rounded-xl !border !border-m3-outline !bg-m3-ground !text-m3-text focus-within:!border-m3-primary';

// ------------------------------------------------------------------------------------------ page and cards

interface M3PageProps {
  /** The small line over the title, e.g. GROUND (none inside a flyPad section that already has its title bar) */
  eyebrow?: string;
  title?: string;
  /** The status chips on the right of the title */
  chips?: ReactNode;
  className?: string;
}

/** A page: the title bar with its status chips (or the chips alone), then the content */
export const M3Page: FC<M3PageProps> = ({ eyebrow, title, chips, className, children }) => (
  <div className={`flex h-content-section-reduced flex-col overflow-hidden text-m3-text ${className ?? ''}`}>
    {(title || chips) && (
      <div className="mb-4 flex shrink-0 flex-row items-center">
        {title && (
          <div className="flex flex-col">
            {eyebrow && (
              <span className="text-xs font-semibold uppercase tracking-widest text-m3-muted">{eyebrow}</span>
            )}
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
        )}
        <div className="grow" />
        {chips && <div className="flex flex-row flex-wrap justify-end space-x-2">{chips}</div>}
      </div>
    )}
    {children}
  </div>
);

interface M3CardProps {
  className?: string;
  /** A lower surface, e.g. behind a map or a drawing */
  low?: boolean;
  style?: React.CSSProperties;
}

/** A tonal card */
export const M3Card: FC<M3CardProps> = ({ className, low, style, children }) => (
  <div
    className={`flex min-h-0 flex-col overflow-hidden rounded-2xl ${low ? 'bg-m3-card-low' : 'bg-m3-card'} ${className ?? ''}`}
    style={style}
  >
    {children}
  </div>
);

interface M3SectionHeaderProps {
  title: string;
  /** A count badge on the right, e.g. "2 open · 5" */
  badge?: string;
  trailing?: ReactNode;
}

/** The header of a list card: an eyebrow title, the count badge on the right */
export const M3SectionHeader: FC<M3SectionHeaderProps> = ({ title, badge, trailing }) => (
  <div className="flex shrink-0 flex-row items-center px-4 pb-2 pt-4">
    <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">{title}</span>
    <div className="grow" />
    {badge && (
      <span className="rounded-full bg-m3-tile px-2 py-1 text-xs font-bold leading-none text-m3-muted">{badge}</span>
    )}
    {trailing && <span className="ml-2">{trailing}</span>}
  </div>
);

/** The scrolling body of a list card */
export const M3List: FC<{ className?: string }> = ({ className, children }) => (
  <div className={`scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto ${className ?? ''}`}>{children}</div>
);

// ------------------------------------------------------------------------------------------ list row

interface M3ListRowProps {
  icon: ReactNode;
  tone: M3Tone;
  name: string;
  /** The status line under the name */
  status?: string;
  statusTone?: M3Tone;
  /** The control on the right: a switch, an action chip, a value */
  trailing?: ReactNode;
  /** A thin progress bar under the row, 0 to 1 */
  progress?: number | null;
  /** The whole row is a target (otherwise only its trailing control) */
  onClick?: () => void;
  disabled?: boolean;
}

/** A dense list row: an icon tile, the name over its status, a control on the right */
export const M3ListRow: FC<M3ListRowProps> = ({
  icon,
  tone,
  name,
  status,
  statusTone,
  trailing,
  progress,
  onClick,
  disabled,
}) => (
  <div
    className={`flex shrink-0 flex-col px-4 py-2 ${disabled ? 'opacity-40' : ''} ${
      onClick && !disabled ? 'hover:bg-m3-tile/40 cursor-pointer' : ''
    }`}
    onClick={disabled ? undefined : onClick}
  >
    <div className="flex min-h-[40px] flex-row items-center">
      <span className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TILE_TONES[tone]}`}>
        {icon}
      </span>
      <div className="flex min-w-0 grow flex-col">
        <span className="truncate text-base font-semibold leading-tight">{name}</span>
        {status && (
          <span className={`truncate text-xs leading-tight ${M3_STATUS_TONES[statusTone ?? tone]}`}>{status}</span>
        )}
      </div>
      {trailing && <span className="ml-3 flex shrink-0 items-center">{trailing}</span>}
    </div>
    {progress !== undefined && progress !== null && (
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-m3-tile">
        <div
          className={`h-1 rounded-full ${BAR_TONES[tone === 'idle' ? 'active' : tone]}`}
          style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` }}
        />
      </div>
    )}
  </div>
);

// ------------------------------------------------------------------------------------------ chips and controls

interface M3ChipProps {
  tone: M3Tone;
  icon?: ReactNode;
  className?: string;
}

/** A status chip (not a control) */
export const M3Chip: FC<M3ChipProps> = ({ tone, icon, className, children }) => (
  <span
    className={`inline-flex h-9 items-center whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${CHIP_TONES[tone]} ${className ?? ''}`}
  >
    {icon && <span className="mr-2 flex items-center">{icon}</span>}
    {children}
  </span>
);

interface M3ActionChipProps {
  onClick: () => void;
  /** The tonal (filled) look for the main action; outlined otherwise */
  primary?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * The greyed-out look of a disabled control, set from its `disabled` prop like the flyPad Toggle and M3ListRow.
 * Design choice: the look does not rely on the `:disabled` pseudo-class (Tailwind `disabled:`) of the sim browser
 * (Coherent GT, an old WebKit), whose support is not proven: the GSX link switch was reported not greyed out
 * without GSX.
 */
export const m3DisabledLook = (disabled: boolean | undefined): string =>
  disabled ? 'pointer-events-none opacity-40' : '';

/** An action chip: Request, Release... */
export const M3ActionChip: FC<M3ActionChipProps> = ({ onClick, primary, disabled, className, children, ...rest }) => (
  <button
    type="button"
    aria-label={rest['aria-label']}
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    className={`h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition duration-100 ${
      primary
        ? 'bg-m3-tonal text-m3-primary-light hover:bg-m3-primary hover:text-m3-on-primary'
        : 'border border-m3-outline bg-transparent text-m3-text hover:border-m3-on-primary-container hover:text-m3-on-primary-container'
    } ${m3DisabledLook(disabled)} ${className ?? ''}`}
  >
    {children}
  </button>
);

interface M3SwitchProps {
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** A Material switch, 48 x 24 */
export const M3Switch: FC<M3SwitchProps> = ({ value, onToggle, disabled, ...rest }) => (
  <button
    type="button"
    role="switch"
    aria-checked={value}
    aria-label={rest['aria-label']}
    disabled={disabled}
    onClick={() => !disabled && onToggle(!value)}
    className={`relative box-border h-6 w-12 shrink-0 rounded-full transition duration-150 ${m3DisabledLook(disabled)} ${
      value ? 'bg-m3-primary' : 'border-2 border-m3-outline-strong bg-transparent'
    }`}
  >
    <span
      className={`absolute rounded-full transition duration-150 ${
        value ? 'left-[26px] top-0.5 h-5 w-5 bg-white' : 'left-0.5 top-0.5 h-4 w-4 bg-m3-muted'
      }`}
    />
  </button>
);

export interface M3SegmentOption {
  label: ReactNode;
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** A segmented control: one of several states */
export const M3Segmented: FC<{ options: M3SegmentOption[]; className?: string }> = ({ options, className }) => (
  <div className={`flex flex-row overflow-hidden rounded-full border border-m3-outline ${className ?? ''}`}>
    {options.map((option, index) => (
      <button
        key={index}
        type="button"
        aria-label={option['aria-label']}
        disabled={option.disabled}
        onClick={option.disabled ? undefined : option.onClick}
        className={`flex h-11 flex-1 items-center justify-center space-x-2 text-sm font-semibold transition duration-100 ${m3DisabledLook(option.disabled)} ${
          index > 0 ? 'border-l border-m3-outline' : ''
        } ${
          option.selected
            ? 'bg-m3-primary-container font-bold text-m3-on-primary-container'
            : 'bg-transparent text-m3-text hover:bg-m3-tile'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

interface M3ButtonProps {
  onClick: () => void;
  tone?: 'primary' | 'tonal' | 'warn' | 'outline' | 'danger';
  disabled?: boolean;
  className?: string;
}

/** A large filled button for the main action of a card */
export const M3Button: FC<M3ButtonProps> = ({ onClick, tone = 'primary', disabled, className, children }) => {
  const look = {
    primary: 'bg-m3-primary text-m3-on-primary hover:brightness-110',
    warn: 'bg-m3-warn-container text-m3-on-warn hover:brightness-110',
    outline: 'border border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile',
    tonal: 'bg-m3-primary-container text-m3-on-primary-container hover:brightness-110',
    danger: 'border border-m3-on-error bg-transparent text-m3-on-error hover:bg-m3-error-container',
  }[tone];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex h-14 items-center justify-center space-x-2 rounded-2xl px-4 text-lg font-bold transition duration-100 ${m3DisabledLook(disabled)} ${look} ${className ?? ''}`}
    >
      {children}
    </button>
  );
};

interface M3IconButtonProps {
  onClick: () => void;
  'aria-label': string;
  disabled?: boolean;
  selected?: boolean;
  className?: string;
}

/** A square icon button */
export const M3IconButton: FC<M3IconButtonProps> = ({ onClick, disabled, selected, className, children, ...rest }) => (
  <button
    type="button"
    aria-label={rest['aria-label']}
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
    className={`flex h-12 flex-1 items-center justify-center rounded-xl border transition duration-100 ${m3DisabledLook(disabled)} ${
      selected
        ? 'border-m3-primary-container bg-m3-primary-container text-m3-on-primary-container'
        : 'border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
    } ${className ?? ''}`}
  >
    {children}
  </button>
);

/** A thin progress bar */
export const M3Progress: FC<{ value: number; tone?: M3Tone; className?: string }> = ({ value, tone, className }) => (
  <div className={`h-1 w-full overflow-hidden rounded-full bg-m3-tile ${className ?? ''}`}>
    <div
      className={`h-1 rounded-full ${BAR_TONES[tone ?? 'active']}`}
      style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
    />
  </div>
);

/** A banner inside a card: a warning or a message */
export const M3Banner: FC<{ tone: M3Tone; icon?: ReactNode; className?: string }> = ({
  tone,
  icon,
  className,
  children,
}) => (
  <div
    className={`flex flex-row items-center rounded-xl px-3 py-2 text-sm font-semibold ${CHIP_TONES[tone]} ${className ?? ''}`}
  >
    {icon && <span className="mr-2 flex shrink-0 items-center">{icon}</span>}
    <span className="grow text-sm font-semibold text-current">{children}</span>
  </div>
);
