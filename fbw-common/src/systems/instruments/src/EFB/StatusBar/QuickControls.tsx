// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  BrightnessHighFill,
  ClockHistory,
  Compass,
  Dash,
  Gear,
  Keyboard,
  LightbulbFill,
  MoonFill,
  PersonCheck,
  Plus,
  Power,
  Toggles,
  Wifi,
  WifiOff,
} from 'react-bootstrap-icons';
import {
  usePersistentNumberProperty,
  usePersistentProperty,
  useSimVar,
  ClientState,
  SimBridgeClientState,
  usePersistentBooleanProperty,
  useGlobalVar,
} from '@flybywiresim/fbw-sdk-react';
import Slider from 'rc-slider';
import { useHistory } from 'react-router-dom';
import { useInterval } from '@flybywiresim/react-components';
import { t } from '../Localization/translation';
import { TooltipWrapper } from '../UtilComponents/TooltipWrapper';
import { PowerStates, usePower } from '../Efb';
import { PiAirplaneLandingFill } from 'react-icons/pi';
import { AircraftContext } from '@flybywiresim/flypad';
import { M3Switch } from '../UtilComponents/Material/Material';

interface QuickSettingsButtonProps {
  onClick: () => void;
  'aria-label': string;
  /** The red look of the power button */
  danger?: boolean;
}

/** A square icon button of the header of the card */
const QuickSettingsButton: FC<QuickSettingsButtonProps> = ({ onClick, danger, children, ...rest }) => (
  <button
    type="button"
    aria-label={rest['aria-label']}
    onClick={onClick}
    className={`flex h-11 w-11 items-center justify-center rounded-xl border bg-m3-ground transition duration-100 ${
      danger
        ? 'border-m3-on-error text-m3-on-error hover:bg-m3-error-container'
        : 'border-m3-outline text-m3-text hover:bg-m3-tile'
    }`}
  >
    {children}
  </button>
);

/** How a tile shows its state: on (tonal), in progress (amber), failed (red) or off */
type QuickTileTone = 'on' | 'busy' | 'error' | 'off';

const QUICK_TILE_TONES: Record<QuickTileTone, string> = {
  on: 'bg-m3-primary-container text-m3-on-primary-container',
  busy: 'bg-m3-warn-container text-m3-on-warn',
  error: 'bg-m3-error-container text-m3-on-error',
  off: 'bg-m3-tile text-m3-text hover:brightness-110',
};

interface QuickSettingsTileProps {
  onClick: () => void;
  icon: ReactNode;
  name: string;
  /** The state line under the name (Connected, Armed...) */
  state?: string;
  tone?: QuickTileTone;
}

/** A tile of the grid: an icon, the name and its state */
const QuickSettingsTile: FC<QuickSettingsTileProps> = ({ onClick, icon, name, state, tone = 'off' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex h-24 w-full flex-col items-start rounded-2xl p-3 text-left transition duration-100 ${QUICK_TILE_TONES[tone]}`}
  >
    <span className="flex shrink-0">{icon}</span>
    <span className="mt-2 text-sm font-bold leading-tight text-current">{name}</span>
    {state && <span className="mt-1 text-xs font-semibold text-current opacity-80">{state}</span>}
  </button>
);

interface QuickSliderProps {
  icon: ReactNode;
  name: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
  auto: boolean;
  onAuto: () => void;
  autoTooltip: string;
}

/** A brightness: its name and Auto switch, then the slider and the value (the slider is dimmed while on Auto) */
const QuickSlider: FC<QuickSliderProps> = ({ icon, name, value, min, onChange, auto, onAuto, autoTooltip }) => {
  // The slider gives up the focus once released, so that the keyboard (the END key of the external view) does not
  // move it
  const sliderRef = useRef<any>(null);

  return (
    <div className="mb-4 flex flex-col">
      <div className="flex flex-row items-center">
        <span className="mr-3 flex text-m3-muted">{icon}</span>
        <span className="grow text-sm font-bold text-m3-text">{name}</span>
        <span className="mr-3 text-sm font-semibold text-m3-muted">{t('QuickControls.Auto')}</span>
        <TooltipWrapper text={autoTooltip}>
          <div>
            <M3Switch value={auto} onToggle={onAuto} aria-label={`${name} ${t('QuickControls.Auto')}`} />
          </div>
        </TooltipWrapper>
      </div>
      <div className={`mt-2 flex flex-row items-center ${auto ? 'opacity-40' : ''}`}>
        <div className="grow">
          <Slider
            disabled={auto}
            ref={sliderRef}
            value={value}
            min={min}
            max={100}
            onChange={onChange}
            onAfterChange={() => sliderRef.current && sliderRef.current.blur()}
            railStyle={{ backgroundColor: 'var(--m3-tile)' }}
            trackStyle={{ backgroundColor: 'var(--m3-primary)' }}
            handleStyle={{ backgroundColor: '#ffffff', borderColor: '#ffffff' }}
          />
        </div>
        <span className="ml-3 w-12 text-right text-sm font-bold text-m3-text">{`${value.toFixed(0)} %`}</span>
      </div>
    </div>
  );
};

export const QuickControlsPane = ({
  setShowQuickControlsPane,
}: {
  setShowQuickControlsPane: (value: boolean) => void;
}) => {
  const aircraftContext = useContext(AircraftContext);
  const history = useHistory();
  const power = usePower();

  const [brightnessSetting, setBrightnessSetting] = usePersistentNumberProperty('EFB_BRIGHTNESS', 0);
  const [brightness] = useSimVar('L:A32NX_EFB_BRIGHTNESS', 'number', 500);
  const [usingAutobrightness, setUsingAutobrightness] = usePersistentNumberProperty('EFB_USING_AUTOBRIGHTNESS', 1);
  const [cabinAutoBrightness] = useSimVar('L:A32NX_CABIN_AUTOBRIGHTNESS', 'number', 500);
  const [cabinManualBrightness, setCabinManualBrightness] = usePersistentNumberProperty('CABIN_MANUAL_BRIGHTNESS', 0);
  const [usingCabinAutobrightness, setUsingCabinAutobrightness] = usePersistentNumberProperty(
    'CABIN_USING_AUTOBRIGHTNESS',
    1,
  );
  const [autoOSK, setAutoOSK] = usePersistentNumberProperty('EFB_AUTO_OSK', 0);
  const [pauseAtTod, setPauseAtTod] = usePersistentBooleanProperty('PAUSE_AT_TOD', false);
  const [todArmed] = useSimVar('L:A32NX_PAUSE_AT_TOD_ARMED', 'bool', 500);

  const simRate = useGlobalVar('SIMULATION RATE', 'number', 500);

  const decreaseSimrate = useCallback(() => SimVar.SetSimVarValue('K:SIM_RATE_DECR', 'bool', true), []);
  const increaseSimrate = useCallback(() => SimVar.SetSimVarValue('K:SIM_RATE_INCR', 'bool', true), []);

  const [adirsAlignTimeSimVar, setAdirsAlignTimeSimVar] = useSimVar(
    'L:A32NX_CONFIG_ADIRS_IR_ALIGN_TIME',
    'Enum',
    Number.MAX_SAFE_INTEGER,
  );
  const [boardingRate, setBoardingRate] = usePersistentProperty('CONFIG_BOARDING_RATE', 'REAL');
  const [, setSimbridgeEnabled] = usePersistentProperty('CONFIG_SIMBRIDGE_ENABLED', 'AUTO ON');

  const [simBridgeClientState, setSimBridgeClientState] = useState<SimBridgeClientState>(
    ClientState.getInstance().getSimBridgeClientState(),
  );

  const handleAutoBrightness = () => {
    setUsingAutobrightness(usingAutobrightness ? 0 : 1);
  };

  const handleCabinAutoBrightness = () => {
    setUsingCabinAutobrightness(usingCabinAutobrightness ? 0 : 1);
  };

  const handleSettings = () => {
    history.push('/settings/flypad');
  };

  const handleSleep = () => {
    history.push('/');
    power.setPowerState(PowerStates.STANDBY);
  };

  const handlePower = () => {
    history.push('/');
    loadedToOff();
  };

  const loadedToOff = () => {
    setShowQuickControlsPane(false);
    power.setPowerState(PowerStates.SHUTDOWN);
    setTimeout(() => {
      power.setPowerState(PowerStates.SHUTOFF);
    }, 1000);
  };

  const handleAlignADIRS = () => {
    const previousAlignTimeVar = adirsAlignTimeSimVar;
    setAdirsAlignTimeSimVar(1);
    setTimeout(() => {
      setAdirsAlignTimeSimVar(previousAlignTimeVar);
    }, 500);
  };

  const handleInstantBoarding = () => {
    const previousBoardingRate = boardingRate;
    setBoardingRate('INSTANT');
    setTimeout(() => {
      setBoardingRate(previousBoardingRate);
    }, 500);
  };

  const handleResetSimBridgeConnection = () => {
    if (
      simBridgeClientState === SimBridgeClientState.CONNECTED ||
      simBridgeClientState === SimBridgeClientState.CONNECTING
    ) {
      setSimbridgeEnabled('PERM OFF');
      return;
    }
    setSimbridgeEnabled('AUTO ON');
  };

  const handleToggleOsk = () => {
    setAutoOSK(autoOSK === 0 ? 1 : 0);
  };

  const handleTogglePauseAtTod = () => {
    setPauseAtTod(!pauseAtTod);
  };

  const simBridgeTileTone = useMemo<QuickTileTone>((): QuickTileTone => {
    switch (simBridgeClientState) {
      case SimBridgeClientState.CONNECTED:
        return 'on';
      case SimBridgeClientState.CONNECTING:
        return 'busy';
      case SimBridgeClientState.OFFLINE:
        return 'error';
      default:
        return 'off';
    }
  }, [simBridgeClientState]);

  const simBridgeButtonStateString = useMemo<string>((): string => {
    switch (simBridgeClientState) {
      case SimBridgeClientState.CONNECTED:
        return t('QuickControls.SimBridgeConnected');
      case SimBridgeClientState.CONNECTING:
        return t('QuickControls.SimBridgeConnecting');
      case SimBridgeClientState.OFFLINE:
        return t('QuickControls.SimBridgeOffline');
      default:
        return t('QuickControls.SimBridgeOff');
    }
  }, [simBridgeClientState]);

  const pauseAtTodTone = useMemo<QuickTileTone>((): QuickTileTone => {
    if (pauseAtTod && todArmed) {
      return 'on';
    }
    if (pauseAtTod) {
      return 'busy';
    }
    return 'off';
  }, [pauseAtTod, todArmed]);

  const pauseAtTodString = useMemo<string>((): string => {
    if (pauseAtTod && todArmed) {
      return t('QuickControls.PauseAtTodArmed');
    } else if (pauseAtTod) {
      return t('QuickControls.PauseAtTodStandby');
    } else {
      return t('QuickControls.PauseAtTodInactive');
    }
  }, [pauseAtTod, todArmed]);

  useInterval(() => {
    setSimBridgeClientState(ClientState.getInstance().getSimBridgeClientState());
  }, 200);

  return (
    <>
      <div
        className="absolute left-0 top-0 z-30 h-screen w-screen bg-black opacity-40"
        onMouseDown={() => setShowQuickControlsPane(false)}
      />

      <div
        className="absolute z-40 flex flex-col rounded-3xl bg-m3-card p-5 shadow-2xl"
        style={{ top: '48px', right: '16px', width: '460px' }}
      >
        <div className="mb-5 flex flex-row items-center">
          <span className="grow text-xs font-bold uppercase tracking-widest text-m3-muted">
            {t('QuickControls.Title')}
          </span>
          <TooltipWrapper text={t('QuickControls.TT.Settings')}>
            <div>
              <QuickSettingsButton onClick={handleSettings} aria-label={t('QuickControls.TT.Settings')}>
                <Gear size={20} />
              </QuickSettingsButton>
            </div>
          </TooltipWrapper>
          <TooltipWrapper text={t('QuickControls.TT.Sleep')}>
            <div className="ml-2">
              <QuickSettingsButton onClick={handleSleep} aria-label={t('QuickControls.TT.Sleep')}>
                <MoonFill size={18} />
              </QuickSettingsButton>
            </div>
          </TooltipWrapper>
          <TooltipWrapper text={t('QuickControls.TT.PowerButton')}>
            <div className="ml-4">
              <QuickSettingsButton onClick={handlePower} danger aria-label={t('QuickControls.TT.PowerButton')}>
                <Power size={20} />
              </QuickSettingsButton>
            </div>
          </TooltipWrapper>
        </div>

        <TooltipWrapper text={t('QuickControls.TT.Brightness')}>
          <div>
            <QuickSlider
              icon={<BrightnessHighFill size={18} />}
              name={t('QuickControls.Brightness')}
              value={usingAutobrightness ? brightness : brightnessSetting}
              min={1}
              onChange={setBrightnessSetting}
              auto={usingAutobrightness === 1}
              onAuto={handleAutoBrightness}
              autoTooltip={t('QuickControls.TT.AutoBrightness')}
            />
          </div>
        </TooltipWrapper>
        {aircraftContext.settingsPages.sim.cabinLighting && (
          <TooltipWrapper text={t('QuickControls.TT.CabinLighting')}>
            <div>
              <QuickSlider
                icon={<LightbulbFill size={18} />}
                name={t('QuickControls.CabinLighting')}
                value={usingCabinAutobrightness ? cabinAutoBrightness : cabinManualBrightness}
                min={0}
                onChange={setCabinManualBrightness}
                auto={usingCabinAutobrightness === 1}
                onAuto={handleCabinAutoBrightness}
                autoTooltip={t('QuickControls.TT.CabinAutoBrightness')}
              />
            </div>
          </TooltipWrapper>
        )}

        <div className="mt-1 flex flex-row">
          <TooltipWrapper text={t('QuickControls.TT.AlignAdirs')}>
            <div className="flex-1">
              <QuickSettingsTile
                onClick={handleAlignADIRS}
                icon={<Compass size={22} />}
                name={t('QuickControls.AlignAdirs')}
              />
            </div>
          </TooltipWrapper>
          <TooltipWrapper text={t('QuickControls.TT.FinishBoarding')}>
            <div className="ml-3 flex-1">
              <QuickSettingsTile
                onClick={handleInstantBoarding}
                icon={<PersonCheck size={22} />}
                name={t('QuickControls.FinishBoarding')}
              />
            </div>
          </TooltipWrapper>
          <TooltipWrapper text={t('QuickControls.TT.SimBridge')}>
            <div className="ml-3 flex-1">
              <QuickSettingsTile
                onClick={handleResetSimBridgeConnection}
                icon={
                  simBridgeClientState === SimBridgeClientState.CONNECTED ? <Wifi size={22} /> : <WifiOff size={22} />
                }
                name={t('QuickControls.SimBridge')}
                state={simBridgeButtonStateString}
                tone={simBridgeTileTone}
              />
            </div>
          </TooltipWrapper>
        </div>

        <div className="mt-3 flex flex-row">
          <TooltipWrapper text={t('QuickControls.TT.OnScreenKeyboard')}>
            <div className="flex-1">
              <QuickSettingsTile
                onClick={handleToggleOsk}
                icon={<Keyboard size={22} />}
                name={t('QuickControls.OnScreenKeyboard')}
                state={autoOSK ? t('QuickControls.On') : t('QuickControls.Off')}
                tone={autoOSK ? 'on' : 'off'}
              />
            </div>
          </TooltipWrapper>
          {aircraftContext.settingsPages.realism.pauseOnTod && (
            <TooltipWrapper text={t('QuickControls.TT.PauseAtTod')}>
              <div className="ml-3 flex-1">
                <QuickSettingsTile
                  onClick={handleTogglePauseAtTod}
                  icon={<PiAirplaneLandingFill size={22} />}
                  name={t('QuickControls.PauseAtTod')}
                  state={pauseAtTodString}
                  tone={pauseAtTodTone}
                />
              </div>
            </TooltipWrapper>
          )}
          <TooltipWrapper text={t('QuickControls.TT.Simrate')}>
            <div className="ml-3 flex h-24 flex-1 flex-col rounded-2xl bg-m3-tile p-3 text-m3-text">
              <span className="flex shrink-0">
                <ClockHistory size={22} />
              </span>
              <span className="mt-2 text-sm font-bold leading-tight text-m3-text">{t('QuickControls.Simrate')}</span>
              <div className="mt-1 flex flex-row items-center">
                <button
                  type="button"
                  aria-label="-"
                  onClick={decreaseSimrate}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-m3-outline bg-transparent text-m3-text hover:bg-m3-card"
                >
                  <Dash size={16} />
                </button>
                <span className="mx-1 grow text-center text-sm font-bold text-m3-text">{`${simRate}×`}</span>
                <button
                  type="button"
                  aria-label="+"
                  onClick={increaseSimrate}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-m3-outline bg-transparent text-m3-text hover:bg-m3-card"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </TooltipWrapper>
        </div>
      </div>
    </>
  );
};

export const QuickControls = () => {
  const [showQuickControlsPane, setShowQuickControlsPane] = useState(false);

  return (
    <>
      <TooltipWrapper text={t('StatusBar.TT.QuickControls')}>
        <div
          className={`flex h-8 w-11 items-center justify-center rounded-full transition duration-100 ${
            showQuickControlsPane
              ? 'bg-m3-primary-container text-m3-on-primary-container'
              : 'text-m3-text hover:bg-m3-tile'
          }`}
          onClick={(ev) => {
            ev.stopPropagation();
            setShowQuickControlsPane((old) => !old);
          }}
        >
          <Toggles size={20} />
        </div>
      </TooltipWrapper>
      {showQuickControlsPane && <QuickControlsPane setShowQuickControlsPane={setShowQuickControlsPane} />}
    </>
  );
};
