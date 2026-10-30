// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useRef, useState } from 'react';
import { useSimVar, useUpdate } from '@flybywiresim/fbw-sdk-react';
import { IsisDisplayUnitState, IsisPowerSequence, IsisPowerSequenceChange } from '@flybywiresim/fbw-sdk';
import { IsisUnit } from '@shared/IsisConfiguration';
import { POWER_UP_SLOT_SECONDS, PowerUpGate } from '@shared/PowerUpStagger';
import { PressureIndicator } from './PressureIndicator';

type ISISDisplayUnitProps = {
  indicatedAirspeed: number;
  unit: IsisUnit;
};

export const ISISDisplayUnit: React.FC<ISISDisplayUnitProps> = ({ indicatedAirspeed, unit, children }) => {
  const [isColdAndDark] = useSimVar('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool', 200);

  const [state, setState] = useState(isColdAndDark ? IsisDisplayUnitState.Off : IsisDisplayUnitState.Standby);
  const [powerSequence] = useState(() => new IsisPowerSequence(state));
  const [timer, setTimer] = useState<number | null>(null);

  const [dcEssLive] = useSimVar('L:A32NX_ELEC_DC_ESS_BUS_IS_POWERED', 'bool');
  const [dcHotLive] = useSimVar('L:A32NX_ELEC_DC_HOT_1_BUS_IS_POWERED', 'bool');

  const hasElectricity = (indicatedAirspeed > 50 && dcHotLive) || dcEssLive;

  const powerUpGate = useRef(new PowerUpGate(unit === 1 ? POWER_UP_SLOT_SECONDS.Isis1 : POWER_UP_SLOT_SECONDS.Isis2));
  const powerUpWaitSeconds = powerUpGate.current.update(!!hasElectricity, Date.now() / 1000);
  const [, setWaitEndedCount] = useState(0);

  const renderChange = (change: IsisPowerSequenceChange) => {
    if (change & IsisPowerSequenceChange.State) {
      setState(powerSequence.state);
    }
    if (change & IsisPowerSequenceChange.Timer) {
      setTimer(powerSequence.remainingSeconds);
    }
  };

  useUpdate((deltaTime) => {
    // Renders the ISIS again when its slot has passed, so that the effect below can start it
    if (powerUpWaitSeconds > 0 && powerUpGate.current.update(!!hasElectricity, Date.now() / 1000) === 0) {
      setWaitEndedCount((count) => count + 1);
    }

    renderChange(powerSequence.update(deltaTime));

    // override MSFS menu animations setting for this instrument
    if (!document.documentElement.classList.contains('animationsEnabled')) {
      document.documentElement.classList.add('animationsEnabled');
    }
  });

  useEffect(() => {
    renderChange(powerSequence.applyPower(!!hasElectricity, powerUpWaitSeconds === 0));
  });

  if (state === IsisDisplayUnitState.Selftest) {
    return (
      <>
        <svg
          id="SelfTest"
          style={{ backgroundColor: 'black' }}
          className="SelfTest"
          version="1.1"
          viewBox="0 0 512 512"
        >
          <g id="AttFlag">
            <rect id="AttTest" className="FillYellow" width="110" height="40" x="190" y="174" />
            <text id="AltTestTxt" className="TextBackground" textAnchor="middle" x="245" y="206">
              ATT
            </text>
          </g>
          <g id="SpeedFlag">
            <rect id="SpeedTest" className="FillYellow" width="84" height="40" x="40" y="244" />
            <text id="SpeedTestTxt" className="TextBackground" textAnchor="middle" x="82" y="277">
              SPD
            </text>
          </g>
          <g id="AltFlag">
            <rect id="AltTest" className="FillYellow" width="110" height="40" x="358" y="244" />
            <text id="AltTestTxt" className="TextBackground" textAnchor="middle" x="415" y="277">
              ALT
            </text>
          </g>
          <g id="TimerFlag">
            <rect id="TmrTest" className="FillYellow" width="180" height="40" x="150" y="332" />
            <text id="TmrTestTxt" className="TextBackground FontMedium" x="160" y="365">
              INIT
            </text>
            <text id="TmrTestCountdown" className="TextBackground FontMedium" textAnchor="end" x="325" y="365">
              {Math.max(0, Math.ceil(timer!))}s
            </text>
          </g>
          <PressureIndicator />
        </svg>
      </>
    );
  }

  if (state === IsisDisplayUnitState.Off) {
    return (
      <svg id="Off" style={{ backgroundColor: 'black' }} className="SelfTest" version="1.1" viewBox="0 0 512 512" />
    );
  }

  return <>{children}</>;
};
