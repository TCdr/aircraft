import React from 'react';
import { Position } from '@instruments/common/types';
import { useSimVar } from '@instruments/common/simVars';
import { avionicsBaySmokeLegend } from './CondSmokeIndications';

const AvionicsVentilation: React.FC<Position> = ({ x, y }) => {
  // TODO: The avionics ventilation is not modelled: the overboard and extract valve states, the extraction fan, the
  // low flow amber VENT and the L / R circuit indications need it. The smoke indications below come from the smoke
  // detection.
  return (
    <g id="AvionicsVentilation">
      <text x={x} y={y} className="F23 Green">
        VENT
      </text>

      <VentilationController x={x + 31} y={y + 257} vcm="FWD" />
      <VentilationController x={x + 641} y={y + 257} vcm="AFT" />

      {/* Upper avionics bay: under its AVNCS label; main avionics bay: at the bottom of its box */}
      <AvionicsBaySmoke x={77} y={165} bay="UPPER" />
      <AvionicsBaySmoke x={77} y={398} bay="MAIN" />
    </g>
  );
};

interface AvionicsBaySmokeProps {
  x: number;
  y: number;
  bay: 'MAIN' | 'UPPER';
}

/**
 * Smoke in the L and/or R circuit of an avionics bay: red legend naming the circuit.
 * Design choice: the place, the source gives none.
 */
const AvionicsBaySmoke: React.FC<AvionicsBaySmokeProps> = ({ x, y, bay }) => {
  const [leftSmoke] = useSimVar(
    bay === 'MAIN' ? 'L:A32NX_SMOKE_L_MAIN_AVNCS_DETECTED' : 'L:A32NX_SMOKE_L_UPPER_AVNCS_DETECTED',
    'bool',
    500,
  );
  const [rightSmoke] = useSimVar(
    bay === 'MAIN' ? 'L:A32NX_SMOKE_R_MAIN_AVNCS_DETECTED' : 'L:A32NX_SMOKE_R_UPPER_AVNCS_DETECTED',
    'bool',
    500,
  );
  const legend = avionicsBaySmokeLegend(leftSmoke > 0, rightSmoke > 0);

  return (
    <text x={x} y={y} className={`Red F20 MiddleAlign ${legend === null ? 'Hide' : 'Show'}`}>
      {legend ?? ''}
    </text>
  );
};

interface VentilationControllerProps {
  x: number;
  y: number;
  vcm: string;
}

const VentilationController: React.FC<VentilationControllerProps> = ({ x, y, vcm }) => {
  const [vcmChannel1Failure] = useSimVar(`L:A32NX_VENT_${vcm}_VCM_CHANNEL_1_FAILURE`, 'bool', 1000);
  const [vcmChannel2Failure] = useSimVar(`L:A32NX_VENT_${vcm}_VCM_CHANNEL_2_FAILURE`, 'bool', 1000);

  const noFailure = !vcmChannel1Failure && !vcmChannel2Failure;

  return (
    <g id={`VentilationControl-${vcm}`} className={noFailure ? 'Hide' : 'Show'}>
      <text x={x} y={y - 25} className="White F23 MiddleAlign">
        {vcm}
      </text>
      <text x={x} y={y} className="White F23 MiddleAlign">
        VENT CTL
      </text>
      <text x={x - 20} y={y + 25} className={`${vcmChannel1Failure ? 'Amber' : 'Green'} F23 MiddleAlign`}>
        1
      </text>
      <text x={x + 20} y={y + 25} className={`${vcmChannel2Failure ? 'Amber' : 'Green'} F23 MiddleAlign`}>
        2
      </text>

      <path className={'White Line'} d={`M${x - 10},${y + 15} l 0,22 l -25,0`} fill={'none'} />
      <path className={'White Line'} d={`M${x + 30},${y + 15} l 0,22 l -25,0`} fill={'none'} />
    </g>
  );
};

export default AvionicsVentilation;
