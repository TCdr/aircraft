// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { galleyCommercialIndication } from '../GeneratorIndications';

interface GalleyCommercialIndicationProps {
  x: number;
  y: number;
}

const LINE_HEIGHT = 26;

/**
 * COMMERCIAL OFF, GALLEY SHED, COMMERCIAL PARTIALLY SHED or GALLEY PARTIALLY SHED on the ELEC AC page.
 * Design choice: white as the A320 GALLEY SHED (the A380 source gives no colour), top left above the AC 1 feed line
 * (the source gives no place).
 */
export const GalleyCommercialIndication: FC<GalleyCommercialIndicationProps> = ({ x, y }) => {
  const [commercial1On] = useSimVar('L:A32NX_OVHD_ELEC_COMMERCIAL_PB_IS_ON', 'bool', 500);
  const [commercial2Off] = useSimVar('L:A380X_OVHD_ELEC_COMMERCIAL_2_PB_IS_OFF', 'bool', 500);
  const [galleyShed] = useSimVar('L:A32NX_ELEC_GALLEY_IS_SHED', 'bool', 500);
  const [galleyPartiallyShed] = useSimVar('L:A32NX_ELEC_GALLEY_IS_PARTIALLY_SHED', 'bool', 500);

  const lines = galleyCommercialIndication({
    commercial1Off: !(commercial1On > 0),
    commercial2Off: commercial2Off > 0,
    galleyShed: galleyShed > 0,
    galleyPartiallyShed: galleyPartiallyShed > 0,
  });

  return (
    <g id="galley-commercial-indication">
      {lines.map((line, index) => (
        <text key={line} x={x} y={y + index * LINE_HEIGHT} className="F24 White LS1">
          {line}
        </text>
      ))}
    </g>
  );
};
