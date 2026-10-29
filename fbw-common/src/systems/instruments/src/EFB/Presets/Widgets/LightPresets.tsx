// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useRef, useState } from 'react';
import { useSimVar, usePersistentNumberProperty, usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import { ExclamationTriangle, Moon, Pencil, PlayFill, Save, Sun, Sunset } from 'react-bootstrap-icons';
import { Toggle } from '../../UtilComponents/Form/Toggle';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { t } from '../../Localization/translation';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { PromptModal, useModals } from '../../UtilComponents/Modals/Modals';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { M3_INPUT } from '../../UtilComponents/Material/Material';
import { DashboardCard } from '../../Dashboard/Cards/CardParts';
import { buildPresetSelectionOptions, PRESET_IDS } from './presetSelectionOptions';
import {
  AutoLoadAssignment,
  autoLoadTags,
  normalizePresetName,
  presetLabel,
  TimeOfDay,
  timeOfDayFromSimValue,
} from './lightPresetSlots';

const TIME_OF_DAY_ICON_SIZE = 12;

const timeOfDayIcon = (timeOfDay: TimeOfDay, size: number) => {
  switch (timeOfDay) {
    case 'day':
      return <Sun size={size} />;
    case 'dawnDusk':
      return <Sunset size={size} />;
    default:
      return <Moon size={size} />;
  }
};

const timeOfDayName = (timeOfDay: TimeOfDay) => {
  switch (timeOfDay) {
    case 'day':
      return t('Presets.InteriorLighting.AutoLoadDay').replace(/:$/, '');
    case 'dawnDusk':
      return t('Presets.InteriorLighting.AutoLoadDawnDusk').replace(/:$/, '');
    default:
      return t('Presets.InteriorLighting.AutoLoadNight').replace(/:$/, '');
  }
};

export const LightPresets = () => {
  // Manage names for presets in EFB only and always map them to the
  // preset IDs used in the WASM implementation.
  const [storedNames, setStoredNames] = usePersistentProperty('LIGHT_PRESET_NAMES', '');
  const [namesMap, setNamesMap] = useState(new Map<number, string>());

  // Only allow loading and saving when aircraft is powered
  const [isPowered] = useSimVar('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'number', 200);

  // TIME OF DAY enum : 1 = Day ; 2 = Dusk/Dawn ; 3 = Night
  const [timeOfDayValue] = useSimVar('E:TIME OF DAY', 'number', 5000);
  const currentTimeOfDay = timeOfDayFromSimValue(timeOfDayValue);

  const [autoLoadPreset, setAutoLoadPreset] = usePersistentNumberProperty('LIGHT_PRESET_AUTOLOAD', 0);
  const [autoLoadDayPresetID, setAutoLoadDayPresetID] = usePersistentNumberProperty('LIGHT_PRESET_AUTOLOAD_DAY', 0);
  const [autoLoadDawnDuskPresetID, setAutoLoadDawnDuskPresetID] = usePersistentNumberProperty(
    'LIGHT_PRESET_AUTOLOAD_DAWNDUSK',
    0,
  );
  const [autoLoadNightPresetID, setAutoLoadNightPresetID] = usePersistentNumberProperty(
    'LIGHT_PRESET_AUTOLOAD_NIGHT',
    0,
  );
  const assignment: AutoLoadAssignment = {
    day: autoLoadDayPresetID,
    dawnDusk: autoLoadDawnDuskPresetID,
    night: autoLoadNightPresetID,
  };

  const storePresetName = (presetID: number, name: string) => {
    const updatedNames = new Map(namesMap);
    updatedNames.set(presetID, name);
    setNamesMap(updatedNames);
    setStoredNames(JSON.stringify(updatedNames, replacer));
  };

  // Used by JSON.stringify for converting a Map to a Json string
  function replacer(_key: any, value: any[]) {
    if (value instanceof Map) {
      return {
        dataType: 'Map',
        value: Array.from(value.entries()), // or with spread: value: [...value]
      };
    }
    return value;
  }

  // Used by JSON.parse for converting a Json string to a Map
  function reviver(_key: any, value: { dataType: string; value: Iterable<readonly [unknown, unknown]> }) {
    if (typeof value === 'object' && value !== null) {
      if (value.dataType === 'Map') {
        return new Map(value.value);
      }
    }
    return value;
  }

  // Called once to initially load the preset names map from the persistent store
  useEffect(() => {
    try {
      const newValue = JSON.parse(storedNames, reviver);
      setNamesMap(newValue);
    } catch {
      setNamesMap(new Map());
    }
  }, []);

  const presetSelectionOptions = buildPresetSelectionOptions(namesMap, t);

  const autoLoadCell = (timeOfDay: TimeOfDay, value: number, onChange: (value: number) => void, first: boolean) => {
    const now = timeOfDay === currentTimeOfDay;
    return (
      <div
        className={`flex h-12 min-w-0 flex-1 flex-row items-center rounded-sm border px-2.5 ${first ? '' : 'ml-2.5'} ${
          now ? 'border-m3-primary bg-m3-primary-container' : 'border-m3-outline bg-transparent'
        }`}
      >
        <span className={`shrink-0 ${now ? 'text-m3-on-primary-container' : 'text-m3-muted'}`}>
          {timeOfDayIcon(timeOfDay, 18)}
        </span>
        <div className="ml-2 flex w-20 shrink-0 flex-col">
          <span
            className={`truncate text-sm font-bold leading-tight ${now ? 'text-m3-on-primary-container' : 'text-m3-muted'}`}
          >
            {timeOfDayName(timeOfDay)}
          </span>
          {now && (
            <span className="text-xs font-extrabold uppercase leading-tight tracking-widest text-m3-on-primary-container">
              {t('Presets.InteriorLighting.Now')}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <SelectInput
            className={`h-8 w-full ${M3_INPUT}`}
            fontSizeClassName="text-sm"
            options={presetSelectionOptions}
            value={value}
            dropdownOnTop
            onChange={(newPreset) => onChange(newPreset as number)}
          />
        </div>
      </div>
    );
  };

  return (
    <DashboardCard
      title={t('Presets.InteriorLighting.Title')}
      section="cabin"
      className="min-h-0 flex-1"
      bodyClassName=""
      trailing={
        <>
          <span className="dashboard-header-title whitespace-nowrap text-sm font-semibold">
            {t('Presets.InteriorLighting.AutoLoad')}
          </span>
          <Toggle value={!!autoLoadPreset} onToggle={(value) => setAutoLoadPreset(value ? 1 : 0)} />
        </>
      }
    >
      {!isPowered && (
        <div className="flex h-9 shrink-0 flex-row items-center bg-m3-error-container px-3.5">
          <ExclamationTriangle size={16} className="shrink-0 text-m3-on-error" />
          <span className="ml-2 truncate text-sm font-semibold text-m3-on-error">
            {t('Presets.InteriorLighting.NeedsPower')}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 px-3.5 py-3">
        {[0, 2, 4, 6].map((firstIndex) => (
          <div key={firstIndex} className={`flex flex-row ${firstIndex > 0 ? 'mt-2.5' : ''}`}>
            {PRESET_IDS.slice(firstIndex, firstIndex + 2).map((presetID, column) => (
              <div key={presetID} className={`min-w-0 flex-1 ${column > 0 ? 'ml-2.5' : ''}`}>
                <PresetSlot
                  presetID={presetID}
                  name={namesMap.get(presetID)}
                  tags={autoLoadTags(presetID, assignment)}
                  currentTimeOfDay={currentTimeOfDay}
                  isPowered={!!isPowered}
                  storePresetName={storePresetName}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex shrink-0 flex-row items-center border-t border-m3-outline bg-m3-card-low px-3.5 py-3">
        <span className="mr-3 w-36 shrink-0 text-xs font-extrabold uppercase leading-snug tracking-wider text-m3-muted">
          {t('Presets.InteriorLighting.AutoLoadAtPowerUp')}
        </span>
        {autoLoadCell('day', autoLoadDayPresetID, setAutoLoadDayPresetID, true)}
        {autoLoadCell('dawnDusk', autoLoadDawnDuskPresetID, setAutoLoadDawnDuskPresetID, false)}
        {autoLoadCell('night', autoLoadNightPresetID, setAutoLoadNightPresetID, false)}
      </div>
    </DashboardCard>
  );
};

type PresetSlotProps = {
  presetID: number;
  name: string | undefined;
  tags: TimeOfDay[];
  currentTimeOfDay: TimeOfDay | null;
  isPowered: boolean;
  storePresetName: (presetID: number, value: string) => void;
};

// One slot: preset number, name (renamed in place), auto-load tags, save and load
const PresetSlot = (props: PresetSlotProps) => {
  const { showModal } = useModals();

  // Light presets are handled in a wasm module as setting the indexed "LIGHT POTENTIOMETER"
  // variable didn't work in Javascript.
  // To tell the presets.wasm module to load a preset the LVAR "L:A32NX_LIGHTING_PRESET_LOAD"
  // needs to be set with a number > 0 where the number is the corresponding preset ID to be loaded.
  // If a preset is not defined for this number a default preset (all lights at 50%, the A32NX dome light off) will be loaded.
  // To tell the presets.wasm module to save a preset the LVAR "L:A32NX_LIGHTING_PRESET_SAVE"
  // needs to be set with a number > 0 where the number is the corresponding preset ID to be saved..
  // After loading or saving the wasm module will reset the LVARs to 0.

  const [, setLoadPresetVar] = useSimVar('L:A32NX_LIGHTING_PRESET_LOAD', 'number', 200);
  const [, setSavePresetVar] = useSimVar('L:A32NX_LIGHTING_PRESET_SAVE', 'number', 200);

  const [editing, setEditing] = useState(false);
  // Enter and the blur it causes both end the edit: only the first one counts
  const editOpen = useRef(false);

  const named = !!props.name;
  const label = presetLabel(props.presetID, props.name, t);

  // Sets the LVAR to tell the wasm to load the preset into the aircraft
  const loadPreset = (presetID: number) => {
    // loading of presets only allowed when aircraft is powered (also the case in the wasm)
    if (props.isPowered) {
      setLoadPresetVar(presetID);
      toast.success(`${t('Presets.InteriorLighting.LoadingPreset')}: ${presetID}: ${label}`, {
        autoClose: 250,
        hideProgressBar: true,
        closeButton: false,
      });
    } else {
      toast.warning(t('Presets.InteriorLighting.AircraftNeedsToBePoweredToLoadPresets'), {
        autoClose: 1000,
        hideProgressBar: true,
        closeButton: false,
      });
    }
  };

  // Sets the LVAR to tell the wasm to save the current lighting setting into the preset
  const savePreset = (presetID: number) => {
    // Saving of presets only allowed when aircraft is powered (also the case in the wasm)
    if (props.isPowered) {
      showModal(
        <PromptModal
          title={label}
          bodyText={`${t('Presets.InteriorLighting.PleaseConfirmSavingPreset')} ${presetID}: ${label}`}
          onConfirm={() => {
            setSavePresetVar(presetID);
            toast.success(`${t('Presets.InteriorLighting.SavingPreset')}: ${presetID}: ${label}`, {
              autoClose: 250,
              hideProgressBar: true,
              closeButton: false,
            });
          }}
        />,
      );
    } else {
      toast.warning(t('Presets.InteriorLighting.AircraftNeedsToBePoweredToSavePresets'), {
        autoClose: 1000,
        hideProgressBar: true,
        closeButton: false,
      });
    }
  };

  const startEditing = () => {
    editOpen.current = true;
    setEditing(true);
  };

  const finishEditing = (typedName: string | null) => {
    if (!editOpen.current) {
      return;
    }
    editOpen.current = false;
    setEditing(false);
    if (typedName !== null) {
      const newName = normalizePresetName(typedName);
      if (newName !== (props.name ?? '')) {
        props.storePresetName(props.presetID, newName);
      }
    }
  };

  const disabledLook = props.isPowered ? '' : 'opacity-40';

  const secondLine = () => {
    if (editing) {
      return (
        <span className="mt-1 text-xs text-m3-on-primary-container">{t('Presets.InteriorLighting.RenameHint')}</span>
      );
    }
    if (props.tags.length > 0) {
      return (
        <div className="mt-1 flex flex-row">
          {props.tags.map((timeOfDay, index) => {
            const now = timeOfDay === props.currentTimeOfDay;
            return (
              <span
                key={timeOfDay}
                className={`inline-flex h-5 items-center rounded-sm px-1.5 ${index > 0 ? 'ml-1' : ''} ${
                  now ? 'bg-m3-primary-container text-m3-on-primary-container' : 'bg-m3-tile text-m3-muted'
                }`}
              >
                {timeOfDayIcon(timeOfDay, TIME_OF_DAY_ICON_SIZE)}
                <span className="ml-1 text-xs font-bold text-current">{timeOfDayName(timeOfDay)}</span>
              </span>
            );
          })}
        </div>
      );
    }
    return (
      <span className="mt-1 text-xs text-m3-muted">
        {named ? t('Presets.InteriorLighting.NoAutoLoad') : t('Presets.InteriorLighting.NotNamedYet')}
      </span>
    );
  };

  return (
    <div className="flex h-[72px] flex-row items-center overflow-hidden rounded-sm border border-m3-outline bg-m3-card-low pr-2.5">
      <span
        className={`flex h-full w-11 shrink-0 items-center justify-center border-r border-m3-outline bg-m3-tile text-lg font-extrabold ${
          named ? 'text-m3-text' : 'text-m3-muted'
        }`}
      >
        {props.presetID}
      </span>

      <div className="flex min-w-0 flex-1 flex-col px-3">
        {editing ? (
          <SimpleInput
            className={`h-8 w-full ${M3_INPUT}`}
            fontSizeClassName="text-base"
            value={props.name ?? ''}
            maxLength={16}
            autoFocus
            onBlur={(value) => finishEditing(value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || event.keyCode === 27) {
                finishEditing(null);
              } else if (event.key === 'Enter' || event.keyCode === 13) {
                finishEditing(event.currentTarget.value);
              }
            }}
          />
        ) : (
          <TooltipWrapper text={t('Presets.InteriorLighting.TT.ClickTextToChangeThePresetsName')}>
            <div className="flex min-w-0 flex-row">
              <button
                type="button"
                className="flex min-w-0 flex-row items-center bg-transparent text-left"
                onClick={startEditing}
              >
                <span
                  className={`truncate text-base ${named ? 'font-bold text-m3-text' : 'font-semibold text-m3-muted'}`}
                >
                  {label}
                </span>
                <Pencil size={13} className="ml-1.5 shrink-0 text-m3-muted" />
              </button>
            </div>
          </TooltipWrapper>
        )}
        {secondLine()}
      </div>

      <TooltipWrapper
        text={
          props.isPowered
            ? t('Presets.InteriorLighting.TT.SaveTheCurrentLightingLevels')
            : t('Presets.InteriorLighting.TT.AircraftMustBePowered')
        }
      >
        <div>
          <button
            type="button"
            aria-label={t('Presets.InteriorLighting.SavePreset')}
            className={`flex h-10 w-10 items-center justify-center rounded-sm border border-m3-outline bg-transparent text-m3-text transition duration-100 hover:bg-m3-tile ${disabledLook}`}
            onClick={() => savePreset(props.presetID)}
          >
            <Save size={18} />
          </button>
        </div>
      </TooltipWrapper>

      <TooltipWrapper
        text={
          props.isPowered
            ? t('Presets.InteriorLighting.TT.LoadThisPreset')
            : t('Presets.InteriorLighting.TT.AircraftMustBePowered')
        }
      >
        <div className="ml-2">
          <button
            type="button"
            className={`flex h-10 items-center whitespace-nowrap rounded-sm bg-m3-primary-container px-4 text-m3-on-primary-container transition duration-100 hover:brightness-110 ${disabledLook}`}
            onClick={() => loadPreset(props.presetID)}
          >
            <PlayFill size={14} />
            <span className="ml-2 text-sm font-bold text-current">{t('Presets.InteriorLighting.Load')}</span>
          </button>
        </div>
      </TooltipWrapper>
    </div>
  );
};
