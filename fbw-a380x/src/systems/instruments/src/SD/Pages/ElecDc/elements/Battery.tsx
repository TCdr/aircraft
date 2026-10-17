import { useSimVar } from '@instruments/common/simVars';
import React, { FC } from 'react';
import { DcElecBus } from './BusBar';
import { apuInStartSequence, batteryCurrentNormal, batteryVoltageNormal } from './BatteryIndications';

interface BatteryProps {
  x: number;
  y: number;
  bus: DcElecBus;
}

export const Battery: FC<BatteryProps> = ({ x, y, bus }) => {
  let title: string;
  let lvarName: string;
  if (bus <= 2) {
    title = `BAT ${bus}`;
    lvarName = `${bus}`;
  } else if (bus === DcElecBus.DcEssBus) {
    title = 'ESS BAT';
    lvarName = 'ESS';
  } else {
    title = 'APU BAT';
    lvarName = 'APU';
  }

  const [potential] = useSimVar(`L:A32NX_ELEC_BAT_${bus}_POTENTIAL`, 'volts', 500);
  const [current] = useSimVar(`L:A32NX_ELEC_BAT_${bus}_CURRENT`, 'volts', 500);
  const [batPbAuto] = useSimVar(`L:A32NX_OVHD_ELEC_BAT_${lvarName}_PB_IS_AUTO`, 'bool', 500);

  // The APU BAT is not abnormal while it discharges to start the APU
  const [apuStartPbOn] = useSimVar('L:A32NX_OVHD_APU_START_PB_IS_ON', 'bool', 500);
  const [apuAvailable] = useSimVar('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE', 'bool', 500);
  const isApuBattery = bus === DcElecBus.DcApu;
  const apuStarting = apuInStartSequence(!!apuStartPbOn, !!apuAvailable);
  const batCurrentNormal = batteryCurrentNormal(isApuBattery, current, apuStarting);
  const batVoltageNormal = batteryVoltageNormal(isApuBattery, potential, current, apuStarting);

  return (
    <g id={`bat-${bus}-indication-box`} transform={`translate(${x} ${y})`}>
      <path className="LightGrey SW3 NoFill" d="M 0,0 l 0,107 l 127,0 l 0,-107 z" />
      <text
        x={65}
        y={22}
        className={`F25 MiddleAlign ${batCurrentNormal && batVoltageNormal && batPbAuto ? 'White' : 'Amber'} LS1 WS-8`}
      >
        {title}
      </text>
      <g className={batPbAuto ? 'Show' : 'Hide'}>
        <g>
          <text className="Cyan F22" x={77} y={63}>
            V
          </text>
          <text className="Cyan F22" x={77} y={97}>
            A
          </text>
        </g>
        {/* Voltage */}
        <text x={73} y={62} className={`F28 EndAlign ${batVoltageNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(potential)}
        </text>
        {/* Current */}
        <text x={73} y={97} className={`F28 EndAlign ${batCurrentNormal ? 'Green' : 'Amber'} LS1`}>
          {Math.round(current)}
        </text>
      </g>
      <text className={`White F25 ${!batPbAuto ? 'Show' : 'Hide'}`} x={44} y={75}>
        OFF
      </text>
    </g>
  );
};
