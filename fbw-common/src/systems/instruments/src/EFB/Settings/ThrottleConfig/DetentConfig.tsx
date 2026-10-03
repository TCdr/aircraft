// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useEffect, useState } from 'react';
import { t } from '../../Localization/translation';

import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3ActionChip } from '../../UtilComponents/Material/Material';
import { ThrottleDetentGauge } from './ThrottleDetentGauge';

interface Props {
  upperBoundDetentSetter;
  lowerBoundDetentSetter;
  lowerBoundDetentGetter;
  upperBoundDetentGetter;
  detentValue;
  throttlePosition;
  index;
  expertMode: boolean;
}

export const DetentConfig: React.FC<Props> = (props: Props) => {
  const [showWarning, setShowWarning] = useState(false);
  const [deadZone, setDeadZone] = useState(Math.abs(props.upperBoundDetentGetter - props.lowerBoundDetentGetter) / 2);
  const [previousMode, setPreviousMode] = useState(props.expertMode);

  // sets the throttle vars to the current throttle position + deadzone for each given throttle
  // multiple throttles can be set at once to have mappings with less axis than throttles (e.g. 2 axis for 4 throttles)
  const setFromTo = (
    throttle1Position: any,
    settingLower: any[],
    settingUpper: any[],
    deadZone: number,
    overrideValue?: string,
  ) => {
    const newSetting = overrideValue || throttle1Position;
    settingLower.forEach((f) => f(newSetting - deadZone < -1 ? -1 : newSetting - deadZone));
    settingUpper.forEach((f) => f(newSetting + deadZone > 1 ? 1 : newSetting + deadZone));
  };

  useEffect(() => {
    setPreviousMode(props.expertMode);
  }, [props.expertMode]);

  return (
    <div className="flex w-full shrink-0 flex-col items-center">
      <ThrottleDetentGauge
        position={props.throttlePosition}
        lowerBound={props.lowerBoundDetentGetter}
        upperBound={props.upperBoundDetentGetter}
        showDetent
      />
      <div className="mt-3 flex w-full flex-col">
        {!props.expertMode && (
          <>
            <span className="text-xs font-semibold text-m3-muted">{`${t('Settings.ThrottleConfig.Deadband')} +/-`}</span>
            <SimpleInput
              className="mt-1 w-full text-center"
              fontSizeClassName="text-sm"
              value={deadZone.toFixed(2)}
              reverse
              onChange={(deadZone) => {
                if (parseFloat(deadZone) >= 0.01) {
                  if (previousMode === props.expertMode) {
                    setShowWarning(false);
                    setDeadZone(parseFloat(deadZone));
                  }
                } else {
                  setShowWarning(true);
                }
              }}
            />
            <M3ActionChip
              primary
              className="mt-3 w-full"
              onClick={() => {
                setFromTo(props.throttlePosition, props.lowerBoundDetentSetter, props.upperBoundDetentSetter, deadZone);
              }}
            >
              {t('Settings.ThrottleConfig.SetFromThrottle')}
            </M3ActionChip>
          </>
        )}
        {props.expertMode && (
          <>
            <span className="text-xs font-semibold text-m3-muted">{t('Settings.ThrottleConfig.ConfigureEnd')}</span>
            <SimpleInput
              reverse
              className="mt-1 w-full text-center"
              fontSizeClassName="text-sm"
              value={!props.expertMode ? deadZone : props.upperBoundDetentGetter.toFixed(2)}
              onChange={(deadZone) => {
                if (previousMode === props.expertMode && deadZone.length > 1 && !Number.isNaN(Number(deadZone))) {
                  props.upperBoundDetentSetter.forEach((f) => f(parseFloat(deadZone)));
                  setShowWarning(false);
                }
              }}
            />
            <span className="mt-2 text-xs font-semibold text-m3-muted">
              {props.expertMode ? t('Settings.ThrottleConfig.ConfigureStart') : t('Settings.ThrottleConfig.Deadband')}
            </span>
            <SimpleInput
              className="mt-1 w-full text-center"
              fontSizeClassName="text-sm"
              reverse
              value={!props.expertMode ? deadZone : props.lowerBoundDetentGetter.toFixed(2)}
              onChange={(deadZone) => {
                if (previousMode === props.expertMode && deadZone.length > 1 && !Number.isNaN(Number(deadZone))) {
                  props.lowerBoundDetentSetter.forEach((f) => f(parseFloat(deadZone)));
                  setShowWarning(false);
                }
              }}
            />
          </>
        )}
        <span
          style={{ visibility: showWarning ? 'visible' : 'hidden' }}
          className="mt-2 h-8 w-full text-center text-xs leading-tight text-m3-on-error"
        >
          {`${t('Settings.ThrottleConfig.PleaseEnterAValidDeadzone')} (> 0.01)`}
        </span>
      </div>
    </div>
  );
};

// this is a dummy component that is used to display the detent config without the ability to change it
export const DummyDetentConfig: React.FC<Props> = (props: Props) => (
  <div className="flex w-full shrink-0 flex-col items-center">
    <ThrottleDetentGauge
      position={props.throttlePosition}
      lowerBound={props.lowerBoundDetentGetter}
      upperBound={props.upperBoundDetentGetter}
      showDetent={false}
    />
  </div>
);
