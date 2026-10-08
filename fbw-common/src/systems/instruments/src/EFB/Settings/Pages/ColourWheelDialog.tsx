// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useState } from 'react';
import { ArrowRight, InfoCircle } from 'react-bootstrap-icons';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3Banner, M3Button } from '../../UtilComponents/Material/Material';
import { useModals } from '../../UtilComponents/Modals/Modals';
import { t, tt } from '../../Localization/translation';
import {
  checkPalette,
  ContrastResult,
  contrast,
  M3Tokens,
  PRESET_BASE,
  PRESET_SEED,
  themeTokens,
} from '../../Utils/themePalette';
import {
  CENTRE_RADIUS,
  COLOUR_WHEEL,
  ColourSlot,
  CustomColours,
  findWedge,
  hatchSegments,
  initialPick,
  pickChange,
  pickTokens,
  primaryAdjustment,
  readHexEntry,
  RING_RADII,
  shownColour,
  SLOT_CHECKS,
  wedgeAt,
  wedgePath,
  WHEEL_RADIUS,
  WheelPick,
} from '../../Utils/colourWheel';
import { useThemeChoice } from '../../Utils/useThemeChoice';

/** The check mark on a colour: white or near-black, whichever reads better on it */
export const checkColour = (hex: string) => (contrast('#ffffff', hex) > 3 ? '#ffffff' : '#0b0d11');

/** One row of a contrast list: a sample "A" in the pair's colours, the pair's name, its ratio and the AA verdict */
export const ContrastRow = ({
  check,
  tokens,
  language,
}: {
  check: ContrastResult;
  tokens: M3Tokens;
  language: string;
}) => (
  <div className="flex h-7 flex-row items-center">
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-m3-outline text-xs font-extrabold"
      style={{ backgroundColor: tokens[check.bg], color: tokens[check.fg] }}
    >
      A
    </span>
    <span className="ml-2 grow truncate text-sm font-semibold text-m3-text">
      {tt(`Settings.flyPad.ThemePalette.Checks.${check.key}`, language)}
    </span>
    <span
      className={`ml-2 text-sm font-bold ${check.pass ? 'text-m3-on-primary-container' : 'text-m3-on-error'}`}
    >{`${check.ratio.toFixed(1)}:1`}</span>
    <span
      className={`ml-2 rounded-md px-2 py-0.5 text-xs font-bold ${
        check.pass ? 'bg-m3-primary-container text-m3-on-primary-container' : 'bg-m3-error-container text-m3-on-error'
      }`}
    >
      {tt(`Settings.flyPad.ThemePalette.${check.pass ? 'Pass' : 'Fail'}`, language)}
    </span>
  </div>
);

// ------------------------------------------------------------------------------------------- the wheel

/** The wheel's drawn size in px; the viewBox adds 6 units around the 400 x 400 wheel for the selection halo */
const WHEEL_SIZE = 400;
const VIEWBOX_MARGIN = 6;
const VIEWBOX_SIZE = 2 * WHEEL_RADIUS + 2 * VIEWBOX_MARGIN;

/** The hatching lines of the blocked wedges, computed once */
const HATCHES: { key: string; segments: number[][] }[] = [];
COLOUR_WHEEL.forEach((ring, r) =>
  ring.forEach((wedge) => {
    if (wedge.blocked) {
      HATCHES.push({
        key: `${r}-${wedge.index}`,
        segments: hatchSegments(wedge.index, RING_RADII[r][0], RING_RADII[r][1]),
      });
    }
  }),
);

interface WheelProps {
  /** The colour shown in the centre disc */
  centre: string;
  /** The selected wedge, or null (a colour off the wheel, or Same) */
  selected: { ring: number; index: number } | null;
  /** The wedges dimmed while Same is selected */
  dim: boolean;
  /** The tokens of the applied theme: the gaps are drawn in its card colour, the halo in its text colour */
  chrome: M3Tokens;
  onPick: (hex: string) => void;
}

/**
 * The colour wheel: 12 hue wedges x 4 rings as SVG paths, 2.5 px gaps in the card colour, the alert-hue wedges faded
 * and hatched. Design choice: one click handler on the box with a geometric hit test (wedgeAt) rather than a handler
 * per path, so the picking does not depend on the sim browser's SVG event support.
 */
const ColourWheel = ({ centre, selected, dim, chrome, onPick }: WheelProps) => {
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const scale = VIEWBOX_SIZE / box.width;
    const hit = wedgeAt(
      (event.clientX - box.left) * scale - VIEWBOX_MARGIN,
      (event.clientY - box.top) * scale - VIEWBOX_MARGIN,
    );
    if (hit) {
      const wedge = COLOUR_WHEEL[hit.ring][hit.index];
      if (!wedge.blocked) {
        onPick(wedge.hex);
      }
    }
  };

  const selectedPath = selected
    ? wedgePath(selected.index, RING_RADII[selected.ring][0], RING_RADII[selected.ring][1])
    : null;

  return (
    <div className="shrink-0" onClick={handleClick} style={{ width: `${WHEEL_SIZE}px`, height: `${WHEEL_SIZE}px` }}>
      <svg
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        viewBox={`${-VIEWBOX_MARGIN} ${-VIEWBOX_MARGIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        style={{ display: 'block' }}
      >
        {COLOUR_WHEEL.map((ring, r) =>
          ring.map((wedge) => (
            <path
              key={`${r}-${wedge.index}`}
              d={wedgePath(wedge.index, RING_RADII[r][0], RING_RADII[r][1])}
              fill={wedge.hex}
              // only the wedges are dimmed for Same: the centre disc keeps showing the primary at full strength
              fillOpacity={(wedge.blocked ? 0.35 : 1) * (dim ? 0.4 : 1)}
              stroke={chrome.card}
              strokeWidth={2.5}
            />
          )),
        )}
        {HATCHES.map(({ key, segments }) => (
          <g key={key}>
            {segments.map(([x1, y1, x2, y2]) => (
              <line
                key={`${x1.toFixed(1)}-${y1.toFixed(1)}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={chrome.card}
                strokeOpacity={0.75}
                strokeWidth={3}
              />
            ))}
          </g>
        ))}
        {selectedPath && (
          <>
            <path d={selectedPath} fill="none" stroke={chrome.card} strokeWidth={7} strokeLinejoin="round" />
            <path d={selectedPath} fill="none" stroke={chrome.text} strokeWidth={3.5} strokeLinejoin="round" />
          </>
        )}
        <circle
          cx={WHEEL_RADIUS}
          cy={WHEEL_RADIUS}
          r={CENTRE_RADIUS}
          fill={centre}
          stroke={chrome.outline}
          strokeWidth={1}
        />
        <path
          d={`M ${WHEEL_RADIUS - 14} ${WHEEL_RADIUS} l 9 9 l 19 -19`}
          fill="none"
          stroke={checkColour(centre)}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

/** The legend sample of a blocked wedge: a faded red disc with three hatching lines */
const HatchSample = ({ chrome }: { chrome: M3Tokens }) => {
  const lines = [-4.5, 0, 4.5].map((d) => {
    // the "/" line at distance d from the centre, cut to a radius of 7
    const h = Math.sqrt(49 - d * d);
    const [cx, cy] = [9 + d / Math.SQRT2, 9 + d / Math.SQRT2];
    return [cx - h / Math.SQRT2, cy + h / Math.SQRT2, cx + h / Math.SQRT2, cy - h / Math.SQRT2];
  });
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: 'block', flexShrink: 0 }}>
      <circle cx={9} cy={9} r={8} fill={COLOUR_WHEEL[0][10].hex} fillOpacity={0.35} />
      {lines.map(([x1, y1, x2, y2]) => (
        <line key={x1} x1={x1} y1={y1} x2={x2} y2={y2} stroke={chrome.card} strokeOpacity={0.75} strokeWidth={2} />
      ))}
    </svg>
  );
};

// ------------------------------------------------------------------------------------------- the preview

/**
 * What the slot drives, drawn with the tokens the theme would have after Apply. The colours are inline styles, not the
 * m3 classes: those follow the applied theme (CSS variables), and overriding variables on an element is not reliable in
 * the sim browser.
 */
const SlotPreview = ({ slot, tokens, language }: { slot: ColourSlot; tokens: M3Tokens; language: string }) => {
  const chip = (text: string, selected: boolean, className: string) => (
    <span
      className={`flex h-8 items-center rounded-[10px] px-3 text-sm font-semibold ${className}`}
      style={
        selected
          ? { backgroundColor: tokens['primary-container'], color: tokens['on-primary-container'] }
          : { border: `1px solid ${tokens.outline}`, color: tokens.text }
      }
    >
      {text}
    </span>
  );
  const segment = (text: string, selected: boolean, first: boolean) => (
    <span
      className={`flex h-9 items-center px-4 text-sm ${selected ? 'font-bold' : 'font-semibold'}`}
      style={{
        backgroundColor: selected ? tokens['primary-container'] : 'transparent',
        color: selected ? tokens['on-primary-container'] : tokens.text,
        borderLeft: first ? undefined : `1px solid ${tokens.outline}`,
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      className="mt-1.5 rounded-[14px] px-4 py-3.5"
      style={{ backgroundColor: tokens.card, border: `1px solid ${tokens.outline}` }}
    >
      {slot === 'primary' ? (
        <>
          <div className="flex flex-row items-center">
            <span
              className="flex h-10 items-center rounded-xl px-5 text-sm font-bold"
              style={{ backgroundColor: tokens.primary, color: tokens['on-primary'] }}
            >
              {tt('Dashboard.YourFlight.ImportSimBriefData', language)}
            </span>
            <span className="relative ml-4 h-6 w-12 shrink-0 rounded-full" style={{ backgroundColor: tokens.primary }}>
              <span className="absolute left-[26px] top-0.5 h-5 w-5 rounded-full bg-white" />
            </span>
          </div>
          <div className="mt-3.5 h-1 overflow-hidden rounded-full" style={{ backgroundColor: tokens.tile }}>
            <div className="h-1 rounded-full" style={{ width: '62%', backgroundColor: tokens.primary }} />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-row items-center">
            <div
              className="flex flex-row overflow-hidden rounded-full"
              style={{ border: `1px solid ${tokens.outline}` }}
            >
              {segment(tt('Settings.flyPad.Utc', language), true, true)}
              {segment(tt('Settings.flyPad.Local', language), false, false)}
            </div>
            {chip('EGLL', true, 'ml-3')}
            {chip('LFPG', false, 'ml-2')}
          </div>
          <div className="mt-3 flex flex-row">
            <span
              className="flex h-9 items-center rounded-xl px-5 text-sm font-bold"
              style={{ backgroundColor: tokens['primary-container'], color: tokens['on-primary-container'] }}
            >
              {tt('Dashboard.ImportantInformation.GoToPage', language)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------------------------------- the dialog

interface ColourWheelDialogProps {
  slot: ColourSlot;
  language: string;
  /** Called when the dialog closes (Apply or Cancel) */
  onClose?: () => void;
}

/** "$name" placeholders of a translated string replaced by their values */
const fill = (text: string, values: Record<string, string>) =>
  Object.keys(values).reduce((result, name) => result.split(`$${name}`).join(values[name]), text);

/**
 * The colour dialog of a custom theme slot (the pencil of Primary color / Secondary color): the colour wheel, a hex
 * field, the colour now in use, a preview and the contrast rows of what the slot drives. Nothing changes on the page
 * until Apply; Apply is always allowed (derivePalette holds every pair to AA).
 */
export const ColourWheelDialog = ({ slot, language, onClose }: ColourWheelDialogProps) => {
  const { popModal } = useModals();
  const [themeChoice, , setThemeChoice] = useThemeChoice();
  // the pencils exist only for a custom theme; a preset gives its own base and seed (one colour)
  const colours: CustomColours =
    themeChoice.kind === 'custom'
      ? { base: themeChoice.base, primary: themeChoice.primary, secondary: themeChoice.secondary }
      : { base: PRESET_BASE[themeChoice.preset], primary: PRESET_SEED[themeChoice.preset], secondary: null };

  const [pick, setPick] = useState<WheelPick>(() => initialPick(slot, colours));
  const [hexError, setHexError] = useState<string | null>(null);

  const s = (key: string) => tt(`Settings.flyPad.ThemePalette.${key}`, language);
  const baseName = s({ grey: 'Gray', black: 'Black', light: 'Light' }[colours.base]);

  const chrome = themeTokens(themeChoice);
  const tokens = pickTokens(slot, pick, colours);
  const shown = shownColour(pick, colours);
  const current = slot === 'primary' ? colours.primary : colours.secondary ?? colours.primary;
  const selectedWedge = pick.same ? null : findWedge(pick.hex);
  const adjustment = slot === 'primary' ? primaryAdjustment(pick.hex, tokens) : null;
  const checks = checkPalette(tokens).filter((check) => SLOT_CHECKS[slot].includes(check.key));

  const choose = (hex: string) => {
    setHexError(null);
    setPick({ hex, same: false });
  };

  const applyHex = (text: string) => {
    const entry = readHexEntry(text, shown);
    if (entry.kind === 'invalid') {
      setHexError(s('HexInvalid'));
    } else if (entry.kind === 'alert') {
      setHexError(s('HexAlertHue'));
    } else if (entry.kind === 'pick') {
      choose(entry.hex);
    }
  };

  const close = () => {
    onClose?.();
    popModal();
  };

  const apply = () => {
    if (themeChoice.kind === 'custom') {
      setThemeChoice({ ...themeChoice, ...pickChange(slot, pick) });
    }
    close();
  };

  const label = (text: string, className = '') => (
    <span className={`text-xs font-bold uppercase tracking-widest text-m3-muted ${className}`}>{text}</span>
  );
  const dot = (hex: string, className = '') => (
    <span
      className={`block h-[22px] w-[22px] shrink-0 rounded-full border border-m3-outline ${className}`}
      style={{ backgroundColor: hex }}
    />
  );

  return (
    <div className="flex h-[680px] w-[1020px] flex-col rounded-[20px] border border-m3-outline bg-m3-card px-8 py-7">
      <h1 className="text-[22px] font-bold leading-tight text-m3-text">
        {s(slot === 'primary' ? 'PrimaryColor' : 'SecondaryColor')}
      </h1>
      <p className="mt-1 text-sm font-semibold text-m3-muted">
        {s(slot === 'primary' ? 'PrimaryDescription' : 'SecondaryDescription')}
      </p>

      <div className="mt-6 flex min-h-0 flex-1 flex-row">
        <div className="flex w-[400px] shrink-0 flex-col">
          <ColourWheel centre={shown} selected={selectedWedge} dim={pick.same} chrome={chrome} onPick={choose} />
          <div className="mt-[18px] flex flex-row items-start">
            <HatchSample chrome={chrome} />
            <span className="ml-2.5 text-[13px] font-semibold leading-[18px] text-m3-muted">{s('HexAlertHue')}</span>
          </div>
        </div>

        <div className="ml-9 flex min-w-0 flex-1 flex-col">
          <div className="flex flex-row items-start">
            <span
              className="block h-24 w-24 shrink-0 rounded-[20px] border border-m3-outline"
              style={{ backgroundColor: shown }}
            />
            <div className="ml-5 flex min-w-0 flex-1 flex-col">
              {label(s('EditHex'))}
              <div className="mt-1.5 flex flex-row items-center">
                <SimpleInput
                  className="!h-11 w-[150px] text-center font-bold tracking-wide"
                  fontSizeClassName="text-lg"
                  value={shown.toUpperCase()}
                  uppercase
                  maxLength={7}
                  onBlur={applyHex}
                />
                {slot === 'secondary' && (
                  <button
                    type="button"
                    onClick={() => {
                      setHexError(null);
                      setPick({ ...pick, same: true });
                    }}
                    className={`ml-2.5 flex h-9 shrink-0 items-center rounded-xl px-3 ${
                      pick.same
                        ? 'bg-m3-primary-container text-m3-on-primary-container'
                        : 'border border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
                    }`}
                  >
                    <span className="text-sm font-semibold text-current">{s('Same')}</span>
                  </button>
                )}
              </div>
              <span className={`mt-1.5 text-[13px] font-semibold ${hexError ? 'text-m3-on-error' : 'text-m3-muted'}`}>
                {hexError ?? s('HexDescription')}
              </span>
            </div>
          </div>

          <div className="mt-3.5 flex flex-row items-center">
            {dot(current)}
            <span className="ml-2 whitespace-nowrap text-[13px] font-semibold text-m3-muted">
              {`${s('Current')} ${current.toUpperCase()}`}
            </span>
            {adjustment && (
              <>
                <span className="ml-4 flex text-m3-muted">
                  <ArrowRight size={16} />
                </span>
                {dot(adjustment.used, 'ml-4')}
                <span className="ml-2 whitespace-nowrap text-[13px] font-bold text-m3-text">
                  {`${fill(s('UsedOnBase'), { base: baseName })} ${adjustment.used.toUpperCase()}`}
                </span>
              </>
            )}
          </div>
          {slot === 'secondary' && (
            <span className="mt-2 text-[13px] font-semibold text-m3-muted">{s('SecondaryNote')}</span>
          )}

          {label(s('Preview'), 'mt-[18px]')}
          <SlotPreview slot={slot} tokens={tokens} language={language} />

          {label(s('Contrast'), 'mt-4 mb-1')}
          {checks.map((check) => (
            <ContrastRow key={check.key} check={check} tokens={tokens} language={language} />
          ))}

          {adjustment && (
            <M3Banner tone="busy" icon={<InfoCircle size={18} />} className="mt-3.5 !items-start">
              {fill(s(adjustment.reason), {
                base: baseName,
                ratio: adjustment.ratio,
                hex: adjustment.used.toUpperCase(),
              })}
            </M3Banner>
          )}

          <div className="grow" />
          <div className="mt-4 flex flex-row">
            <M3Button tone="outline" className="!h-12 flex-1" onClick={close}>
              <span className="text-base font-bold text-current">{t('Modals.Cancel')}</span>
            </M3Button>
            <M3Button tone="primary" className="ml-3 !h-12 flex-1" onClick={apply}>
              <span className="text-base font-bold text-current">{s('Apply')}</span>
            </M3Button>
          </div>
        </div>
      </div>
    </div>
  );
};
