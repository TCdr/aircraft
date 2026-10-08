// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useState } from 'react';
import { Check2, PencilFill } from 'react-bootstrap-icons';
import { SettingItem } from '../Settings';
import { SelectGroup, SelectItem } from '../../UtilComponents/Form/Select';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3Banner, M3Button, M3Chip, M3Segmented, M3Switch } from '../../UtilComponents/Material/Material';
import { tt } from '../../Localization/translation';
import {
  alertHueClash,
  checkPalette,
  contrast,
  M3Tokens,
  parseHexColour,
  PRESET_BASE,
  PRESET_SEED,
  OFFERED_SWATCHES,
  ThemeBase,
  ThemeChoice,
  ThemePreset,
  themeTokens,
} from '../../Utils/themePalette';
import { useThemeChoice } from '../../Utils/useThemeChoice';

type CustomTheme = Extract<ThemeChoice, { kind: 'custom' }>;

/** The colour slot the hex field edits */
type ColourSlot = 'primary' | 'secondary';

/** The check mark on a selected swatch: white or near-black, whichever reads better on the swatch */
const checkColour = (hex: string) => (contrast('#ffffff', hex) > 3 ? '#ffffff' : '#0b0d11');

interface SwatchProps {
  hex: string;
  name: string;
  selected: boolean;
  /** The diameter of the colour disc, in px (the ring around it adds 8) */
  size: number;
  onSelect: () => void;
}

/** A colour disc with a ring when it is the selected colour */
const Swatch = ({ hex, name, selected, size, onSelect }: SwatchProps) => (
  <button
    type="button"
    aria-label={name}
    onClick={onSelect}
    className={`flex shrink-0 items-center justify-center rounded-full border-2 bg-transparent ${
      selected ? 'border-m3-text' : 'border-transparent'
    }`}
    style={{ width: `${size + 8}px`, height: `${size + 8}px` }}
  >
    <span
      className="flex items-center justify-center rounded-full"
      style={{ width: `${size}px`, height: `${size}px`, backgroundColor: hex, color: checkColour(hex) }}
    >
      {selected && <Check2 size={18} />}
    </span>
  </button>
);

/** The button that opens the hex field for a slot */
const HexButton = ({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed ${
      open
        ? 'border-m3-on-primary-container bg-m3-primary-container text-m3-on-primary-container'
        : 'border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
    }`}
  >
    <PencilFill size={14} />
  </button>
);

/**
 * A small Dashboard drawn with the kit components and the Dashboard's own strings, so it shows the active theme: every
 * token the palette changes (primary, its text, the containers of the secondary, the light primary) next to the fixed
 * warn and error ones. The values are examples.
 */
const ThemePreview = ({ language }: { language: string }) => {
  const d = (key: string) => tt(`Dashboard.${key}`, language);
  const label = (text: string) => (
    <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">{text}</span>
  );
  const value = (name: string, text: string, accent: boolean) => (
    <div className="flex flex-1 flex-col rounded-lg bg-m3-tile px-2 py-1">
      <span className="truncate text-xs font-semibold text-m3-muted">{name}</span>
      <span
        className={`whitespace-nowrap text-lg font-bold ${accent ? 'text-m3-on-primary-container' : 'text-m3-text'}`}
      >
        {text}
      </span>
    </div>
  );

  return (
    <div className="flex w-[460px] shrink-0 flex-col rounded-2xl border border-m3-outline bg-m3-ground p-4">
      <div className="flex flex-row items-center">
        <div className="flex flex-col">
          {label(d('Title'))}
          <span className="text-lg font-bold text-m3-text">{d('ImportantInformation.Title')}</span>
        </div>
        <div className="grow" />
        <M3Segmented
          className="w-48"
          options={[
            { label: tt('Settings.flyPad.Utc', language), selected: true, onClick: () => {} },
            { label: tt('Settings.flyPad.Local', language), onClick: () => {} },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-row">
        <div className="flex flex-1 flex-col rounded-xl bg-m3-card p-3">
          {label(d('ImportantInformation.Weather.Title'))}
          <div className="mt-2 flex flex-row">
            {value(d('ImportantInformation.Weather.AirPressure'), '1013', true)}
            <span className="ml-2 flex flex-1">
              {value(d('ImportantInformation.Weather.Temperature'), '15 \u00b0C', false)}
            </span>
          </div>
          <div className="mt-2 flex flex-row items-center">
            <span className="grow text-sm font-semibold text-m3-text">{d('ImportantInformation.Weather.Raw')}</span>
            <M3Switch value onToggle={() => {}} />
            <span className="ml-2 flex">
              <M3Switch value={false} onToggle={() => {}} />
            </span>
          </div>
          <div className="mt-2 flex flex-row">
            <M3Chip tone="active" className="!h-8 !px-3">
              EGLL
            </M3Chip>
            <M3Chip tone="idle" className="ml-2 !h-8 !px-3">
              LFPG
            </M3Chip>
          </div>
        </div>
        <div className="ml-3 flex flex-1 flex-col rounded-xl bg-m3-card p-3">
          {label(d('YourFlight.Title'))}
          <M3Button className="mt-2 !h-9 !rounded-xl !text-sm" onClick={() => {}}>
            <span className="text-sm font-bold text-current">{d('YourFlight.ImportSimBriefData')}</span>
          </M3Button>
          <M3Button tone="tonal" className="mt-2 !h-9 !rounded-xl !text-sm" onClick={() => {}}>
            <span className="text-sm font-bold text-current">{d('ImportantInformation.GoToPage')}</span>
          </M3Button>
          <M3Banner tone="busy" className="mt-2 !py-1">
            {d('ImportantInformation.Weather.Loading')}
          </M3Banner>
          <M3Banner tone="warn" className="mt-2 !py-1">
            {d('ImportantInformation.Weather.MetarParsingError')}
          </M3Banner>
          <span className="mt-2 text-xs font-semibold text-m3-muted">{d('YourFlight.SimBriefDataNotYetLoaded')}</span>
          <span className="text-xs font-bold text-m3-primary-light">
            {d('ImportantInformation.TT.RearrangeWidgets')}
          </span>
        </div>
      </div>
    </div>
  );
};

/** The contrast of the theme's text and component pairs (the fixed alert pairs left out), with the AA verdict */
const ContrastList = ({
  tokens,
  language,
  footer,
}: {
  tokens: M3Tokens;
  language: string;
  footer: React.ReactNode;
}) => (
  <div className="ml-4 flex min-w-0 flex-1 flex-col">
    <span className="mb-1 text-xs font-bold uppercase tracking-widest text-m3-muted">
      {tt('Settings.flyPad.ThemePalette.Contrast', language)}
    </span>
    {checkPalette(tokens)
      .filter((check) => !check.fixed)
      .map((check) => (
        <div key={check.key} className="flex h-7 flex-row items-center">
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
              check.pass
                ? 'bg-m3-primary-container text-m3-on-primary-container'
                : 'bg-m3-error-container text-m3-on-error'
            }`}
          >
            {tt(`Settings.flyPad.ThemePalette.${check.pass ? 'Pass' : 'Fail'}`, language)}
          </span>
        </div>
      ))}
    <div className="grow" />
    {footer}
  </div>
);

/**
 * The theme settings of Settings > flyPad: the preset (Blue, Dark, Light) or Custom; a custom theme has a base, a
 * primary and a secondary color (swatches or a hex code), a preview and its contrast checks. Colors near the alert
 * hues are offered for neither and refused as hex codes.
 */
export const ThemeSettings = ({ language }: { language: string }) => {
  const [themeChoice, , setThemeChoice] = useThemeChoice();
  // the slot the hex field is open for, and why the last code was refused
  const [hexSlot, setHexSlot] = useState<ColourSlot | null>(null);
  const [hexError, setHexError] = useState<string | null>(null);

  const s = (key: string) => tt(`Settings.flyPad.ThemePalette.${key}`, language);
  const custom: CustomTheme | null = themeChoice.kind === 'custom' ? themeChoice : null;

  const selectPreset = (preset: ThemePreset) => {
    setHexSlot(null);
    setHexError(null);
    setThemeChoice({ kind: 'preset', preset });
  };

  // Custom starts from the preset shown: its base and its primary, one colour (the same look until a colour is picked)
  const selectCustom = () => {
    if (themeChoice.kind === 'preset') {
      const { preset } = themeChoice;
      setThemeChoice({ kind: 'custom', base: PRESET_BASE[preset], primary: PRESET_SEED[preset], secondary: null });
    }
  };

  const updateCustom = (change: Partial<Omit<CustomTheme, 'kind'>>) => {
    if (custom) {
      setThemeChoice({ ...custom, ...change });
    }
  };

  const toggleHexSlot = (slot: ColourSlot) => {
    setHexError(null);
    setHexSlot(hexSlot === slot ? null : slot);
  };

  /** A hex code typed for the open slot: applied, or refused with the reason */
  const applyHex = (text: string) => {
    if (!hexSlot || text.trim() === '') {
      return;
    }
    const hex = parseHexColour(text);
    if (hex === null) {
      setHexError(s('HexInvalid'));
    } else if (alertHueClash(hex) !== null) {
      setHexError(s('HexAlertHue'));
    } else {
      setHexError(null);
      updateCustom(hexSlot === 'primary' ? { primary: hex } : { secondary: hex });
    }
  };

  const themeButtons: { name: string; selected: boolean; onSelect: () => void }[] = [
    ...(['blue', 'dark', 'light'] as const).map((preset) => ({
      name: tt(`Settings.flyPad.${{ blue: 'Blue', dark: 'Dark', light: 'Light' }[preset]}`, language),
      selected: themeChoice.kind === 'preset' && themeChoice.preset === preset,
      onSelect: () => selectPreset(preset),
    })),
    { name: tt('Settings.flyPad.Custom', language), selected: custom !== null, onSelect: selectCustom },
  ];

  const bases: { base: ThemeBase; name: string }[] = [
    { base: 'grey', name: s('Gray') },
    { base: 'black', name: s('Black') },
    { base: 'light', name: s('Light') },
  ];

  const slotColour =
    custom && hexSlot ? (hexSlot === 'primary' ? custom.primary : custom.secondary ?? custom.primary) : '';

  return (
    <>
      <SettingItem
        name={tt('Settings.flyPad.Theme', language)}
        description={tt('Settings.flyPad.ThemeDescription', language)}
      >
        <SelectGroup>
          {themeButtons.map((button) => (
            <SelectItem key={button.name} onSelect={button.onSelect} selected={button.selected}>
              {button.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SettingItem>

      {custom && (
        <>
          <SettingItem name={s('Base')} description={s('BaseDescription')}>
            <SelectGroup>
              {bases.map(({ base, name }) => (
                <SelectItem key={base} onSelect={() => updateCustom({ base })} selected={custom.base === base}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SettingItem>

          <SettingItem name={s('PrimaryColor')} description={s('PrimaryDescription')}>
            <div className="flex flex-row items-center space-x-1">
              {OFFERED_SWATCHES.map((swatch) => (
                <Swatch
                  key={swatch.hex}
                  hex={swatch.hex}
                  name={swatch.name}
                  size={28}
                  selected={custom.primary === swatch.hex}
                  onSelect={() => updateCustom({ primary: swatch.hex })}
                />
              ))}
              <HexButton open={hexSlot === 'primary'} label={s('EditHex')} onClick={() => toggleHexSlot('primary')} />
            </div>
          </SettingItem>

          <SettingItem name={s('SecondaryColor')} description={s('SecondaryDescription')}>
            <div className="flex flex-row items-center space-x-1">
              <button
                type="button"
                onClick={() => updateCustom({ secondary: null })}
                className={`mr-1 flex h-9 shrink-0 items-center rounded-xl px-3 ${
                  custom.secondary === null
                    ? 'bg-m3-primary-container text-m3-on-primary-container'
                    : 'border border-m3-outline bg-transparent text-m3-text hover:bg-m3-tile'
                }`}
              >
                <span className="text-sm font-semibold text-current">{s('Same')}</span>
              </button>
              {OFFERED_SWATCHES.map((swatch) => (
                <Swatch
                  key={swatch.hex}
                  hex={swatch.hex}
                  name={swatch.name}
                  size={24}
                  selected={custom.secondary === swatch.hex}
                  onSelect={() => updateCustom({ secondary: swatch.hex })}
                />
              ))}
              <HexButton
                open={hexSlot === 'secondary'}
                label={s('EditHex')}
                onClick={() => toggleHexSlot('secondary')}
              />
            </div>
          </SettingItem>

          {hexSlot && (
            <SettingItem
              name={s(hexSlot === 'primary' ? 'CustomPrimary' : 'CustomSecondary')}
              description={hexError ?? s('HexDescription')}
              descriptionTone={hexError ? 'error' : undefined}
            >
              <div className="flex flex-row items-center">
                <SimpleInput
                  className="w-36 text-center"
                  fontSizeClassName="text-base"
                  value={slotColour.toUpperCase()}
                  uppercase
                  maxLength={7}
                  onBlur={applyHex}
                />
                <span
                  className="ml-3 h-8 w-8 shrink-0 rounded-full border border-m3-outline"
                  style={{ backgroundColor: slotColour }}
                />
              </div>
            </SettingItem>
          )}

          <div className="flex flex-row py-4">
            <ThemePreview language={language} />
            <ContrastList
              tokens={themeTokens(themeChoice)}
              language={language}
              footer={
                <div className="mt-2 flex flex-row justify-end">
                  <M3Button tone="outline" className="!h-10 !rounded-xl !text-sm" onClick={() => selectPreset('blue')}>
                    <span className="text-sm font-bold text-current">{s('ResetToBlue')}</span>
                  </M3Button>
                </div>
              }
            />
          </div>
        </>
      )}
    </>
  );
};
