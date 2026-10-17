import { useSimVar } from '@instruments/common/simVars';
import React, { FC } from 'react';
import { Triangle } from '@instruments/common/Shapes';
import { isApuGeneratorFrequencyNormal, isGeneratorVoltageNormal } from '../GeneratorIndications';
import { useGeneratorLoadAmber } from './useGeneratorLoadAmber';

interface ApuGeneratorProps {
  x: number;
  y: number;
  position: 1 | 2;
}

export const ApuGenerator: FC<ApuGeneratorProps> = ({ x, y, position }) => {
  const [load] = useSimVar(`L:A32NX_ELEC_APU_GEN_${position}_LOAD`, 'number', 500);
  const [potential] = useSimVar(`L:A32NX_ELEC_APU_GEN_${position}_POTENTIAL`, 'volts', 500);
  const [frequency] = useSimVar(`L:A32NX_ELEC_APU_GEN_${position}_FREQUENCY`, 'hertz', 500);

  // APU GEN: load amber after 10 s above 108 %, normal voltage 110-120 V, normal frequency 390-410 Hz
  const apuGenLoadNormal = !useGeneratorLoadAmber(load);
  const apuGenFreqNormal = isApuGeneratorFrequencyNormal(frequency);
  const apuGenVoltageNormal = isGeneratorVoltageNormal(potential);

  const [lineContactorClosed] = useSimVar(`L:A32NX_ELEC_CONTACTOR_990XS${position}_IS_CLOSED`, 'number', 500);
  const [genPushbuttonAuto] = useSimVar(`APU GENERATOR SWITCH:${position}`, 'number', 500);
  const [masterSwPbOn] = useSimVar('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 'Bool', 500);

  const pathString =
    position === 1
      ? 'M 5,0 l -5,0 l 0,100 l 83,0 l 0,-5 m 0,-77 l 0,-18 l -5,0'
      : 'M 5,0 l -5,0 l 0,18 m 0,77 l 0,5 l 83,0 l 0,-100 l -5,0';

  return (
    <g id={`apu-gen-${position}-indication`} transform={`translate(${x} ${y})`}>
      <text x={10} y={9} className={`F22 ${genPushbuttonAuto || !masterSwPbOn ? 'White' : 'Amber'}`}>
        GEN
      </text>
      <text x={60} y={9} className={`F22 ${genPushbuttonAuto || !masterSwPbOn ? 'White' : 'Amber'}`}>
        {position === 1 ? 'A' : 'B'}
      </text>

      <path className={`LightGrey SW3 NoFill StrokeRound ${masterSwPbOn ? '' : 'Hide'}`} d={pathString} />

      <g className={masterSwPbOn && genPushbuttonAuto ? '' : 'Hide'}>
        {/* Load */}
        <text x={71} y={38} className={`F29 EndAlign ${apuGenLoadNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(load)}
        </text>
        {/* Voltage */}
        <text x={71} y={64} className={`F29 EndAlign ${apuGenVoltageNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(potential)}
        </text>
        {/* Frequency */}
        <text x={71} y={91} className={`F29 EndAlign ${apuGenFreqNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(frequency)}
        </text>
      </g>
      <text x={72} y={62} className={`F29 EndAlign White LS1 ${genPushbuttonAuto || !masterSwPbOn ? 'Hide' : ''}`}>
        OFF
      </text>

      {/* GEN line contactor indication */}
      <Triangle x={42} y={-29} colour={lineContactorClosed ? 'Green' : 'White'} fill={0} orientation={0} scale={1} />
      <path className={`SW2 Green ${lineContactorClosed ? '' : 'Hide'}`} d="M 42,-29 l 0,-193" />
    </g>
  );
};
