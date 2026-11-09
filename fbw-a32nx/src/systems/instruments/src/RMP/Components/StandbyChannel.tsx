// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useCallback, useRef } from 'react';
import { RateMultiplierKnob, UpdateValueCallback, useInteractionEvent } from '@flybywiresim/fbw-sdk-react';
import { RadioPanelDisplay } from './RadioPanelDisplay';
import { formatGlsChannel, stepGlsChannel } from './RmpNavBackupTuning';

interface Props {
  /**
   * The RMP side (e.g. 'L' or 'R').
   */
  side: string;

  /**
   * The current standby GLS channel.
   */
  value: number;

  /**
   * A callback to set the current standby GLS channel.
   */
  setValue: (channel: number) => void;
}

/**
 * Standby GLS channel radio management panel React component.
 * The outer knob sets the leading digits of the channel, the inner knob the last two.
 */
export const StandbyChannel = (props: Props) => {
  const outerKnobUpdateCallback: UpdateValueCallback = useCallback(
    (offset) => props.setValue(stepGlsChannel(props.value, offset, 0)),
    [props.value],
  );

  const innerKnobUpdateCallback: UpdateValueCallback = useCallback(
    (offset) => props.setValue(stepGlsChannel(props.value, 0, offset)),
    [props.value],
  );

  const outerKnob = useRef(new RateMultiplierKnob());
  outerKnob.current.updateValue = outerKnobUpdateCallback;

  const innerKnob = useRef(new RateMultiplierKnob());
  innerKnob.current.updateValue = innerKnobUpdateCallback;

  useInteractionEvent(`A32NX_RMP_${props.side}_OUTER_KNOB_TURNED_CLOCKWISE`, () => outerKnob.current.increase());
  useInteractionEvent(`A32NX_RMP_${props.side}_OUTER_KNOB_TURNED_ANTICLOCKWISE`, () => outerKnob.current.decrease());
  useInteractionEvent(`A32NX_RMP_${props.side}_INNER_KNOB_TURNED_CLOCKWISE`, () => innerKnob.current.increase());
  useInteractionEvent(`A32NX_RMP_${props.side}_INNER_KNOB_TURNED_ANTICLOCKWISE`, () => innerKnob.current.decrease());

  // A string, as the display would show a number of this size as an ADF frequency
  return <RadioPanelDisplay value={formatGlsChannel(props.value)} />;
};
