import React, { FC } from 'react';
import { brakeTemperatureColour, HottestBrakeArc, roundBrakeTemperature } from '../WheelIndications';

interface WheelProps {
  x: number;
  y: number;
  number: number | null;
  isLeftSide: boolean;
  hasBrake: boolean;
  /** The brake temperature in °C (L:A32NX_REPORTED_BRAKE_TEMPERATURE_n), for a wheel with a brake */
  brakeTemperature: number;
  /** The arc of the hottest brake (WheelIndications hottestBrakeArcs) */
  hottestArc: HottestBrakeArc;
  /** The TPIS tire pressure in PSI (L:A380X_TPIS_TIRE_n_PRESSURE) */
  tirePressure: number;
  /** The tire pressure is shown (MORE, or abnormal: WheelIndications tirePressureIndication) */
  tirePressureVisible: boolean;
  /** The tire pressure is abnormal (amber) */
  tirePressureAmber: boolean;
}

/** A380 FCOM DSC-32-20-70 (l.81361-81373): the upper arc of the wheel turns green or amber on the hottest brake */
function upperArcClassName(arc: HottestBrakeArc): string {
  switch (arc) {
    case HottestBrakeArc.Green:
      return 'Green NoFill SW3';
    case HottestBrakeArc.Amber:
      return 'Amber NoFill SW3';
    default:
      return 'Grey NoFill SW2';
  }
}

export const Wheel: FC<WheelProps> = ({
  x,
  y,
  number,
  isLeftSide,
  hasBrake,
  brakeTemperature,
  hottestArc,
  tirePressure,
  tirePressureVisible,
  tirePressureAmber,
}) => {
  const negativeSign = isLeftSide ? '-' : '';
  const rightNegativeSign = !isLeftSide ? '-' : '';

  return (
    <g id={`wheel-${number ?? 'nose'}`} transform={`translate(${x} ${y})`}>
      <path
        className={upperArcClassName(hasBrake ? hottestArc : HottestBrakeArc.None)}
        d={`m${negativeSign}51,-28 v-10 c${rightNegativeSign}10,-6 ${rightNegativeSign}30,-5, ${rightNegativeSign}35,0 v10`}
      />
      <path
        className="Grey NoFill SW2"
        d={`m${negativeSign}51,40 c${rightNegativeSign}10,4 ${rightNegativeSign}30,3, ${rightNegativeSign}35,-1 v-10`}
      />
      {hasBrake && (
        <>
          <path
            className="Grey NoFill SW2"
            d={`m ${negativeSign}15,18 v -36 M ${negativeSign}21,18 v -36 M ${negativeSign}27,18 v -36 M ${negativeSign}33,18 v -36`}
          />
          <path className="BackgroundFill" d={`m ${isLeftSide ? -18 : 70},-13 h -50 v -24 h 50 z`} />
          <text
            className={`F26 EndAlign ${brakeTemperatureColour(brakeTemperature)}`}
            x={isLeftSide ? -16 : 72}
            y={-16}
          >
            {roundBrakeTemperature(brakeTemperature)}
          </text>
        </>
      )}
      <text
        className={`F22 ${tirePressureAmber ? 'Amber' : 'Green'} EndAlign`}
        x={isLeftSide ? -16 : 65}
        y={34}
        visibility={tirePressureVisible ? 'visible' : 'hidden'}
      >
        {tirePressure}
      </text>
      {number && (
        <text className={`F22 White ${isLeftSide ? 'EndAlign' : ''}`} x={isLeftSide ? -38 : 42} y={7}>
          {number}
        </text>
      )}
    </g>
  );
};
