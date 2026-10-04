// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { DisplayUnit } from './displayUnit';
import React, { useState } from 'react';
import { render } from '@instruments/common/index';
import { FailuresConsumer, useSimVar, useUpdate } from '@flybywiresim/fbw-sdk-react';
import { LOWER_ECAM_DISPLAY_UNIT_FAILURE } from '../MsfsAvionicsCommon/displayUnitFailures';

import { PagesContainer } from './PagesContainer';

import './style.scss';

const Idle = () => {
  const [doorVideoEnabledNow] = useSimVar('L:A32NX_OVHD_COCKPITDOORVIDEO_TOGGLE', 'Bool');
  const [doorVideoPressedNow] = useSimVar('L:PUSH_DOORPANEL_VIDEO', 'Bool');

  const doorVideoVisible = doorVideoEnabledNow && doorVideoPressedNow;

  return (
    <div id="Mainframe">
      <svg className="sd-svg" viewBox="0 0 600 600">
        <PagesContainer />
      </svg>

      {doorVideoVisible && <div id="door-video-wrapper" />}
    </div>
  );
};

/** Receives the flyPad failures: the lower ECAM display unit failure blanks the SD. */
const failuresConsumer = new FailuresConsumer();

/** The lower ECAM display unit, blank while its flyPad failure is active (the SDv2 layer does the same). */
const SdDisplayUnit: React.FC = ({ children }) => {
  const [failed, setFailed] = useState(false);

  useUpdate(() => {
    failuresConsumer.update();
    // React skips the re-render when the value is unchanged
    setFailed(failuresConsumer.isActive(LOWER_ECAM_DISPLAY_UNIT_FAILURE));
  });

  return (
    <DisplayUnit
      electricitySimvar="L:A32NX_ELEC_AC_2_BUS_IS_POWERED"
      potentiometerIndex={93}
      normDmc={1}
      failed={failed}
    >
      {children}
    </DisplayUnit>
  );
};

render(
  <SdDisplayUnit>
    <Idle />
  </SdDisplayUnit>,
);
