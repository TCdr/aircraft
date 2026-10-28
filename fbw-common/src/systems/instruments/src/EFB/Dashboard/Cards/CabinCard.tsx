// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useContext, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import Slider from 'rc-slider';
import { toast } from 'react-toastify';
import { usePersistentNumberProperty, usePersistentProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { AircraftContext } from '../../AircraftContext';
import { SelectInput } from '../../UtilComponents/Form/SelectInput/SelectInput';
import { M3_INPUT, M3Switch } from '../../UtilComponents/Material/Material';
import { PRESET_IDS } from '../../Presets/Widgets/presetSelectionOptions';
import { CardButton, HEADER_TITLE, PANEL_FRAME, sectionHeaderClass } from './CardParts';

/** The preset names as the Interior Lighting page stores them (a Map serialised with its own replacer) */
const parsePresetNames = (stored: string): Map<number, string> => {
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.dataType === 'Map' && Array.isArray(parsed.value)) {
      return new Map<number, string>(parsed.value);
    }
  } catch (_) {
    // no names stored yet
  }
  return new Map<number, string>();
};

/** Only the cabin controls the flyPad can drive on this aircraft, on one slim row under the checklists */
export const CabinCard: FC<{ className?: string }> = ({ className }) => {
  const history = useHistory();
  const { cabinLighting } = useContext(AircraftContext).settingsPages.sim;

  const [storedNames] = usePersistentProperty('LIGHT_PRESET_NAMES', '');
  const names = useMemo(() => parsePresetNames(storedNames), [storedNames]);
  const [, setLoadPreset] = useSimVar('L:A32NX_LIGHTING_PRESET_LOAD', 'number', 200);
  const [isPowered] = useSimVar('L:A32NX_ELEC_AC_1_BUS_IS_POWERED', 'number', 500);
  const [selectedPreset, setSelectedPreset] = useState(0);

  const [boardingMusic, setBoardingMusic] = usePersistentNumberProperty('SOUND_BOARDING_MUSIC_ENABLED', 1);
  const [announcements, setAnnouncements] = usePersistentNumberProperty('SOUND_ANNOUNCEMENTS_ENABLED', 1);
  const [cabinBrightness, setCabinBrightness] = usePersistentNumberProperty('CABIN_MANUAL_BRIGHTNESS', 0);
  const [cabinAuto, setCabinAuto] = usePersistentNumberProperty('CABIN_USING_AUTOBRIGHTNESS', 1);
  const [cabinAutoBrightness] = useSimVar('L:A32NX_CABIN_AUTOBRIGHTNESS', 'number', 500);
  const sliderRef = useRef<any>(null);

  const presetOptions = PRESET_IDS.map((id) => ({
    value: id,
    displayValue: `${id} - ${names.get(id) || t('Presets.InteriorLighting.NoName')}`,
  }));

  const loadPreset = (id: number) => {
    setSelectedPreset(id);
    // The presets module loads only with the aircraft powered, as on the Interior Lighting page
    if (isPowered) {
      setLoadPreset(id);
    } else {
      toast.warning(t('Presets.InteriorLighting.AircraftNeedsToBePoweredToLoadPresets'), {
        autoClose: 1000,
        hideProgressBar: true,
        closeButton: false,
      });
    }
  };

  return (
    // No overflow clip here: the preset list opens upwards over the checklists panel
    <div className={`flex shrink-0 flex-row items-stretch ${PANEL_FRAME} ${className ?? ''}`}>
      {/* The row is too slim for a header bar: its title cell on the left takes the header look */}
      <div
        className={`flex shrink-0 flex-row items-center border-r border-m3-outline px-3 ${sectionHeaderClass('cabin')}`}
      >
        <span className={HEADER_TITLE}>{t('Dashboard.Cabin.Title')}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-row items-center px-3 py-2">
        <SelectInput
          className={`w-36 shrink-0 ${M3_INPUT}`}
          fontSizeClassName="text-xs"
          value={selectedPreset}
          options={[{ value: 0, displayValue: t('Dashboard.Cabin.ChoosePreset') }, ...presetOptions]}
          onChange={(value) => loadPreset(value as number)}
          maxHeight={20}
          dropdownOnTop
        />
        {cabinLighting ? (
          <>
            <span className="ml-2 min-w-0 truncate text-sm text-m3-text">{t('Dashboard.Cabin.Auto')}</span>
            <div className="ml-2 flex shrink-0">
              <M3Switch value={cabinAuto === 1} onToggle={(value) => setCabinAuto(value ? 1 : 0)} />
            </div>
            {/* The handle is centred on the rail ends: the padding keeps half a handle inside the row */}
            <div
              className={`ml-2 flex min-w-0 flex-1 flex-row items-center px-2 ${cabinAuto === 1 ? 'opacity-40' : ''}`}
            >
              <Slider
                disabled={cabinAuto === 1}
                ref={sliderRef}
                value={cabinAuto === 1 ? cabinAutoBrightness : cabinBrightness}
                min={0}
                max={100}
                onChange={setCabinBrightness}
                onAfterChange={() => sliderRef.current && sliderRef.current.blur()}
                railStyle={{ backgroundColor: 'var(--m3-tile)' }}
                trackStyle={{ backgroundColor: 'var(--m3-primary)' }}
                handleStyle={{ backgroundColor: '#ffffff', borderColor: '#ffffff' }}
              />
            </div>
          </>
        ) : (
          <>
            <span className="ml-2 min-w-0 truncate text-sm text-m3-text">{t('Dashboard.Cabin.Music')}</span>
            <div className="ml-2 flex shrink-0">
              <M3Switch value={boardingMusic === 1} onToggle={(value) => setBoardingMusic(value ? 1 : 0)} />
            </div>
            <span className="ml-2 min-w-0 truncate text-sm text-m3-text">{t('Dashboard.Cabin.Announcements')}</span>
            <div className="ml-2 flex shrink-0">
              <M3Switch value={announcements === 1} onToggle={(value) => setAnnouncements(value ? 1 : 0)} />
            </div>
            <div className="grow" />
          </>
        )}
        <CardButton tone="outline" className="ml-3 !flex-none shrink-0 !px-3" onClick={() => history.push('/presets')}>
          {t('Dashboard.Cabin.Presets')}
        </CardButton>
      </div>
    </div>
  );
};
