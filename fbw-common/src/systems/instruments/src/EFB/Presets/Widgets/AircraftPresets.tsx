// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useState } from 'react';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { PromptModal, t, Toggle, useModals } from '@flybywiresim/flypad';
import { AirplaneEngines, AirplaneFill, LightningCharge, Snow, Truck, X } from 'react-bootstrap-icons';
import { M3Button, M3Card } from '../../UtilComponents/Material/Material';

import { useViewListenerEvent } from '../../Utils/listener';

export const AircraftPresets = () => {
  // Aircraft presets are handled by a backend WASM module. This frontend will
  // use the LVAR A32NX_AIRCRAFT_PRESET_LOAD to signal the backend that the user
  // requests a preset to be loaded.
  // The backend will reset the LVAR to 0 when done.
  // As long as the LVAR is >0, the backend is still applying the preset.
  // If the LVAR is set to 0 before the backend is finished, applying, the preset
  // will be stopped by the backend.
  // A32NX_AIRCRAFT_PRESET_LOAD_EXPEDITE is a LVAR to expedite the loading of the preset
  // by skipping the delay between steps.

  const [simOnGround] = useSimVar('SIM ON GROUND', 'number', 200);
  const [loadPresetVar, setLoadPresetVar] = useSimVar('L:A32NX_AIRCRAFT_PRESET_LOAD', 'number', 200);
  const [loadPresetsExpedite, setLoadPresetsExpedite] = useSimVar(
    'L:A32NX_AIRCRAFT_PRESET_LOAD_EXPEDITE',
    'number',
    250,
  );

  const { showModal } = useModals();

  // State to store the loading progress and the current step description
  const [loadPresetProgress, setLoadPresetProgress] = useState(0);
  const [currentStepDescription, setCurrentStepDescription] = useState('');

  // Callback function to update the loading progress from the WASM module
  const onProgressUpdateFromWasm = (data: string) => {
    const [progressPercentage, currentStep] = data.split(';');
    setLoadPresetProgress(parseFloat(progressPercentage));
    setCurrentStepDescription(currentStep);
  };

  // Register the callback function to receive the loading progress from the WASM module
  useViewListenerEvent('JS_LISTENER_COMM_BUS', 'AIRCRAFT_PRESET_WASM_CALLBACK', onProgressUpdateFromWasm);

  // These need to align with the IDs in the Presets C++ WASM.
  // WASM: src/presets/src/Aircraft/AircraftProcedures.h
  const AircraftPresetsList: { index: number; name: string; icon: React.ReactElement }[] = [
    { index: 1, name: `${t('Presets.AircraftStates.ColdDark')}`, icon: <Snow size={44} /> }, // 'Cold & Dark' },
    { index: 2, name: `${t('Presets.AircraftStates.Powered')}`, icon: <LightningCharge size={44} /> },
    { index: 3, name: `${t('Presets.AircraftStates.ReadyPushback')}`, icon: <Truck size={44} /> },
    { index: 4, name: `${t('Presets.AircraftStates.ReadyTaxi')}`, icon: <AirplaneEngines size={44} /> },
    { index: 5, name: `${t('Presets.AircraftStates.ReadyTakeoff')}`, icon: <AirplaneFill size={44} /> },
  ];

  // Sets the LVAR to tell the wasm to load the preset into the aircraft
  const handleLoadPreset = (presetID: number) => {
    showModal(
      <PromptModal
        title={`${AircraftPresetsList[presetID - 1].name}`}
        bodyText={t('Presets.AircraftStates.ConfirmationDialogMsg')}
        onConfirm={() => setLoadPresetVar(presetID)}
      />,
    );
  };

  // Called by the cancel button to stop and cancel loading of a preset
  const handleCancel = () => {
    setLoadPresetVar(0);
  };

  useEffect(() => {
    setLoadPresetProgress(0.0);
    if (loadPresetVar === 0) {
      console.log('AircraftPresets: Loading preset finished or cancelled');
    } else {
      console.log(`AircraftPresets: Loading preset: ${loadPresetVar} ${AircraftPresetsList[loadPresetVar - 1].name}`);
    }
  }, [loadPresetVar]);

  return (
    <div className="flex h-content-section-reduced flex-col overflow-hidden">
      <M3Card className="mb-4 shrink-0 px-5 py-4">
        {loadPresetVar ? (
          <>
            <div className="flex flex-row items-center">
              <div className="flex min-w-0 grow flex-col">
                <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">
                  {`${t('Presets.AircraftStates.Loading')} · ${AircraftPresetsList[loadPresetVar - 1]?.name ?? ''}`}
                </span>
                <span className="mt-1 truncate text-base font-bold text-white">
                  {`${t('Presets.AircraftStates.CurrentProcedureStep')}: ${currentStepDescription}`}
                </span>
              </div>
              <span className="ml-4 text-2xl font-bold text-m3-on-primary-container">
                {`${(loadPresetProgress * 100).toFixed(0)} %`}
              </span>
              <M3Button tone="outline" className="ml-4 !h-12" onClick={() => handleCancel()}>
                <X size={22} />
                <span className="text-base font-bold text-current">{t('Presets.AircraftStates.Cancel')}</span>
              </M3Button>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-m3-tile">
              <div
                className="h-2 rounded-full bg-m3-primary"
                style={{ width: `${loadPresetProgress * 100}%`, transition: 'width 0.1s ease' }}
              />
            </div>
          </>
        ) : (
          <span className={`text-base font-semibold ${simOnGround ? 'text-m3-text' : 'text-m3-on-warn'}`}>
            {simOnGround
              ? t('Presets.AircraftStates.SelectAPresetToLoad')
              : t('Presets.AircraftStates.TheAircraftMustBeOnTheGroundToLoadAPreset')}
          </span>
        )}
      </M3Card>

      <div className="flex min-h-0 flex-1 flex-row">
        {AircraftPresetsList.map(({ index, name, icon }) => {
          const loading = loadPresetVar === index;
          const disabled = !simOnGround || (loadPresetVar && loadPresetVar !== index);
          return (
            <button
              type="button"
              key={index}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-3xl px-3 transition duration-100 ${
                index > 1 ? 'ml-3' : ''
              } ${loading ? 'bg-m3-primary-container text-m3-on-primary-container' : 'bg-m3-card text-m3-text hover:bg-m3-tile'} ${
                disabled ? 'pointer-events-none opacity-40' : ''
              }`}
              onClick={() => handleLoadPreset(index)}
            >
              <span
                className={`flex h-24 w-24 items-center justify-center rounded-full ${loading ? 'bg-m3-tonal' : 'bg-m3-tile'}`}
              >
                {icon}
              </span>
              <span className="mt-5 text-center text-xl font-bold leading-tight text-current">{name}</span>
              {loading && (
                <span className="mt-1 text-sm font-bold text-current">{`${t('Presets.AircraftStates.Loading')}…`}</span>
              )}
            </button>
          );
        })}
      </div>

      <M3Card className="mt-4 shrink-0">
        <div className="flex h-14 flex-row items-center px-5">
          <span className="grow text-base font-semibold text-m3-text">
            {t('Presets.AircraftStates.ExpediteLoading').replace(/:$/, '')}
          </span>
          <Toggle value={!!loadPresetsExpedite} onToggle={(value) => setLoadPresetsExpedite(value ? 1 : 0)} />
        </div>
      </M3Card>
    </div>
  );
};
