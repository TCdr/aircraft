// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useRef } from 'react';
import { MathUtils, usePersistentNumberProperty, useSimVar, useSplitSimVar } from '@flybywiresim/fbw-sdk-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDoubleDown,
  ChevronDoubleUp,
  ChevronLeft,
  ChevronRight,
  DashCircle,
  DashCircleFill,
  ExclamationTriangleFill,
  PauseCircleFill,
  PlayCircleFill,
  TruckFlatbed,
} from 'react-bootstrap-icons';
import Slider from 'rc-slider';
import { toast } from 'react-toastify';
import { t, PromptModal, useModals, TooltipWrapper } from '@flybywiresim/flypad';
import {
  M3Button,
  M3Card,
  M3Chip,
  M3IconButton,
  M3Page,
  M3Segmented,
  M3Switch,
} from '../../../UtilComponents/Material/Material';
import { PushbackMap } from './PushbackMap';

export const PushbackPage = () => {
  const { showModal } = useModals();

  const [simOnGround] = useSimVar('SIM ON GROUND', 'bool', 250);
  const [flightPhase] = useSimVar('L:A32NX_FMGC_FLIGHT_PHASE', 'enum', 250);

  // This is used to completely turn off the pushback for compatibility with other
  // pushback add-ons. Only watching sim variables like 'PUSHBACK STATE' or
  // 'PUSHBACK AVAILABLE' leads to conflicts as other add-on also read/write them.
  // It is implemented as a LVAR to allow 3rd parties to see that the a32nx pushback is active
  // and to be able to deactivate themselves or the a32nx pushback system if required.
  const [pushbackSystemEnabled, setPushbackSystemEnabled] = useSimVar('L:A32NX_PUSHBACK_SYSTEM_ENABLED', 'bool', 100);

  const [pushbackState, setPushbackState] = useSplitSimVar('PUSHBACK STATE', 'enum', 'K:TOGGLE_PUSHBACK', 'bool', 100);
  const [pushbackWait, setPushbackWait] = useSimVar('PUSHBACK WAIT', 'bool', 100);
  const [pushbackAttached] = useSimVar('PUSHBACK ATTACHED', 'bool', 100);
  const [pushbackAngle] = useSimVar('PUSHBACK ANGLE', 'Degrees', 100);

  const [useControllerInput, setUseControllerInput] = usePersistentNumberProperty('PUSHBACK_USE_CONTROLLER_INPUT', 1);
  const [rudderPosition] = useSimVar('L:A32NX_RUDDER_PEDAL_POSITION', 'number', 50);
  const [elevatorPosition] = useSimVar('L:A32NX_SIDESTICK_POSITION_Y', 'number', 50);

  const [planeGroundSpeed] = useSimVar('GROUND VELOCITY', 'Knots', 100);

  const [parkingBrakeEngaged, setParkingBrakeEngaged] = useSimVar('L:A32NX_PARK_BRAKE_LEVER_POS', 'Bool', 250);
  const [nwStrgDisc] = useSimVar('L:A32NX_HYD_NW_STRG_DISC_ECAM_MEMO', 'Bool', 250);

  const [tugCmdHdgFactor, setCmdHdgFactor] = useSimVar('L:A32NX_PUSHBACK_HDG_FACTOR', 'number', 100);
  const [tugCmdSpdFactor, setCmdSpdFactor] = useSimVar('L:A32NX_PUSHBACK_SPD_FACTOR', 'number', 100);

  const [showDebugInfo, setShowDebugInfo] = useSimVar('L:A32NX_PUSHBACK_DEBUG', 'bool', 100);

  // Required so these can be used inside the useEffect return callback
  const pushBackAttachedRef = useRef(pushbackAttached);
  pushBackAttachedRef.current = pushbackAttached;

  const pushbackUIAvailable: boolean = simOnGround;
  const tugInTransit: boolean = pushbackAttached !== nwStrgDisc;
  const pushbackActive: boolean = pushbackSystemEnabled && !tugInTransit && nwStrgDisc;

  const releaseTug = () => {
    setPushbackState(3);
    setPushbackWait(0);
    // This alone does not suffice to fully release the tug.
    // A "TUG_DISABLE" event has to be sent. But if sent too early it gets
    // ignored by the sim sometimes and the aircraft would not steer.
    // See the useEffect [nwStrgDisc] in Efb.tsx - it fires this event when the
    // NW STRG DISC message disappears which is also the moment when the
    // nose wheel visually starts turning again.
  };

  const callTug = () => {
    setPushbackState(0);
    setPushbackWait(1);
  };

  const handleEnableSystem = () => {
    if (pushbackSystemEnabled) {
      if (pushbackState < 3) {
        showModal(
          <PromptModal
            title={t('Pushback.DisableSystemMessageTitle')}
            bodyText={`${t('Pushback.DisableSystemMessageBody')}`}
            onConfirm={() => {
              releaseTug();
            }}
          />,
        );
      } else {
        setPushbackSystemEnabled(0);
      }
      return;
    }
    showModal(
      <PromptModal
        title={t('Pushback.EnableSystemMessageTitle')}
        bodyText={`${t('Pushback.EnableSystemMessageBody')}`}
        onConfirm={() => {
          setPushbackSystemEnabled(1);
        }}
      />,
    );
  };

  const handleCallTug = () => {
    if (pushbackState < 3) {
      releaseTug();
      return;
    }
    callTug();
  };

  const stopMovement = () => {
    setCmdHdgFactor(0);
    setCmdSpdFactor(0);
  };

  const handleTugSpeed = (speed: number) => {
    setCmdSpdFactor(MathUtils.clamp(speed, -1, 1));
  };

  const handleTugDirection = (value: number) => {
    setCmdHdgFactor(MathUtils.clamp(value, -1, 1));
  };

  // called once when loading and unloading the page
  useEffect(() => {
    // when loading the page
    stopMovement();

    // when unloading the page
    // !obs: as with setInterval no access to current local variable values
    return () => {
      if (pushBackAttachedRef.current) {
        toast.info(t('Pushback.LeavePageMessage'), {
          autoClose: 750,
          hideProgressBar: true,
          closeButton: false,
        });
        stopMovement();
      }
    };
  }, []);

  // Update commanded heading from input
  useEffect(() => {
    if (!pushbackActive || !useControllerInput) {
      return;
    }
    // create deadzone
    if (rudderPosition > -0.05 && rudderPosition < 0.05) {
      setCmdHdgFactor(0);
    } else {
      setCmdHdgFactor(rudderPosition / 100);
    }
  }, [rudderPosition]);

  // Update commanded speed from input
  useEffect(() => {
    if (!pushbackActive || !useControllerInput) {
      return;
    }
    // create deadzone
    if (elevatorPosition > -0.05 && elevatorPosition < 0.05) {
      setCmdSpdFactor(0);
    } else {
      setCmdSpdFactor(-elevatorPosition);
    }
  }, [elevatorPosition]);

  // Make sure to deactivate the pushback system completely when leaving ground
  useEffect(() => {
    if (flightPhase !== 0 && flightPhase !== 7) {
      setPushbackSystemEnabled(simOnGround);
    }
  }, [simOnGround]);

  // Debug info for pushback movement - can be removed eventually
  const debugInformation = () => (
    <div className="absolute inset-x-0 z-50 mx-4 flex grow justify-between border-gray-100 bg-gray-100 font-mono text-black opacity-50">
      <div className="text-m overflow-hidden text-black">
        pushbackSystemEnabled: {pushbackSystemEnabled}
        <br />
        deltaTime: {SimVar.GetSimVarValue('L:A32NX_PUSHBACK_UPDT_DELTA', 'number').toFixed(3)}
        <br />
        pushBackWait: {pushbackWait}
        <br />
        pushBackAttached: {pushbackAttached}
        <br />
        pushBackState: {pushbackState}
        <br />
        tugInTransit: {tugInTransit ? 'true' : 'false'}
        <br />
        pushbackAvailable: {SimVar.GetSimVarValue('PUSHBACK AVAILABLE', 'bool')}
        <br />
        tugAngle: {pushbackAngle.toFixed(3)}
        <br />
        NW STRG DISC MEMO {SimVar.GetSimVarValue('L:A32NX_HYD_NW_STRG_DISC_ECAM_MEMO', 'Bool')}
        <br />
        Steer Input Control: {SimVar.GetSimVarValue('STEER INPUT CONTROL', 'Percent Over 100').toFixed(3)}
        <br />
        Gear Steer Angle: {SimVar.GetSimVarValue('GEAR STEER ANGLE PCT:0', 'Percent Over 100').toFixed(3)}
      </div>
      <div className="text-m overflow-hidden text-black">
        Heading (True): {SimVar.GetSimVarValue('PLANE HEADING DEGREES TRUE', 'degrees').toFixed(3)}
        <br />
        Heading (Magnetic): {SimVar.GetSimVarValue('PLANE HEADING DEGREES MAGNETIC', 'degrees').toFixed(3)}
        <br />
        tCHeadingF: {tugCmdHdgFactor.toFixed(3)}
        <br />
        tCHeading : {SimVar.GetSimVarValue('L:A32NX_PUSHBACK_HDG', 'degrees').toFixed(3)}
        <br />
        Rotation Velocity X: {SimVar.GetSimVarValue('ROTATION VELOCITY BODY X', 'Number').toFixed(3)}
        <br />
        Rotation Velocity Y: {SimVar.GetSimVarValue('ROTATION VELOCITY BODY Y', 'Number').toFixed(3)}
        <br /> Rotation Velocity Z: {SimVar.GetSimVarValue('ROTATION VELOCITY BODY Z', 'Number').toFixed(3)}
        <br /> Rot. Accel. X:{' '}
        {SimVar.GetSimVarValue('ROTATION ACCELERATION BODY X', 'feet per second squared').toFixed(3)}
        <br /> Rot. Accel. Y:{' '}
        {SimVar.GetSimVarValue('ROTATION ACCELERATION BODY Y', 'feet per second squared').toFixed(3)}
        <br /> Rot. Accel Z:{' '}
        {SimVar.GetSimVarValue('ROTATION ACCELERATION BODY Z', 'feet per second squared').toFixed(3)}
        <br /> Counter Rot. Accel X:{' '}
        {SimVar.GetSimVarValue('L:A32NX_PUSHBACK_R_X_OUT', 'feet per second squared').toFixed(3)} <br /> Pitch:{' '}
        {SimVar.GetSimVarValue('PLANE PITCH DEGREES', 'degrees').toFixed(3)}
      </div>
      <div className="text-m overflow-hidden text-black">
        acGroundSpeed: {planeGroundSpeed.toFixed(3)}
        {'kts '}
        {' ('}
        {(planeGroundSpeed * 1.68781).toFixed(3)}
        ft/s)
        <br />
        tCSpeedFactor: {tugCmdSpdFactor.toFixed(3)}
        <br />
        tCSpeed: {SimVar.GetSimVarValue('L:A32NX_PUSHBACK_SPD', 'feet per second').toFixed(3)}
        <br />
        tInertiaSpeed: {SimVar.GetSimVarValue('L:A32NX_PUSHBACK_INERTIA_SPD', 'feet per second').toFixed(3)}
        <br />
        Velocity X: {SimVar.GetSimVarValue('VELOCITY BODY X', 'feet per second').toFixed(3)}
        <br />
        Velocity Y: {SimVar.GetSimVarValue('VELOCITY BODY Y', 'feet per second').toFixed(3)}
        <br />
        Velocity Z: {SimVar.GetSimVarValue('VELOCITY BODY Z', 'feet per second').toFixed(3)}
        <br /> Accel. X: {SimVar.GetSimVarValue('ACCELERATION BODY X', 'feet per second squared').toFixed(3)}
        <br /> Accel. Y: {SimVar.GetSimVarValue('ACCELERATION BODY Y', 'feet per second squared').toFixed(3)}
        <br /> Accel Z: {SimVar.GetSimVarValue('ACCELERATION BODY Z', 'feet per second squared').toFixed(3)}
        <br /> Rel. Wind Z: {SimVar.GetSimVarValue('RELATIVE WIND VELOCITY BODY Z', 'meter per second').toFixed(3)}
        m/s
      </div>
    </div>
  );

  // To prevent keyboard input (esp. END key for external view) to change
  // the slider position. This is accomplished by a
  // onAfterChange={() => sliderRef.current.blur()}
  // in the Slider component props.
  const directionSliderRef = useRef<any>(null);
  const speedSliderRef = useRef<any>(null);

  const callTugLabel = () => {
    if (pushbackActive) {
      return t('Pushback.TugAttached');
    }
    if (tugInTransit) {
      return t('Pushback.TugInTransit');
    }
    return t('Pushback.CallTug');
  };

  const tugTone = pushbackActive ? 'active' : tugInTransit ? 'busy' : 'idle';
  const speedKt = Math.abs(planeGroundSpeed) < 0.5 ? 0 : Math.round(Math.abs(planeGroundSpeed) * 10) / 10;
  const steeringDeg = Math.round(tugCmdHdgFactor * 70);
  const steeringLabel = steeringDeg === 0 ? '0°' : `${steeringDeg < 0 ? 'L' : 'R'} ${Math.abs(steeringDeg)}°`;
  const movingLabel = tugCmdSpdFactor !== 0 ? t('Pushback.Moving') : t('Pushback.Halt');
  const dialX = 100 + 80 * Math.sin((tugCmdHdgFactor * 70 * Math.PI) / 180);
  const dialY = 110 - 80 * Math.cos((tugCmdHdgFactor * 70 * Math.PI) / 180);

  return (
    <M3Page
      chips={
        <>
          <M3Chip tone={tugTone} icon={<TruckFlatbed size={14} />}>
            {callTugLabel()}
          </M3Chip>
          <M3Chip tone={parkingBrakeEngaged ? 'warn' : 'idle'} icon={<DashCircleFill size={14} />}>
            {`${t('Pushback.ParkingBrake.Title')} ${
              parkingBrakeEngaged ? t('Pushback.ParkingBrake.On') : t('Pushback.ParkingBrake.Off')
            }`}
          </M3Chip>
          <M3Chip tone="idle">{`${speedKt} kt`}</M3Chip>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {/* the map */}
        <M3Card low className="relative mr-4 h-full min-w-0 flex-1">
          <div className="absolute inset-0">
            <PushbackMap />
          </div>
          <div className="absolute inset-x-0 top-0">{showDebugInfo ? debugInformation() : <></>}</div>
          {!pushbackUIAvailable && (
            <div className="bg-m3-ground/70 absolute inset-0 flex items-center justify-center p-8 text-center text-2xl font-bold">
              {t('Pushback.AvailableOnlyOnGround')}
            </div>
          )}
        </M3Card>

        {/* the control rail */}
        <div
          className={`flex h-full w-[380px] shrink-0 flex-col ${!pushbackUIAvailable ? 'pointer-events-none opacity-30' : ''}`}
        >
          <M3Card className="mb-4 shrink-0 px-4 py-4">
            <div className="mb-3 flex flex-row items-center">
              <div
                className="mr-3 flex min-w-0 grow flex-col"
                onDoubleClick={() => setShowDebugInfo((old: any) => !old)}
              >
                <span className="text-base font-bold">{t('Pushback.SystemTitle')}</span>
                <span className="text-xs leading-tight text-m3-muted">{t('Pushback.SystemSubtitle')}</span>
              </div>
              <TooltipWrapper
                text={pushbackSystemEnabled ? t('Pushback.TT.SystemEnabledOn') : t('Pushback.TT.SystemEnabledOff')}
              >
                <M3Switch
                  value={!!pushbackSystemEnabled}
                  onToggle={handleEnableSystem}
                  aria-label={t('Pushback.SystemTitle')}
                />
              </TooltipWrapper>
            </div>
            <TooltipWrapper text={t('Pushback.TT.CallReleaseTug')}>
              <M3Button
                onClick={handleCallTug}
                tone={tugInTransit ? 'warn' : pushbackActive ? 'outline' : 'primary'}
                disabled={!pushbackSystemEnabled}
                className="w-full"
              >
                <TruckFlatbed size={22} />
                {pushbackActive
                  ? t('Pushback.ReleaseTug')
                  : tugInTransit
                    ? t('Pushback.TugInTransit')
                    : t('Pushback.CallTug')}
              </M3Button>
            </TooltipWrapper>
            <TooltipWrapper text={t('Pushback.TT.SetReleaseParkingBrake')}>
              <div
                className={`mt-3 flex cursor-pointer flex-row items-center rounded-xl px-3 py-2 text-sm font-semibold ${
                  parkingBrakeEngaged
                    ? 'bg-m3-error-container text-m3-on-error'
                    : 'border border-m3-outline text-m3-text'
                }`}
                onClick={() => setParkingBrakeEngaged((old: any) => !old)}
              >
                {parkingBrakeEngaged ? (
                  <ExclamationTriangleFill size={18} />
                ) : (
                  <DashCircle size={18} className="-rotate-90" />
                )}
                <span className="ml-2 mr-2 grow">
                  {parkingBrakeEngaged && pushbackActive
                    ? t('Pushback.BrakeWarning')
                    : `${t('Pushback.ParkingBrake.Title')} ${
                        parkingBrakeEngaged ? t('Pushback.ParkingBrake.On') : t('Pushback.ParkingBrake.Off')
                      }`}
                </span>
                <M3Switch
                  value={!!parkingBrakeEngaged}
                  onToggle={() => setParkingBrakeEngaged((old: any) => !old)}
                  aria-label={t('Pushback.ParkingBrake.Title')}
                />
              </div>
            </TooltipWrapper>
          </M3Card>

          <M3Card className={`min-h-0 flex-1 px-4 py-4 ${!pushbackActive ? 'pointer-events-none opacity-30' : ''}`}>
            <span className="mb-4 text-xs font-bold uppercase tracking-widest text-m3-muted">
              {t('Pushback.TugControl')}
            </span>
            <M3Segmented
              options={[
                {
                  label: (
                    <>
                      <ArrowDown size={16} />
                      {t('Pushback.Backward')}
                    </>
                  ),
                  onClick: () => handleTugSpeed(tugCmdSpdFactor - 0.1),
                  selected: tugCmdSpdFactor < 0,
                },
                {
                  label: (
                    <>
                      {tugCmdSpdFactor !== 0 ? <PauseCircleFill size={16} /> : <PlayCircleFill size={16} />}
                      {movingLabel}
                    </>
                  ),
                  onClick: stopMovement,
                  selected: tugCmdSpdFactor === 0,
                },
                {
                  label: (
                    <>
                      <ArrowUp size={16} />
                      {t('Pushback.Forward')}
                    </>
                  ),
                  onClick: () => handleTugSpeed(tugCmdSpdFactor + 0.1),
                  selected: tugCmdSpdFactor > 0,
                },
              ]}
            />

            <div className="mt-4 flex flex-row items-center">
              {/* the steering dial */}
              <div className="mr-4 flex grow flex-col items-center">
                <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
                  <path
                    d="M20 110 A80 80 0 0 1 180 110"
                    fill="none"
                    stroke="var(--m3-tile)"
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                  <path
                    d={`M100 30 A80 80 0 0 ${tugCmdHdgFactor >= 0 ? 1 : 0} ${dialX} ${dialY}`}
                    fill="none"
                    stroke="var(--m3-on-primary-container)"
                    strokeWidth="14"
                    strokeLinecap="round"
                    opacity={tugCmdHdgFactor === 0 ? 0 : 1}
                  />
                  <circle cx={dialX} cy={dialY} r="13" fill="var(--m3-text)" />
                  <text
                    x="100"
                    y="104"
                    textAnchor="middle"
                    fontSize="26"
                    fontWeight="700"
                    fill="var(--m3-text)"
                    style={{ fontFamily: 'Manrope, Inter, sans-serif' }}
                  >
                    {steeringLabel}
                  </text>
                </svg>
                <TooltipWrapper text={t('Pushback.TT.SliderDirection')}>
                  <div className="mt-1 flex w-[200px] flex-row items-center space-x-2">
                    <ChevronLeft className="text-m3-muted" />
                    <Slider
                      ref={directionSliderRef}
                      onChange={(value) => handleTugDirection(value)}
                      onAfterChange={() => directionSliderRef.current.blur()}
                      min={-1}
                      step={0.01}
                      max={1}
                      value={tugCmdHdgFactor}
                      startPoint={0}
                    />
                    <ChevronRight className="text-m3-muted" />
                  </div>
                </TooltipWrapper>
                <span className="mt-1 text-xs text-m3-muted">{t('Pushback.TugDirection')}</span>
              </div>
              {/* the speed slider */}
              <TooltipWrapper text={t('Pushback.TT.SliderSpeed')}>
                <div className="flex flex-col items-center space-y-2">
                  <ChevronDoubleUp className="text-m3-muted" />
                  <div className="h-[120px]">
                    <Slider
                      ref={speedSliderRef}
                      vertical
                      onChange={(value) => handleTugSpeed(value)}
                      onAfterChange={() => speedSliderRef.current.blur()}
                      min={-1}
                      step={0.01}
                      max={1}
                      value={tugCmdSpdFactor}
                      startPoint={0}
                    />
                  </div>
                  <ChevronDoubleDown className="text-m3-muted" />
                  <span className="text-xs text-m3-muted">{t('Pushback.TugSpeed')}</span>
                </div>
              </TooltipWrapper>
            </div>

            <div className="mt-4 flex flex-row space-x-2">
              <TooltipWrapper text={t('Pushback.TT.Left')}>
                <M3IconButton
                  aria-label={t('Pushback.Left')}
                  onClick={() => handleTugDirection(tugCmdHdgFactor - 0.05)}
                  className="w-full"
                >
                  <ArrowLeft size={22} />
                </M3IconButton>
              </TooltipWrapper>
              <M3IconButton
                aria-label={t('Pushback.Straight')}
                onClick={() => handleTugDirection(0)}
                selected={tugCmdHdgFactor === 0}
                className="w-full"
              >
                <ArrowUp size={22} />
              </M3IconButton>
              <TooltipWrapper text={t('Pushback.TT.Right')}>
                <M3IconButton
                  aria-label={t('Pushback.Right')}
                  onClick={() => handleTugDirection(tugCmdHdgFactor + 0.05)}
                  className="w-full"
                >
                  <ArrowRight size={22} />
                </M3IconButton>
              </TooltipWrapper>
            </div>

            <div className="grow" />

            <TooltipWrapper text={t('Pushback.TT.UseControllerInput')}>
              <div className="mt-4 flex flex-row items-center">
                <div className="mr-3 flex min-w-0 grow flex-col">
                  <span className="text-sm font-semibold">{t('Pushback.UseControllerInput')}</span>
                  <span className="text-xs leading-tight text-m3-muted">{t('Pushback.ControllerHint')}</span>
                </div>
                <M3Switch
                  value={!!useControllerInput}
                  onToggle={(value) => setUseControllerInput(value ? 1 : 0)}
                  aria-label={t('Pushback.UseControllerInput')}
                />
              </div>
            </TooltipWrapper>
          </M3Card>
        </div>
      </div>
    </M3Page>
  );
};
