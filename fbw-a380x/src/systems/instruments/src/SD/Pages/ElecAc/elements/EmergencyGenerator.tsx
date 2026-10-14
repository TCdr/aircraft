import { useSimVar } from '@instruments/common/simVars';
import React, { FC } from 'react';
import { Triangle } from '@instruments/common/Shapes';
import { isRatIndicationAmber } from '../ElecFailureStates';
import { isGeneratorVoltageNormal } from '../GeneratorIndications';
import { useGeneratorLoadAmber } from './useGeneratorLoadAmber';

interface EmergencyGeneratorProps {
  x: number;
  y: number;
}

export const EmergencyGenerator: FC<EmergencyGeneratorProps> = ({ x, y }) => {
  const [potential] = useSimVar('L:A32NX_ELEC_EMER_GEN_POTENTIAL', 'volts', 500);
  const [load] = useSimVar('L:A32NX_ELEC_EMER_GEN_LOAD', 'number', 500);

  // A380 FCOM DSC-24-20 RAT LOAD: amber after 10 s above 108 % (l.51167); RAT VOLTAGE 110-120 V (l.51179)
  const emerGenLoadNormal = !useGeneratorLoadAmber(load);
  const emerGenVoltageNormal = isGeneratorVoltageNormal(potential);

  const [emerGenCtorClosed] = useSimVar('L:A32NX_ELEC_CONTACTOR_5XE_IS_CLOSED', 'number', 500);
  const [ratPosition] = useSimVar('L:A32NX_RAT_STOW_POSITION', 'number', 500);
  const ratOut = ratPosition > 0.9;

  const showRatIndication = emerGenCtorClosed || ratOut;
  const [ratFault] = useSimVar('L:A32NX_ELEC_RAT_FAULT', 'bool', 500);
  const ratAmber = isRatIndicationAmber(!!ratFault);

  return (
    <g id="emer-gen-indication" transform={`translate(${x} ${y})`}>
      <text
        x={showRatIndication ? -85 : -69}
        y={showRatIndication ? -18 : 10}
        className={`F25 ${ratAmber ? 'Amber' : 'White'} LS1`}
      >
        RAT
      </text>

      <g className={showRatIndication ? '' : 'Hide'}>
        <path className="LightGrey SW3 NoFill" d="M -102,-43 l 0,86 l 83,0 l 0,-86 z" />
        <path
          className={`${emerGenCtorClosed && !ratOut ? 'Amber' : 'LightGrey'} SW3 NoFill`}
          d="M -102,0 l -20,0 l -10,43 l 20,0 l -20,-86 l 20,0 l-10,43"
        />

        {/* Load */}
        <text x={-38} y={11} className={`F29 EndAlign ${emerGenLoadNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(load)}
        </text>
        {/* Voltage */}
        <text x={-38} y={39} className={`F29 EndAlign ${emerGenVoltageNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(potential)}
        </text>
        <text className="Cyan F22" x={-35} y={11}>
          %
        </text>
        <text className="Cyan F22" x={-35} y={39}>
          V
        </text>
      </g>

      {/* EMER GEN contactor indication */}
      <Triangle x={0} y={0} colour={emerGenCtorClosed ? 'Green' : 'White'} fill={0} orientation={90} scale={1} />
      <path className={`SW2 Green ${emerGenCtorClosed ? '' : 'Hide'}`} d="M 0,0 l 55,0 l 0,42" />
    </g>
  );
};
