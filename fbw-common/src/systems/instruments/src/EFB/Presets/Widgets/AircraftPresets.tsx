// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useState } from 'react';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { PromptModal, t, Toggle, useModals } from '@flybywiresim/flypad';
import {
  AirplaneEngines,
  AirplaneFill,
  ArrowRight,
  InfoCircle,
  LightningCharge,
  Snow,
  Truck,
  X,
} from 'react-bootstrap-icons';
import { M3Button } from '../../UtilComponents/Material/Material';
import { DashboardCard } from '../../Dashboard/Cards/CardParts';

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
    { index: 1, name: `${t('Presets.AircraftStates.ColdDark')}`, icon: <Snow size={34} /> }, // 'Cold & Dark' },
    { index: 2, name: `${t('Presets.AircraftStates.Powered')}`, icon: <LightningCharge size={34} /> },
    { index: 3, name: `${t('Presets.AircraftStates.ReadyPushback')}`, icon: <Truck size={34} /> },
    { index: 4, name: `${t('Presets.AircraftStates.ReadyTaxi')}`, icon: <AirplaneEngines size={34} /> },
    { index: 5, name: `${t('Presets.AircraftStates.ReadyTakeoff')}`, icon: <AirplaneFill size={34} /> },
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

  const isLoadingAny = !!loadPresetVar;

  return (
    <DashboardCard
      title={t('Presets.AircraftStates.Title')}
      section="aircraftState"
      className="mb-4 shrink-0"
      bodyClassName="px-3.5 pb-3 pt-3.5"
      trailing={
        <>
          <span className="dashboard-header-title whitespace-nowrap text-sm font-semibold">
            {t('Presets.AircraftStates.ExpediteLoading').replace(/:$/, '')}
          </span>
          <Toggle value={!!loadPresetsExpedite} onToggle={(value) => setLoadPresetsExpedite(value ? 1 : 0)} />
        </>
      }
    >
      <div className="flex shrink-0 flex-row items-stretch">
        {AircraftPresetsList.map(({ index, name, icon }) => {
          const loading = loadPresetVar === index;
          const disabled = !simOnGround || (isLoadingAny && !loading);
          return (
            <React.Fragment key={index}>
              <button
                type="button"
                className={`flex h-32 min-w-0 flex-1 flex-col items-center justify-center rounded-sm border px-2 transition duration-100 ${
                  loading
                    ? 'border-m3-primary bg-m3-primary-container text-m3-on-primary-container'
                    : 'border-m3-outline bg-m3-tile text-m3-text hover:brightness-110'
                } ${disabled ? 'pointer-events-none opacity-40' : ''}`}
                onClick={() => handleLoadPreset(index)}
              >
                {icon}
                <span className="mt-3 text-center text-base font-bold leading-tight text-current">{name}</span>
                {loading && (
                  <span className="mt-1 text-xs font-extrabold uppercase tracking-widest text-current">
                    {t('Presets.AircraftStates.Loading')}
                  </span>
                )}
              </button>
              {index < AircraftPresetsList.length && (
                <div className="flex w-7 shrink-0 items-center justify-center text-m3-muted">
                  <ArrowRight size={16} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isLoadingAny ? (
        <div className="mt-3 flex shrink-0 flex-row items-end">
          <div className="flex min-w-0 grow flex-col">
            <div className="flex flex-row items-baseline">
              <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">
                {t('Presets.AircraftStates.Step')}
              </span>
              <span className="ml-2 min-w-0 truncate text-base font-bold text-m3-text">{currentStepDescription}</span>
              <div className="grow" />
              <span className="ml-3 text-base font-bold text-m3-on-primary-container">
                {`${(loadPresetProgress * 100).toFixed(0)} %`}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-m3-tile">
              <div
                className="h-1.5 rounded-sm bg-m3-primary"
                style={{ width: `${loadPresetProgress * 100}%`, transition: 'width 0.1s ease' }}
              />
            </div>
          </div>
          <M3Button tone="outline" className="ml-4 !h-10" onClick={() => handleCancel()}>
            <X size={20} />
            <span className="text-sm font-bold text-current">{t('Presets.AircraftStates.Cancel')}</span>
          </M3Button>
        </div>
      ) : (
        <div className="mt-3 flex shrink-0 flex-row items-center text-m3-muted">
          <InfoCircle size={14} />
          <span className="ml-2 text-sm text-m3-muted">{t('Presets.AircraftStates.Hint')}</span>
        </div>
      )}
    </DashboardCard>
  );
};
