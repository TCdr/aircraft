// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';

import { useSimVar, useInteractionEvent } from '@flybywiresim/fbw-sdk-react';
import { StandbyFrequency, TransceiverType } from './StandbyFrequency';
import { StandbyCourse } from './StandbyCourse';
import { StandbyChannel } from './StandbyChannel';
import { RadioPanelDisplay } from './RadioPanelDisplay';
import {
  formatGlsChannel,
  GLS_CHANNEL_DEFAULT,
  isApprModeArmedOrEngaged,
  isBelowIlsTuneInhibitHeight,
  isLsTuneInhibited,
  RMP_GLS_CHANNEL_VAR,
  rmpAdfStandbyAfterTransfer,
  rmpLandingSystemTransferWrites,
  rmpTransferTuning,
} from './RmpNavBackupTuning';

interface Props {
  /**
   * The RMP side (e.g. 'L' or 'R').
   */
  side: string;

  /**
   * The NAV transceiver  (VOR, ILS, GLS, ADF).
   */
  transceiver: number;
}

enum Mode {
  FREQUENCY = 0,
  COURSE = 1,
}

/*
* Had to use this simvars to save the frequencies set via the RMP
* In real life, if you tune a navaid via the MCDU and then press NAV, the frequency is not the same
/

/**
 *
 * @param transceiver The transceiver type (VOR, ADF, ILS or GLS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useActiveFrequency = (transceiver: number, side: string) => {
  switch (transceiver) {
    case TransceiverType.VOR:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_VOR`, 'number');
    case TransceiverType.ADF:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_ADF`, 'number');
    case TransceiverType.GLS:
      // Both MMRs are tuned to the same channel, whichever RMP tuned it
      return useSimVar(RMP_GLS_CHANNEL_VAR, 'number');
    default:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_ACTIVE_FREQUENCY_ILS`, 'number');
  }
};

/**
 *
 * @param transceiver The transceiver type (VOR, ADF, ILS or GLS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useStandbyFrequency = (transceiver: number, side: string) => {
  switch (transceiver) {
    case TransceiverType.VOR:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_VOR`, 'number');
    case TransceiverType.ADF:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_ADF`, 'number');
    case TransceiverType.GLS:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_CHANNEL_GLS`, 'number');
    default:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_STANDBY_FREQUENCY_ILS`, 'number');
  }
};

/**
 *
 * @param transceiver The transceiver type (VOR, ADF, ILS or GLS)
 * @param side Side on which the transceiver is (L or R)
 * @returns a tuble simvar
 */
const useCourse = (transceiver: number, side: string) => {
  switch (transceiver) {
    case TransceiverType.VOR:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_COURSE_VOR`, 'number');
    default:
      return useSimVar(`L:A32NX_RMP_${side}_SAVED_COURSE_ILS`, 'number');
  }
};

const setActiveFrequencySimVar = (transceiver: number, index: number, frequency: number) => {
  if (transceiver === TransceiverType.ADF) {
    SimVar.SetSimVarValue(
      `K:ADF${index === 1 ? '' : index}_ACTIVE_SET`,
      'Frequency ADF BCD32',
      Avionics.Utils.make_adf_bcd32(frequency),
    );
  }

  SimVar.SetSimVarValue(`K:NAV${index}_RADIO_SET_HZ`, 'Hz', frequency);
};

/**
 * NAV radio management panel React component.
 * Hooks into the mode active and standby frequency SimVars and wires transfer button.
 * Renders active frequency RadioPanelDisplay and appropriate StandbyFrequency sub-components.
 */
export const NavRadioPanel = (props: Props) => {
  let standbyWindow: JSX.Element;

  // The VOR and the ADF of the RMP's own side
  const index = props.side === 'L' ? 1 : 2;

  const [mode, setMode] = useState(Mode.FREQUENCY);

  const [activeFrequency, setActiveFrequencySaved] = useActiveFrequency(props.transceiver, props.side);
  const [standbyFrequency, setStandbyFrequencySaved] = useStandbyFrequency(props.transceiver, props.side);
  const [course, setCourseSaved] = useCourse(props.transceiver, props.side);

  const isGls = props.transceiver === TransceiverType.GLS;

  const [, setCourse] = useSimVar(
    props.transceiver === TransceiverType.VOR ? `K:VOR${index}_SET` : 'L:A32NX_FM_LS_COURSE',
    'number',
    100,
  );

  // ILS tune inhibit inputs (see RmpNavBackupTuning.isLsTuneInhibited)
  const [fmaLateralMode] = useSimVar('L:A32NX_FMA_LATERAL_MODE', 'number');
  const [fmaLateralArmed] = useSimVar('L:A32NX_FMA_LATERAL_ARMED', 'number');
  const [fmaVerticalMode] = useSimVar('L:A32NX_FMA_VERTICAL_MODE', 'number');
  const [fmaVerticalArmed] = useSimVar('L:A32NX_FMA_VERTICAL_ARMED', 'number');
  const [apEngaged] = useSimVar('L:A32NX_AUTOPILOT_ACTIVE', 'bool');
  const [fd1Engaged] = useSimVar('L:A32NX_FMGC_1_FD_ENGAGED', 'bool');
  const [fd2Engaged] = useSimVar('L:A32NX_FMGC_2_FD_ENGAGED', 'bool');
  const [radioAltitude1] = useSimVar('L:A32NX_RA_1_RADIO_ALTITUDE', 'number');
  const [radioAltitude2] = useSimVar('L:A32NX_RA_2_RADIO_ALTITUDE', 'number');

  // Nothing is saved before the first entry: the window starts at the bottom of the channel range
  const standbyChannel = standbyFrequency > 0 ? standbyFrequency : GLS_CHANNEL_DEFAULT;

  useInteractionEvent(`A32NX_RMP_${props.side}_TRANSFER_BUTTON_PRESSED`, () => {
    const lsTuneInhibited = isLsTuneInhibited(
      props.transceiver === TransceiverType.ILS || isGls,
      isBelowIlsTuneInhibitHeight(radioAltitude1, radioAltitude2),
      isApprModeArmedOrEngaged(fmaLateralMode, fmaLateralArmed, fmaVerticalMode, fmaVerticalArmed),
      apEngaged > 0 || fd1Engaged > 0 || fd2Engaged > 0,
    );
    if (!lsTuneInhibited) {
      if (mode === Mode.FREQUENCY) {
        // Design choice: the receiver of a GLS flies the course of its uplink, so the GLS has no course to enter
        if (props.transceiver !== TransceiverType.ADF && !isGls) {
          setMode(Mode.COURSE);
        }

        let receiver: 'ILS' | 'GLS' | 'OTHER' = 'OTHER';
        if (isGls) {
          receiver = 'GLS';
        } else if (props.transceiver === TransceiverType.ILS) {
          receiver = 'ILS';
        }
        const bothNavKeysOn =
          !!SimVar.GetSimVarValue('L:A32NX_RMP_L_NAV_BUTTON_SELECTED', 'Bool') &&
          !!SimVar.GetSimVarValue('L:A32NX_RMP_R_NAV_BUTTON_SELECTED', 'Bool');
        const tuning = rmpTransferTuning(receiver, bothNavKeysOn);

        if (tuning === 'gls-channel' || tuning === 'ils-frequency') {
          rmpLandingSystemTransferWrites(tuning, isGls ? standbyChannel : standbyFrequency).forEach((write) =>
            SimVar.SetSimVarValue(write.name, write.unit, write.value),
          );
        } else if (tuning === 'frequency') {
          setActiveFrequencySimVar(props.transceiver, index, standbyFrequency);
        }
        if (!isGls) {
          setActiveFrequencySaved(standbyFrequency);
        }
        if (props.transceiver === TransceiverType.ADF) {
          setStandbyFrequencySaved(rmpAdfStandbyAfterTransfer(activeFrequency, standbyFrequency));
        }
      } else {
        setCourse(course);
        setMode(Mode.FREQUENCY);
      }
    }
  });

  // This effect to display frequency mode instead of course mode when switching between receivers.
  // After few debug sessions, it was noticed standbyFrequency was the first valuable sign of switch.
  // I could have listened props.transceiver but this caused flickering (very fast display of previous frequency) due to sequential render
  useEffect(() => {
    // Performance purpose. Could set Frequency everytime but setMode fires a render
    if (mode === Mode.COURSE) {
      setMode(Mode.FREQUENCY);
    }
  }, [standbyFrequency]);

  if (mode === Mode.FREQUENCY && isGls) {
    standbyWindow = <StandbyChannel side={props.side} value={standbyChannel} setValue={setStandbyFrequencySaved} />;
  } else if (mode === Mode.FREQUENCY) {
    standbyWindow = (
      <StandbyFrequency
        side={props.side}
        value={standbyFrequency}
        setValue={setStandbyFrequencySaved}
        transceiver={props.transceiver}
      />
    );
  } else {
    standbyWindow = <StandbyCourse side={props.side} value={course} setValue={setCourseSaved} />;
  }

  // Blank, not DATA, while no GLS channel is tuned
  let activeValue: number | string = activeFrequency;
  if (isGls) {
    activeValue = activeFrequency > 0 ? formatGlsChannel(activeFrequency) : '';
  }

  return (
    <span>
      <RadioPanelDisplay value={activeValue} />
      {standbyWindow}
    </span>
  );
};
