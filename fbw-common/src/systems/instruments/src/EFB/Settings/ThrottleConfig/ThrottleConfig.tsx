// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-disable max-len */
import React, { useContext, useEffect, useState } from 'react';
import { usePersistentNumberProperty, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { ExclamationCircleFill, InfoCircleFill } from 'react-bootstrap-icons';
import {
  AircraftContext,
  PromptModal,
  SelectItem,
  t,
  Toggle,
  useModals,
  VerticalSelectGroup,
} from '@flybywiresim/flypad';
import { M3Banner, M3Button, M3Card, M3Segmented } from '../../UtilComponents/Material/Material';
import { BaseThrottleConfig } from './BaseThrottleConfig';
import { ThrottleSimvar } from './ThrottleSimVar';

/**
 * The throttle config component props
 * @param isShown - if the component is shown
 * @param onClose - the function to call when the component is closed
 */
interface ThrottleConfigProps {
  isShown: boolean;
  onClose: () => void;
}

/**
 * The throttle config component is used to configure the throttle mappings in the EFB.
 * It is flexible and can be used for 1, 2 or 4 axis for the A320 (2 throttles) and A380 (4 throttles).
 *
 * The current implementation is a refactor from the initial A320-only implementation which was not
 * intended to be used for the A380. It might be worth to refactor this component to be more generic
 * and clean up the code.
 *
 * @see ThrottleConfigProps
 * @constructor
 */
export const ThrottleConfig = ({ isShown, onClose }: ThrottleConfigProps) => {
  const aircraftContext = useContext(AircraftContext);

  // the number of throttles that are used in the aircraft (2 or 4)
  const numberOfThrottles = aircraftContext.settingsPages.throttle.numberOfAircraftThrottles;

  const [axisNum, setAxisNum] = usePersistentNumberProperty('THROTTLE_AXIS', numberOfThrottles);
  // this makes sure that the axis number is set to 2 when the A320 is selected when previously the A380 with 4 axis was used
  if (axisNum > numberOfThrottles) {
    setAxisNum(numberOfThrottles);
  }

  const [selectedDetent, setSelectedDetent] = useState(2);
  const [validConfig, setValidConfig] = useState(true);
  const [validationError, setValidationError] = useState<string>();

  // prettier-ignore
  const [reverserOnAxis1, setReverserOnAxis1] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:1', 'number', 1000,);
  const [, setReverserOnAxis2] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:2', 'number', 1000);
  const [, setReverserOnAxis3] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:3', 'number', 1000);
  const [, setReverserOnAxis4] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_REVERSE_ON_AXIS:4', 'number', 1000);

  const [togaOnAxis1, setTogaOnAxis1] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_TOGA_ON_AXIS:1', 'number', 1000);
  const [, setTogaOnAxis2] = useSimVar('L:A32NX_THROTTLE_MAPPING_USE_TOGA_ON_AXIS:2', 'number', 1000);

  const [, syncToDisk] = useSimVar('K:A32NX.THROTTLE_MAPPING_SAVE_TO_FILE', 'number', 1000);
  const [, defaultsToThrottle] = useSimVar('K:A32NX.THROTTLE_MAPPING_SET_DEFAULTS', 'number', 100);
  const [, syncToThrottle] = useSimVar('K:A32NX.THROTTLE_MAPPING_LOAD_FROM_FILE', 'number', 100);
  const [, applyLocalVar] = useSimVar('K:A32NX.THROTTLE_MAPPING_LOAD_FROM_LOCAL_VARIABLES', 'number', 1000);

  const { showModal } = useModals();

  // simvars for each virtual throttle (we define 4 even for the A320 and ignore 3 + 4)
  const throttleOneSimvars: Array<ThrottleSimvar> = [
    new ThrottleSimvar('Reverse Full', 'L:A32NX_THROTTLE_MAPPING_REVERSE_', 1),
    new ThrottleSimvar('Reverse Idle', 'L:A32NX_THROTTLE_MAPPING_REVERSE_IDLE_', 1),
    new ThrottleSimvar('Idle', 'L:A32NX_THROTTLE_MAPPING_IDLE_', 1),
    new ThrottleSimvar('Climb', 'L:A32NX_THROTTLE_MAPPING_CLIMB_', 1),
    new ThrottleSimvar('Flex', 'L:A32NX_THROTTLE_MAPPING_FLEXMCT_', 1),
    new ThrottleSimvar('TOGA', 'L:A32NX_THROTTLE_MAPPING_TOGA_', 1),
  ];
  const throttleTwoSimvars: Array<ThrottleSimvar> = [
    new ThrottleSimvar('Reverse Full', 'L:A32NX_THROTTLE_MAPPING_REVERSE_', 2),
    new ThrottleSimvar('Reverse Idle', 'L:A32NX_THROTTLE_MAPPING_REVERSE_IDLE_', 2),
    new ThrottleSimvar('Idle', 'L:A32NX_THROTTLE_MAPPING_IDLE_', 2),
    new ThrottleSimvar('Climb', 'L:A32NX_THROTTLE_MAPPING_CLIMB_', 2),
    new ThrottleSimvar('Flex', 'L:A32NX_THROTTLE_MAPPING_FLEXMCT_', 2),
    new ThrottleSimvar('TOGA', 'L:A32NX_THROTTLE_MAPPING_TOGA_', 2),
  ];
  const throttleThreeSimvars: Array<ThrottleSimvar> = [
    new ThrottleSimvar('Reverse Full', 'L:A32NX_THROTTLE_MAPPING_REVERSE_', 3),
    new ThrottleSimvar('Reverse Idle', 'L:A32NX_THROTTLE_MAPPING_REVERSE_IDLE_', 3),
    new ThrottleSimvar('Idle', 'L:A32NX_THROTTLE_MAPPING_IDLE_', 3),
    new ThrottleSimvar('Climb', 'L:A32NX_THROTTLE_MAPPING_CLIMB_', 3),
    new ThrottleSimvar('Flex', 'L:A32NX_THROTTLE_MAPPING_FLEXMCT_', 3),
    new ThrottleSimvar('TOGA', 'L:A32NX_THROTTLE_MAPPING_TOGA_', 3),
  ];
  const throttleFourSimvars: Array<ThrottleSimvar> = [
    new ThrottleSimvar('Reverse Full', 'L:A32NX_THROTTLE_MAPPING_REVERSE_', 4),
    new ThrottleSimvar('Reverse Idle', 'L:A32NX_THROTTLE_MAPPING_REVERSE_IDLE_', 4),
    new ThrottleSimvar('Idle', 'L:A32NX_THROTTLE_MAPPING_IDLE_', 4),
    new ThrottleSimvar('Climb', 'L:A32NX_THROTTLE_MAPPING_CLIMB_', 4),
    new ThrottleSimvar('Flex', 'L:A32NX_THROTTLE_MAPPING_FLEXMCT_', 4),
    new ThrottleSimvar('TOGA', 'L:A32NX_THROTTLE_MAPPING_TOGA_', 4),
  ];

  // if there is no reverser on axis 1, set the selected detent to idle
  useEffect(() => {
    if (reverserOnAxis1 === 0 && selectedDetent < 2) {
      setSelectedDetent(2);
    }
    if (togaOnAxis1 === 0 && selectedDetent > 4) {
      setSelectedDetent(4);
    }
  }, [reverserOnAxis1, selectedDetent]);

  // checks if there are any overlaps in the throttle mappings and returns an array of errors
  const getOverlapErrors = (axis: number, mappingsAxis: ThrottleSimvar[]) => {
    const overlapErrors: string[] = [];
    for (
      let index = reverserOnAxis1 ? 0 : 2;
      index < (togaOnAxis1 ? mappingsAxis.length : mappingsAxis.length - 1);
      index++
    ) {
      // A380 has 4 throttles but only throttles 2 + 3 are used for Reverse Full and Reverse Idle - therefore we skip
      // these checks as the UI does not even allow to set these mappings from the throttles
      if (numberOfThrottles === 4 && (axis === 1 || axis === 4) && index < 2) {
        continue;
      }
      const element = mappingsAxis[index];
      for (
        let nextIndex = index + 1;
        nextIndex < (togaOnAxis1 ? mappingsAxis.length : mappingsAxis.length - 1);
        nextIndex++
      ) {
        const nextElement = mappingsAxis[nextIndex];
        if (
          element.getHiGetter() >= nextElement.getLowGetter() ||
          element.getLowGetter() >= nextElement.getHiGetter()
        ) {
          overlapErrors.push(
            `${t('Settings.ThrottleConfig.Axis')} ${axis}: ${element.readableName} (${element.getLowGetter().toFixed(2)}) ${t('Settings.ThrottleConfig.ErrorOverlapMsg')} ${nextElement.readableName} (${nextElement.getLowGetter().toFixed(2)})`,
          );
        }
      }
    }
    return overlapErrors;
  };

  // when a throttle config changes this checks if there are any overlaps in the throttle mappings
  // and sets the validation error and valid config
  useEffect(() => {
    const errors: string[] = [];
    errors.push(...getOverlapErrors(1, throttleOneSimvars));
    errors.push(...getOverlapErrors(2, throttleTwoSimvars));
    // to avoid false errors only 2 axis are used
    if (numberOfThrottles === 4) {
      errors.push(...getOverlapErrors(3, throttleThreeSimvars));
      errors.push(...getOverlapErrors(4, throttleFourSimvars));
    }
    setValidationError(errors[0]);
    setValidConfig(errors.length === 0);
  }, [throttleOneSimvars, throttleTwoSimvars, throttleThreeSimvars, throttleFourSimvars]);

  const setReversersOnAxis = (reverserOnAxis: number) => {
    setReverserOnAxis1(reverserOnAxis);
    setReverserOnAxis2(reverserOnAxis);
    setReverserOnAxis3(reverserOnAxis);
    setReverserOnAxis4(reverserOnAxis);
    if (reverserOnAxis === 0 && selectedDetent < 2) {
      setSelectedDetent(2);
    }
  };

  const setTogaOnAxis = (togaOnAxis: number) => {
    setTogaOnAxis1(togaOnAxis);
    setTogaOnAxis2(togaOnAxis);
    if (togaOnAxis === 0 && selectedDetent > 4) {
      setSelectedDetent(4);
    }
  };

  const switchDetent = (index: number) => {
    if (index >= 0 && index <= 5) {
      setSelectedDetent(index);
    }
  };

  // the detent being calibrated, from TO/GA at the top to reverse full at the bottom
  const detentItemClassName = '!px-2 !text-sm text-center';
  const navigationBar = (
    <VerticalSelectGroup>
      <SelectItem
        disabled={!togaOnAxis1}
        className={detentItemClassName}
        onSelect={() => {
          if (togaOnAxis1) {
            switchDetent(5);
          }
        }}
        selected={selectedDetent === 5}
      >
        TO/GA
      </SelectItem>
      <SelectItem className={detentItemClassName} onSelect={() => switchDetent(4)} selected={selectedDetent === 4}>
        FLX
      </SelectItem>
      <SelectItem className={detentItemClassName} onSelect={() => switchDetent(3)} selected={selectedDetent === 3}>
        CLB
      </SelectItem>
      <SelectItem className={detentItemClassName} onSelect={() => switchDetent(2)} selected={selectedDetent === 2}>
        Idle
      </SelectItem>
      <SelectItem
        disabled={!reverserOnAxis1}
        className={detentItemClassName}
        onSelect={() => {
          if (reverserOnAxis1) {
            switchDetent(1);
          }
        }}
        selected={selectedDetent === 1}
      >
        {t('Settings.ThrottleConfig.ReverseIdle')}
      </SelectItem>
      <SelectItem
        disabled={!reverserOnAxis1}
        className={detentItemClassName}
        onSelect={() => {
          if (reverserOnAxis1) {
            switchDetent(0);
          }
        }}
        selected={selectedDetent === 0}
      >
        {t('Settings.ThrottleConfig.ReverseFull')}
      </SelectItem>
    </VerticalSelectGroup>
  );

  const axisSelectGroup = (
    <M3Segmented
      className={aircraftContext.settingsPages.throttle.axisOptions.length > 2 ? 'w-36' : 'w-24'}
      options={aircraftContext.settingsPages.throttle.axisOptions.map((option) => ({
        label: `${option}`,
        selected: axisNum === option,
        onClick: () => setAxisNum(option),
      }))}
    />
  );

  // The calibration UI displays a number of axes usually corresponding to the number of levers/axes a user has for their throttle.
  // The UI will display 1, 2 or 4 axis depending on the user's setting (usually based on the aircraft and the user's hardware).
  // So we must configure this UI to display the correct number of axes with the correct throttle MSFS mappings (input) and
  // behavior.
  // E.g.:
  // - A320 with 2 hardware axis and 2 throttles will use hardware axis 1 for throttle 1, and hardware axis 2 for throttle 2
  // - A380 with 2 hardware axis and 4 throttles will use hardware axis 1 for throttle 1 + 2 and 2 for throttle 3 + 4
  // We call the current user hardware axis to be displayed the "userAxis".
  // We call the throttle mappings the "inputThrottle". (e.g. A380X userAxis 2 will use inputThrottle 3 as per MSFSconfig).
  // We call the number of user hardware axes the "numberOfUserAxes".
  // We call the number of throttles of the aircraft the "numberOfThrottles".
  //
  // Layout: the axis cards and the detent list share one row that fits the right pane of the Settings (about 920 px
  // wide): one or two axes get cards of a fixed width, four axes share the row equally (narrow cards, smaller texts).
  const wideAxisCard = 'w-72';
  const narrowAxisCard = 'min-w-0 flex-1';

  // A320 uses axis 1 for throttle 1 and axis 2 for throttle 2
  const oneAxis = (
    <div className="flex flex-row justify-center">
      <BaseThrottleConfig
        className={wideAxisCard}
        userAxis={1}
        inputThrottle={1}
        numberOfUserAxes={1}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleOneSimvars}
        throttleSimvarsSet2={throttleTwoSimvars}
        throttleSimvarsSet3={throttleThreeSimvars}
        throttleSimvarsSet4={throttleFourSimvars}
        activeDetent={selectedDetent}
      />
      <div className="ml-6 w-28 shrink-0 self-center">{navigationBar}</div>
    </div>
  );

  // A320 uses axis 1 for throttle 1 and axis 2 for throttle 2
  const twoAxisA320 = (
    <div className="flex flex-row justify-center">
      <BaseThrottleConfig
        className={wideAxisCard}
        userAxis={1}
        inputThrottle={1}
        numberOfUserAxes={2}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleOneSimvars}
        activeDetent={selectedDetent}
      />
      <div className="mx-6 w-28 shrink-0 self-center">{navigationBar}</div>
      <BaseThrottleConfig
        className={wideAxisCard}
        userAxis={2}
        inputThrottle={2}
        numberOfUserAxes={2}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleTwoSimvars}
        activeDetent={selectedDetent}
      />
    </div>
  );

  // A380 uses axis 1 for throttle 1 + 2 and axis 2 for throttle 3 + 4
  const twoAxisA380 = (
    <div className="flex flex-row justify-center">
      <BaseThrottleConfig
        className={wideAxisCard}
        userAxis={1}
        inputThrottle={1}
        numberOfUserAxes={2}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleOneSimvars}
        throttleSimvarsSet2={throttleTwoSimvars}
        activeDetent={selectedDetent}
      />
      <div className="mx-6 w-28 shrink-0 self-center">{navigationBar}</div>
      <BaseThrottleConfig
        className={wideAxisCard}
        userAxis={2}
        inputThrottle={3} // A380X uses input of throttle 3 for the second user hardware axis as per MSFS mapping
        numberOfUserAxes={2}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleThreeSimvars}
        throttleSimvarsSet2={throttleFourSimvars}
        activeDetent={selectedDetent}
      />
    </div>
  );

  const fourAxis = (
    <div className="flex flex-row">
      <BaseThrottleConfig
        className={narrowAxisCard}
        userAxis={1}
        inputThrottle={1}
        numberOfUserAxes={4}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleOneSimvars}
        activeDetent={selectedDetent}
        reverseDisabled
      />
      <BaseThrottleConfig
        className={`ml-2 ${narrowAxisCard}`}
        userAxis={2}
        inputThrottle={2}
        numberOfUserAxes={4}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleTwoSimvars}
        activeDetent={selectedDetent}
      />
      <div className="mx-2 w-28 shrink-0 self-center">{navigationBar}</div>
      <BaseThrottleConfig
        className={narrowAxisCard}
        userAxis={3}
        inputThrottle={3}
        numberOfUserAxes={4}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleThreeSimvars}
        activeDetent={selectedDetent}
      />
      <BaseThrottleConfig
        className={`ml-2 ${narrowAxisCard}`}
        userAxis={4}
        inputThrottle={4}
        numberOfUserAxes={4}
        numberOfThrottles={numberOfThrottles}
        throttleSimvarsSet1={throttleFourSimvars}
        activeDetent={selectedDetent}
        reverseDisabled
      />
    </div>
  );

  const getAxis = () => {
    switch (axisNum) {
      case 4:
        if (aircraftContext.settingsPages.throttle.numberOfAircraftThrottles === 4) {
          return fourAxis;
        }
        console.warn('A320 does not have 4 axis - defaulting to 2 axis');
        return twoAxisA320;
      case 2:
        if (aircraftContext.settingsPages.throttle.numberOfAircraftThrottles === 4) {
          return twoAxisA380;
        }
        return twoAxisA320;
      case 1:
      default:
        return oneAxis;
    }
  };

  if (!isShown) return null;

  // One card in the right pane of the Settings, every row a direct child of it so that the buttons stay on screen:
  // the title, the axis options, the axes (the rest of the height), the messages, the buttons.
  return (
    <M3Card className="h-content-section-reduced w-full">
      <div className="flex shrink-0 flex-row items-center px-6 pb-2 pt-5">
        <span className="text-2xl font-bold text-m3-text">{t('Settings.SimOptions.ThrottleDetents')}</span>
      </div>

      <div className="mx-6 mt-2 flex shrink-0 flex-row items-center justify-between rounded-2xl bg-m3-card-low px-4 py-2">
        <div className="flex flex-row items-center">
          <span className="mr-3 text-sm font-semibold text-m3-text">{t('Settings.ThrottleConfig.TogaOnAxis')}</span>
          <Toggle value={!!togaOnAxis1} onToggle={(value) => setTogaOnAxis(value ? 1 : 0)} />
        </div>
        <div className="flex flex-row items-center">
          <span className="mr-3 text-sm font-semibold text-m3-text">{t('Settings.ThrottleConfig.ReverserOnAxis')}</span>
          <Toggle value={!!reverserOnAxis1} onToggle={(value) => setReversersOnAxis(value ? 1 : 0)} />
        </div>
        <div className="flex flex-row items-center">
          <span className="mr-3 text-sm font-semibold text-m3-text">
            {t('Settings.ThrottleConfig.IndependentAxis')}
          </span>
          {axisSelectGroup}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden px-4 py-3">{getAxis()}</div>

      {/* To make sure users map throttles 1+2 to axis 1 and 3+4 to axis 2 and not any other grouping */}
      {validConfig && numberOfThrottles === 4 && axisNum === 2 && (
        <M3Banner tone="idle" icon={<InfoCircleFill size={18} />} className="mx-6 shrink-0">
          {t('Settings.ThrottleConfig.FourThrottleWarning')}
        </M3Banner>
      )}

      {!validConfig && (
        <M3Banner tone="warn" icon={<ExclamationCircleFill size={18} />} className="mx-6 shrink-0">
          {validationError}
        </M3Banner>
      )}

      <div className="mx-6 mb-5 mt-3 flex shrink-0 flex-row items-center justify-between">
        <M3Button tone="outline" onClick={onClose}>
          {t('Settings.ThrottleConfig.Back')}
        </M3Button>
        <div className="flex flex-row space-x-3">
          <M3Button
            tone="outline"
            onClick={() => {
              showModal(
                <PromptModal
                  title={t('Settings.ThrottleConfig.ThrottleConfigurationReset')}
                  bodyText={t(
                    'Settings.ThrottleConfig.AreYouSureThatYouWantToResetYourCurrentThrottleConfigurationToTheirDefaultStates',
                  )}
                  onConfirm={() => {
                    defaultsToThrottle(1);
                  }}
                />,
              );
            }}
          >
            {t('Settings.ThrottleConfig.ResetToDefaults')}
          </M3Button>
          <M3Button
            tone="outline"
            onClick={() => {
              syncToThrottle(1);
            }}
          >
            {t('Settings.ThrottleConfig.LoadFromFile')}
          </M3Button>
          {/* Apply stays clickable with an invalid configuration, as before: it only looks inactive */}
          <M3Button tone="tonal" className={validConfig ? '' : 'opacity-40'} onClick={() => applyLocalVar(1)}>
            {t('Settings.ThrottleConfig.Apply')}
          </M3Button>
          <M3Button
            tone="primary"
            disabled={!validConfig}
            onClick={() => {
              if (validConfig) {
                syncToDisk(1);
                applyLocalVar(1);
              }
            }}
          >
            {t('Settings.ThrottleConfig.SaveAndApply')}
          </M3Button>
        </div>
      </div>
    </M3Card>
  );
};
