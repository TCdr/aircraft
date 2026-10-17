import { useSimVar } from '@instruments/common/simVars';
import React, { FC } from 'react';
import { Triangle } from '@instruments/common/Shapes';
import { AcElecBus } from './BusBar';
import { isEngineGeneratorIndicationAmber } from '../ElecFailureStates';
import { engineGeneratorOffText, isEngineGeneratorOverheat, isGeneratorVoltageNormal } from '../GeneratorIndications';
import { useGeneratorLoadAmber } from './useGeneratorLoadAmber';

interface EngineGeneratorProps {
  x: number;
  y: number;
  bus: AcElecBus;
}

export const EngineGenerator: FC<EngineGeneratorProps> = ({ x, y, bus }) => {
  const [potential] = useSimVar(`L:A32NX_ELEC_ENG_GEN_${bus}_POTENTIAL`, 'volts', 500);
  const [load] = useSimVar(`L:A32NX_ELEC_ENG_GEN_${bus}_LOAD`, 'number', 500);

  const engGenLoadNormal = !useGeneratorLoadAmber(load);
  const engGenVoltageNormal = isGeneratorVoltageNormal(potential);

  const [lineContactorClosed] = useSimVar(`L:A32NX_ELEC_CONTACTOR_990XU${bus}_IS_CLOSED`, 'number', 500);
  const [genPushbuttonAuto] = useSimVar(`GENERAL ENG MASTER ALTERNATOR:${bus}`, 'number', 500);
  const [engineState] = useSimVar(`L:A32NX_ENGINE_STATE:${bus}`, 'Enum', 1000);
  const [driveConnected] = useSimVar(`L:A32NX_ELEC_ENG_GEN_${bus}_IDG_IS_CONNECTED`, 'bool', 500);
  const [potentialNormal] = useSimVar(`L:A32NX_ELEC_ENG_GEN_${bus}_POTENTIAL_NORMAL`, 'bool', 500);
  const [frequencyNormal] = useSimVar(`L:A32NX_ELEC_ENG_GEN_${bus}_FREQUENCY_NORMAL`, 'bool', 500);
  const genIndicationAmber = isEngineGeneratorIndicationAmber(
    !!genPushbuttonAuto,
    engineState === 1,
    !!driveConnected,
    !!potentialNormal,
    !!frequencyNormal,
  );
  // OFF or DISC replaces the load and the voltage
  const offText = engineGeneratorOffText(!!genPushbuttonAuto, !!driveConnected);
  // OVHT above 185 C, from the oil that cools the generator
  const [driveOilOutletTemperature] = useSimVar(
    `L:A32NX_ELEC_ENG_GEN_${bus}_IDG_OIL_OUTLET_TEMPERATURE`,
    'celsius',
    1000,
  );
  const overheat = isEngineGeneratorOverheat(driveOilOutletTemperature);

  return (
    <g id={`engine-generator-${bus}-indication`} transform={`translate(${x} ${y})`}>
      <image xlinkHref="/Images/fbw-a380x/SD_ELEC_AC_ENG.png" x={-18} y={-19} width={111} height={185} />

      <path className="BackgroundFill" d="M 0,0 l 0,84 l 76,0 l 0,-84 z" />

      <text x={5} y={23} className={`F26 ${genIndicationAmber ? 'Amber' : 'White'}`}>
        GEN
      </text>
      <text x={59} y={23} className={`F28 ${genIndicationAmber ? 'Amber' : 'White'}`}>
        {bus}
      </text>

      {bus % 2 === 1 && (
        <g>
          <text className="Cyan F22" x={94} y={52}>
            %
          </text>
          <text className="Cyan F22" x={94} y={81}>
            V
          </text>
        </g>
      )}

      {/* Load */}
      <text
        x={67}
        y={52}
        className={`F29 EndAlign ${engGenLoadNormal ? 'Green' : 'Amber'} LS1 ${offText === null ? '' : 'Hide'}`}
      >
        {Math.round(load)}
      </text>
      {/* Voltage */}
      <text
        x={67}
        y={80}
        className={`F29 EndAlign ${engGenVoltageNormal ? 'Green' : 'Amber'} LS1 ${offText === null ? '' : 'Hide'}`}
      >
        {Math.round(potential)}
      </text>
      <text
        x={67}
        y={62}
        className={`F29 EndAlign ${offText === 'DISC' ? 'Amber' : 'White'} LS1 ${offText === null ? 'Hide' : ''}`}
      >
        {offText ?? ''}
      </text>
      {/* Design choice: OVHT under the GEN box, the source gives no position */}
      <text x={38} y={110} className={`F26 Amber MiddleAlign LS1 ${overheat ? '' : 'Hide'}`}>
        OVHT
      </text>

      {/* GEN line contactor indication */}
      <Triangle
        x={38}
        y={-14}
        colour={`Green ${lineContactorClosed ? '' : 'Hide'}`}
        fill={0}
        orientation={0}
        scale={1}
      />
      <path className={`SW2 Green ${lineContactorClosed ? '' : 'Hide'}`} d="M 38,-14 l 0,-151" />
    </g>
  );
};
