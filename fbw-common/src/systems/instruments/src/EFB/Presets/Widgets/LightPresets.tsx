// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useState } from 'react';
import { useSimVar, usePersistentNumberProperty, usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import { Toggle } from '../../UtilComponents/Form/Toggle';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { t } from '../../Localization/translation';
import { ScrollableContainer } from '../../UtilComponents/ScrollableContainer';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { PromptModal, useModals } from '../../UtilComponents/Modals/Modals';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { PlayFill, Save } from 'react-bootstrap-icons';
import { M3_INPUT, M3Card, M3SectionHeader } from '../../UtilComponents/Material/Material';

export const LightPresets = () => {
  // Manage names for presets in EFB only and always map them to the
  // preset IDs used in the WASM implementation.
  const [storedNames, setStoredNames] = usePersistentProperty('LIGHT_PRESET_NAMES', '');
  const [namesMap, setNamesMap] = useState(new Map<number, string>());

  // Only allow loading and saving when aircraft is powered
  const [isPowered] = useSimVar('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'number', 200);

  // called by the SinglePreset Component to get its assigned name
  const getPresetName = (presetID: number): string | undefined => namesMap.get(presetID);

  // Called by the SinglePreset Component to store its preset name after a name change
  const storePresetName = (presetID: number, name: string) => {
    namesMap.set(presetID, name);
    const tmpJson = JSON.stringify(namesMap, replacer);
    setStoredNames(tmpJson);
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

  return (
    <div className="flex h-content-section-reduced flex-row overflow-hidden">
      <M3Card className="mr-4 min-w-0 flex-1 pb-3">
        <M3SectionHeader
          title={t('Presets.InteriorLighting.Presets')}
          trailing={
            <span className={`text-sm font-semibold ${isPowered ? 'text-m3-muted' : 'text-m3-on-warn'}`}>
              {isPowered
                ? t('Presets.InteriorLighting.SelectAnInteriorLightingPresetToLoadOrSave')
                : t('Presets.InteriorLighting.TheAircraftMustBePoweredForInteriorLightingPresets')}
            </span>
          }
        />
        <div className="min-h-0 flex-1 px-2">
          <ScrollableContainer height={47}>
            {/* These the IDs for each row of presets. Add or remove numbers to add or remove rows */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <SinglePreset
                key={i}
                presetID={i}
                getPresetName={getPresetName}
                storePresetName={storePresetName}
                namesMap={namesMap}
              />
            ))}
          </ScrollableContainer>
        </div>
      </M3Card>
      <div className="flex w-[400px] shrink-0 flex-col">
        <AutoLoadConfiguration namesMap={namesMap} storedNames={storedNames} />
      </div>
    </div>
  );
};

type AutoLoadConfigurationProps = {
  namesMap: Map<number, string>;
  storedNames: string;
};

const AutoLoadConfiguration = (props: AutoLoadConfigurationProps) => {
  const [autoLoadPreset, setAutoLoadPreset] = usePersistentNumberProperty('LIGHT_PRESET_AUTOLOAD', 0);

  // State for persistent copy of autoload preset IDs
  const [autoLoadDayPresetID, setAutoLoadDayPresetID] = usePersistentNumberProperty('LIGHT_PRESET_AUTOLOAD_DAY', 0);
  const [autoLoadDawnDuskPresetID, setAutoLoadDawnDuskPresetID] = usePersistentNumberProperty(
    'LIGHT_PRESET_AUTOLOAD_DAWNDUSK',
    0,
  );
  const [autoLoadNightPresetID, setAutoLoadNightPresetID] = usePersistentNumberProperty(
    'LIGHT_PRESET_AUTOLOAD_NIGHT',
    0,
  );

  const [presetSelectionOptions, setPresetSelectionOptions] = useState([
    { value: 0, displayValue: t('Presets.InteriorLighting.AutoLoadNoneSelection') },
  ]);

  // Creates the option list for the selections, ignoring any that are the default NoName title
  const generatePresetSelectionOptions = () => {
    const options: Array<{ value: number; displayValue: string }> = [
      { value: 0, displayValue: t('Presets.InteriorLighting.AutoLoadNoneSelection') },
    ];
    props.namesMap.forEach((value, key) => {
      options.push({ value: key, displayValue: value });
    });
    return options;
  };

  useEffect(() => {
    setPresetSelectionOptions(generatePresetSelectionOptions());
  }, []);

  useEffect(() => {
    setPresetSelectionOptions(generatePresetSelectionOptions());
  }, [props.namesMap, props.storedNames]);

  const autoLoadRow = (name: string, value: number, onChange: (value: number) => void) => (
    <div className="mt-3 flex flex-row items-center">
      <span className="w-28 shrink-0 text-sm font-semibold text-m3-text">{name.replace(/:$/, '')}</span>
      <div className="min-w-0 flex-1">
        <SelectInput
          className={`h-10 w-full ${M3_INPUT}`}
          fontSizeClassName="text-base"
          options={presetSelectionOptions}
          value={value}
          onChange={(newPreset) => onChange(newPreset as number)}
        />
      </div>
    </div>
  );

  return (
    <M3Card className="!overflow-visible p-4">
      <div className="flex flex-row items-center">
        <span className="grow text-base font-bold text-m3-text">
          {t('Presets.InteriorLighting.AutoLoadLightingPreset').replace(/:$/, '')}
        </span>
        <Toggle value={!!autoLoadPreset} onToggle={(value) => setAutoLoadPreset(value ? 1 : 0)} />
      </div>
      {autoLoadRow(t('Presets.InteriorLighting.AutoLoadDay'), autoLoadDayPresetID, setAutoLoadDayPresetID)}
      {autoLoadRow(
        t('Presets.InteriorLighting.AutoLoadDawnDusk'),
        autoLoadDawnDuskPresetID,
        setAutoLoadDawnDuskPresetID,
      )}
      {autoLoadRow(t('Presets.InteriorLighting.AutoLoadNight'), autoLoadNightPresetID, setAutoLoadNightPresetID)}
    </M3Card>
  );
};

type SinglePresetParams = {
  presetID: number;
  getPresetName: (presetID: number) => string | undefined;
  storePresetName: (presetID: number, value: string) => void;
  namesMap: Map<number, string>;
};

// One single row of preset with ID, name, load and save
const SinglePreset = (props: SinglePresetParams) => {
  const { showModal } = useModals();

  // Light presets are handled in a wasm module as setting the indexed "LIGHT POTENTIOMETER"
  // variable didn't work in Javascript.
  // To tell the presets.wasm module to load a preset the LVAR "L:A32NX_LIGHTING_PRESET_LOAD"
  // needs to be set with a number > 0 where the number is the corresponding preset ID to be loaded.
  // If a preset is not defined for this number a default preset (all lights at 50%) will be loaded.
  // To tell the presets.wasm module to save a preset the LVAR "L:A32NX_LIGHTING_PRESET_SAVE"
  // needs to be set with a number > 0 where the number is the corresponding preset ID to be saved..
  // After loading or saving the wasm module will reset the LVARs to 0.

  const [, setLoadPresetVar] = useSimVar('L:A32NX_LIGHTING_PRESET_LOAD', 'number', 200);
  const [, setSavePresetVar] = useSimVar('L:A32NX_LIGHTING_PRESET_SAVE', 'number', 200);

  // Only allow loading and saving when aircraft is powered
  const [isPowered] = useSimVar('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'number', 200);

  // Sets the LVAR to tell the wasm to load the preset into the aircraft
  const loadPreset = (presetID: number) => {
    // loading of presets only allowed when aircraft is powered (also the case in the wasm)
    if (isPowered) {
      setLoadPresetVar(presetID);
      toast.success(`${t('Presets.InteriorLighting.LoadingPreset')}: ${presetID}: ${presetName}`, {
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
    if (isPowered) {
      showModal(
        <PromptModal
          title={`${presetName}`}
          bodyText={`${t('Presets.InteriorLighting.PleaseConfirmSavingPreset')} ${presetID}: ${presetName}`}
          onConfirm={() => {
            setSavePresetVar(presetID);
            toast.success(`${t('Presets.InteriorLighting.SavingPreset')}: ${presetID}: ${presetName}`, {
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

  // User specified name for the current preset
  const [presetName, setPresetName] = useState('');

  // Sets the preset name locally and stores it into the parent persistent storage
  const changePresetName = (oldName: string, newName: string): void => {
    if (oldName === newName) {
      return;
    }
    props.storePresetName(props.presetID, newName);
    setPresetName(newName);
    showModal(
      <PromptModal
        title={t('Presets.InteriorLighting.NewNameConfirmationDialogMsg')}
        bodyText={`${oldName} => ${newName}`}
        onCancel={() => {
          setPresetName(oldName);
          props.storePresetName(props.presetID, oldName);
        }}
      />,
    );
  };

  const handleLoad = () => loadPreset(props.presetID);
  const handleSave = () => savePreset(props.presetID);

  // Get preset name from persistent store when the names map changes
  useEffect(() => {
    const tmp = props.getPresetName(props.presetID);
    setPresetName(tmp || t('Presets.InteriorLighting.NoName'));
  }, [props.namesMap, presetName]);

  return (
    <div className="flex h-14 flex-row items-center px-2">
      <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-m3-tile text-base font-bold text-white">
        {props.presetID}
      </span>

      <TooltipWrapper text={t('Presets.InteriorLighting.TT.ClickTextToChangeThePresetsName')}>
        <div className="min-w-0 grow">
          <SimpleInput
            className={`w-full ${M3_INPUT}`}
            fontSizeClassName="text-base"
            placeholder={t('Presets.InteriorLighting.NoName')}
            value={presetName}
            onBlur={(value) => changePresetName(presetName, value)}
            maxLength={16}
          />
        </div>
      </TooltipWrapper>

      <TooltipWrapper
        text={
          isPowered
            ? t('Presets.InteriorLighting.TT.LoadThisPreset')
            : t('Presets.InteriorLighting.TT.AircraftMustBePowered')
        }
      >
        <div className="ml-3">
          <button
            type="button"
            className={`flex h-10 items-center whitespace-nowrap rounded-xl bg-m3-primary-container px-4 text-sm font-bold text-m3-on-primary-container transition duration-100 hover:brightness-110 ${!isPowered && 'opacity-40'}`}
            onClick={() => handleLoad()}
          >
            <PlayFill size={14} className="mr-2" />
            {t('Presets.InteriorLighting.LoadPreset')}
          </button>
        </div>
      </TooltipWrapper>

      <TooltipWrapper
        text={
          isPowered
            ? t('Presets.InteriorLighting.TT.SaveTheCurrentLightingLevels')
            : t('Presets.InteriorLighting.TT.AircraftMustBePowered')
        }
      >
        <div className="ml-2">
          <button
            type="button"
            className={`flex h-10 items-center whitespace-nowrap rounded-xl border border-m3-outline bg-transparent px-4 text-sm font-bold text-m3-text transition duration-100 hover:bg-m3-tile ${!isPowered && 'opacity-40'}`}
            onClick={() => handleSave()}
          >
            <Save size={14} className="mr-2" />
            {t('Presets.InteriorLighting.SavePreset')}
          </button>
        </div>
      </TooltipWrapper>
    </div>
  );
};
