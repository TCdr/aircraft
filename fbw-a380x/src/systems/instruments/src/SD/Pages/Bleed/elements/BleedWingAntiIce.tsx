// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { Triangle } from '@instruments/common/Shapes';
import { wingAntiIceIndication } from './WingAntiIceIndication';

interface BleedWingAntiIceProps {
  /** 1 left wing, 2 right wing */
  wing: 1 | 2;
}

/**
 * The WING A-ICE indication of one wing: the legend outboard of the engine 1 (4) bleed duct, the triangle on the duct
 * to the wing (y 370, as in BleedCrossbleed), pointing to the wing.
 */
const BleedWingAntiIce: FC<BleedWingAntiIceProps> = ({ wing }) => {
  const [valvesClosed] = useSimVar(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_VALVE_CLOSED`, 'bool', 500);
  const [abnormallyClosed] = useSimVar(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_ABNORMALLY_CLOSED`, 'bool', 500);
  const [abnormallyOpen] = useSimVar(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_ABNORMALLY_OPEN`, 'bool', 500);
  const [lowPressure] = useSimVar(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_LOW_PRESSURE`, 'bool', 500);
  const [highPressure] = useSimVar(`L:A32NX_PNEU_WING_ANTI_ICE_${wing}_HIGH_PRESSURE`, 'bool', 500);

  const display = wingAntiIceIndication({
    valvesClosed: !!valvesClosed,
    abnormallyClosed: !!abnormallyClosed,
    abnormallyOpen: !!abnormallyOpen,
    lowPressure: !!lowPressure,
    highPressure: !!highPressure,
  });
  if (display === 'hidden') {
    return null;
  }

  const isLeftWing = wing === 1;
  const legendColour = display === 'on' ? 'White' : 'Amber';
  const triangleColour = display === 'on' ? 'Green' : 'Amber';
  const legendX = isLeftWing ? 8 : 760;
  const legendAlign = isLeftWing ? 'StartAlign' : 'EndAlign';

  return (
    <g id={`WingAntiIce${wing}`}>
      <text x={legendX} y={360} className={`${legendColour} F22 ${legendAlign}`}>
        WING
      </text>
      <text x={legendX} y={384} className={`${legendColour} F22 ${legendAlign}`}>
        A-ICE
      </text>
      {display !== 'commandedOnRemainsOff' && (
        <Triangle
          x={isLeftWing ? 86 : 682}
          y={370}
          colour={triangleColour}
          fill={0}
          orientation={isLeftWing ? -90 : 90}
          scale={1}
        />
      )}
    </g>
  );
};

export default BleedWingAntiIce;
