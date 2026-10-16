import React from 'react';
import { useSimVar } from '@instruments/common/simVars';

import '../../../../index.scss';

const LITERS_PER_GALLON = 3.785411784;

/**
 * Low level limit, shown as the amber part at the bottom of the reservoir gauge (A380 FCOM DSC-29-20 RESERVOIR FLUID
 * LEVEL, a380_fcom.txt l.61434-61438). PRO-ABN HYD G (Y) RSVR LEVEL LO (l.155270): "There are less than 2.6 US Gal of
 * hydraulic fluid". Same threshold as the reservoir low level switch of the hydraulic system (a380_systems).
 */
const LOW_LEVEL_LIMIT_LITERS = 2.6 * LITERS_PER_GALLON;

type ReservoirProps = {
  x: number;
  y: number;
  side: 'GREEN' | 'YELLOW';
};
export const Reservoir = ({ x, y, side }: ReservoirProps) => {
  const height = 166;
  const width = 19;
  // Total reservoir capacity is 31.70 US gal, about 120L (A380 FCOM DSC-29-10, a380_fcom.txt l.60986).
  // Reservoir capacity is displayed up to 70L.
  const reservoirCapacityInLiters = 70;
  const litersToPixels = (liters: number) => (liters * height) / reservoirCapacityInLiters;

  // TODO should come from the HSMU and be computed from hyd temp, LEHGS filling etc.
  const normalFilling = 45;
  const fallbackNormalFilling = 40;
  const normalFillingFault = false;

  const isLeftSide = side === 'GREEN';

  const [levelGallon] = useSimVar(`L:A32NX_HYD_${side}_RESERVOIR_LEVEL`, 'gallon', 1000);
  const level = Math.min(levelGallon * LITERS_PER_GALLON, 70);
  const [lowLevel] = useSimVar(`L:A32NX_HYD_${side}_RESERVOIR_LEVEL_IS_LOW`, 'boolean', 1000);

  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={0.5}
        y={height - litersToPixels(level)}
        height={litersToPixels(level)}
        width={width - 1}
        className={`${lowLevel ? 'Amber' : 'Green'} Fill`}
      />

      <path d={`M 0, 0 v ${height} h ${width} v -${height}`} className="White NoFill SW2 LineRound" />
      <path d="m 9 -37 v 202" className={`${lowLevel ? 'Amber' : 'Green'} SW4`} />
      <path
        d={`m 9 ${isLeftSide ? -12 : -13} h ${isLeftSide ? 157 : -155} v -66`}
        className={`${lowLevel ? 'Amber' : 'Green'} NoFill SW4`}
      />

      <rect
        x={width + 1}
        y={height - litersToPixels(normalFilling) - 16}
        width={7}
        height={15}
        className="Background SW3"
      />
      <rect
        x={width + 1}
        y={height - litersToPixels(normalFilling) - 16}
        width={7}
        height={15}
        className={normalFillingFault ? 'White Fill' : 'Green Fill'}
      />
      <rect
        x={width + 1}
        y={height - litersToPixels(normalFilling) + 1}
        width={7}
        height={15}
        className="Background SW3"
      />
      <rect
        x={width + 1}
        y={height - litersToPixels(normalFilling) + 1}
        width={7}
        height={15}
        className={normalFillingFault ? 'White Fill' : 'Green Fill'}
      />
      {normalFillingFault && (
        <path
          className="Amber SW2"
          d={`M ${width - 0.5} ${height - litersToPixels(fallbackNormalFilling) - 4} l 8 8 m 0 -8 l -8 8`}
        />
      )}

      <rect
        x={width}
        y={height - litersToPixels(LOW_LEVEL_LIMIT_LITERS)}
        width={6}
        height={litersToPixels(LOW_LEVEL_LIMIT_LITERS)}
        className="Background SW3"
      />
      <rect
        x={width}
        y={height - litersToPixels(LOW_LEVEL_LIMIT_LITERS)}
        width={6}
        height={litersToPixels(LOW_LEVEL_LIMIT_LITERS)}
        className="Amber Fill"
      />

      <ReservoirFailIndications side={side} />
    </g>
  );
};

type ReservoirFailIndicationsProps = {
  side: 'GREEN' | 'YELLOW';
};
const ReservoirFailIndications = ({ side }: ReservoirFailIndicationsProps) => {
  const isLeftSide = side === 'GREEN';

  const [lowAirPress] = useSimVar(`L:A32NX_HYD_${side}_RESERVOIR_AIR_PRESSURE_IS_LOW`, 'boolean', 1000);
  // A380 FCOM DSC-29-20 RESERVOIR OVHT (a380_fcom.txt l.61440-61447): one indication, OVHT, "The temperature in the
  // reservoir is above normal", for both HYD G(Y) SYS OVHT (above 95 °C, l.155436) and HYD G(Y) SYS TEMP EXCESS HI (above
  // 130 °C, l.155789). The FCOM has no separate TEMP HI indication on the HYD page.
  const [ovht] = useSimVar(`L:A32NX_HYD_${side}_RESERVOIR_OVHT`, 'boolean', 1000);

  return (
    <g>
      <g className={lowAirPress ? '' : 'Hide'}>
        <text x={isLeftSide ? 70 : -50} y={72} className="Amber F24 MiddleAlign">
          AIR
        </text>
        <text x={isLeftSide ? 70 : -50} y={96} className="Amber F24 MiddleAlign">
          PRESS
        </text>
        <text x={isLeftSide ? 70 : -50} y={120} className="Amber F24 MiddleAlign">
          LOW
        </text>
      </g>
      <text x={isLeftSide ? 32 : -70} y={155} className={ovht ? 'Amber F24' : 'Hide'}>
        OVHT
      </text>
    </g>
  );
};
