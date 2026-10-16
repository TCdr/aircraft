// Copyright (c) 2021-2023 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import React, { FC, useEffect, useState } from 'react';
import Valve from './Valve';
import { APU_BLEED_PB_CONFIRMATION_MS, apuBleedValveCss } from './ApuBleedValveIndication';

interface APUValveProps {
  x: number;
  y: number;
  sdacDatum: boolean;
}

const APUValve: FC<APUValveProps> = ({ x, y, sdacDatum }) => {
  const [apuBleedAirValveOpen] = useSimVar('L:A32NX_APU_BLEED_AIR_VALVE_OPEN', 'bool', 500);
  const [apuMasterSwitchPbIsOn] = useSimVar('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 'bool', 500);
  const [apuAvail] = useSimVar('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE', 'Bool', 1000);
  const [apuBleedPbIsOn] = useSimVar('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON', 'bool', 500);
  // The APU BLEED pb ON for more than 10 s (FCOM l.57807-57808, ApuBleedValveIndication.ts)
  const [apuBleedPbOnConfirmed, setApuBleedPbOnConfirmed] = useState(false);
  useEffect(() => {
    if (apuBleedPbIsOn) {
      const timeout = setTimeout(() => setApuBleedPbOnConfirmed(true), APU_BLEED_PB_CONFIRMATION_MS);
      return () => clearTimeout(timeout);
    }
    setApuBleedPbOnConfirmed(false);
    return () => {};
  }, [apuBleedPbIsOn]);
  const visible = apuMasterSwitchPbIsOn === 1 || apuAvail === 1;

  return visible ? (
    <g id="apu-bleed">
      <path
        className={apuBleedAirValveOpen === 1 || !sdacDatum ? 'GreenLine' : 'Hide'}
        d={`M ${x},${y - 15} l 0,-57`}
      />
      <Valve
        x={x}
        y={y}
        radius={15}
        css={apuBleedValveCss(apuBleedAirValveOpen > 0, apuMasterSwitchPbIsOn > 0, apuBleedPbOnConfirmed)}
        position={apuBleedAirValveOpen === 1 ? 'V' : 'H'}
        sdacDatum={sdacDatum}
      />
      <path className="GreenLine" d={`M ${x},${y + 15} l 0,19`} />
      <text className="Large White Center" x={x} y={y + 52}>
        APU
      </text>
    </g>
  ) : null;
};

export default APUValve;
