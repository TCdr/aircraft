import React, { FC } from 'react';
import { useSimVar } from '@instruments/common/simVars';
import { Triangle } from '@instruments/common/Shapes';
import { isStaticInverterFailed } from '../../ElecAc/ElecFailureStates';

export enum DcElecBus {
  Dc1Bus = 1,
  Dc2Bus = 2,
  DcEssBus = 3,
  DcApu = 4,
}

interface BusBarProps {
  x: number;
  y: number;
  bus: DcElecBus;
}

export const BusBar: FC<BusBarProps> = ({ x, y, bus }) => {
  const isBus1Or2 = bus <= 2;

  let busName: string;
  if (isBus1Or2) {
    busName = bus.toString();
  } else if (bus === DcElecBus.DcEssBus) {
    busName = 'ESS';
  } else {
    busName = 'APU';
  }

  const [dcBusPowered] = useSimVar(
    `L:A32NX_ELEC_${busName === 'APU' ? '' : 'DC_'}${busName === 'APU' ? '309PP' : busName}_BUS_IS_POWERED`,
    'bool',
    500,
  );
  const [staticInverterContactorClosed] = useSimVar('L:A32NX_ELEC_CONTACTOR_7XB_IS_CLOSED', 'bool', 500);
  const [staticInverterPotentialNormal] = useSimVar('L:A32NX_ELEC_STAT_INV_POTENTIAL_NORMAL', 'bool', 500);
  const staticInverterFault = isStaticInverterFailed(!!staticInverterContactorClosed, !!staticInverterPotentialNormal);

  return (
    <g id={`electrical-busbar-${bus}`} transform={`translate(${x} ${y})`}>
      <path className="LightGrey GreyFill SW1 LS1" d="M 0,0 l 0,34 l 128,0 l 0,-34 z" />
      <text className={`F29 ${dcBusPowered ? 'Green' : 'Amber'}`} x={isBus1Or2 ? 32 : 9} y={29}>
        DC
      </text>
      <text
        className={`${isBus1Or2 ? 'F35' : 'F29'} ${dcBusPowered ? 'Green' : 'Amber'} LS1`}
        x={isBus1Or2 ? 78 : 65}
        y={isBus1Or2 ? 31 : 29}
      >
        {busName}
      </text>
      {/* inverter */}
      {bus === DcElecBus.DcEssBus && (
        <g id="static-inverter">
          <Triangle
            x={98}
            y={53}
            colour={!staticInverterFault ? 'White' : 'Amber'}
            fill={0}
            orientation={180}
            scale={1}
          />
          <text className={`F22 ${!staticInverterFault ? 'White' : 'Amber'} LS1 WS-8`} x={70} y={77}>
            STAT INV
          </text>
        </g>
      )}
    </g>
  );
};
