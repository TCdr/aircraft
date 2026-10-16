import React, { FC } from 'react';
import { Wheel } from './Wheel';
import { HottestBrakeArc, tirePressureIndication } from '../WheelIndications';
import { NOSE_LEFT_TIRE, NOSE_RIGHT_TIRE } from '@shared/TirePressures';
import { BodyWheelSteering, NoseWheelSteering } from './Steering';

export enum WheelBogeyPosition {
  Nose,
  Left,
  Right,
}

export enum WheelBogeyType {
  Nose,
  WLG,
  BLG,
}

interface WheelBogeyProps {
  x: number;
  y: number;
  position: WheelBogeyPosition;
  type: WheelBogeyType;
  moreActive: boolean;
  /** The temperatures of brakes 1 to 16 in °C, brake 1 first */
  brakeTemperatures: readonly number[];
  /** The hottest brake arcs of brakes 1 to 16 (WheelIndications hottestBrakeArcs) */
  hottestBrakeArcs: readonly HottestBrakeArc[];
  /** The TPIS pressures of tires 1 to 22 in PSI (shared/TirePressures numbering) */
  tirePressures: readonly number[];
  /** The FWS flight phase (L:A32NX_FWC_FLIGHT_PHASE) */
  flightPhase: number;
}

export const WheelBogey: FC<WheelBogeyProps> = ({
  x,
  y,
  position,
  type,
  moreActive,
  brakeTemperatures,
  hottestBrakeArcs,
  tirePressures,
  flightPhase,
}) => {
  let numberOfWheels;
  if (type === WheelBogeyType.Nose) {
    numberOfWheels = 2;
  } else if (type === WheelBogeyType.WLG) {
    numberOfWheels = 4;
  } else {
    numberOfWheels = 6;
  }

  const wheels: JSX.Element[] = [];

  for (let i = 0; i < numberOfWheels; i++) {
    let wheelNumber: number;
    let xOffset = 0;
    if (type === WheelBogeyType.WLG) {
      wheelNumber = i + Math.floor(i / 2) * 2 + (position === WheelBogeyPosition.Left ? 1 : 3);
    } else if (type === WheelBogeyType.BLG) {
      wheelNumber = i + Math.floor(i / 2) * 2 + (position === WheelBogeyPosition.Left ? 9 : 11);
    } else {
      wheelNumber = i;
      xOffset = i === 0 ? 8 : -5;
    }

    const hasBrake = wheelNumber < 17 && type !== WheelBogeyType.Nose;
    // The nose wheel 1 is drawn on the left, the nose wheel 0 on the right
    let tire = wheelNumber;
    if (type === WheelBogeyType.Nose) {
      tire = i === 1 ? NOSE_LEFT_TIRE : NOSE_RIGHT_TIRE;
    }
    const tirePressure = tirePressureIndication(tirePressures, tire, flightPhase, moreActive);
    wheels.push(
      <Wheel
        x={xOffset}
        y={Math.floor(i / 2) * (type === WheelBogeyType.BLG ? 90 : 92)}
        number={type !== WheelBogeyType.Nose ? wheelNumber : null}
        hasBrake={hasBrake}
        isLeftSide={wheelNumber % 2 !== 0}
        brakeTemperature={hasBrake ? brakeTemperatures[wheelNumber - 1] ?? 0 : 0}
        hottestArc={hasBrake ? hottestBrakeArcs[wheelNumber - 1] ?? HottestBrakeArc.None : HottestBrakeArc.None}
        tirePressure={tirePressures[tire - 1] ?? 0}
        tirePressureVisible={tirePressure.visible}
        tirePressureAmber={tirePressure.amber}
      />,
    );
  }

  return (
    <g id={`bogey-${position}-${type}`} transform={`translate(${x} ${y})`}>
      {type !== WheelBogeyType.Nose && moreActive && (
        <text className="F22 Green LS1" x={-43} y={-54}>
          A-SKID
        </text>
      )}

      {type !== WheelBogeyType.Nose && (
        <path
          className="Grey NoFill SW4"
          d={
            type === WheelBogeyType.WLG
              ? 'm0,0 v 92 M -13,0 h 26 M -13,92 h 26'
              : 'm0,0 v 176 M -13,0 h 26 M -13,91 h 26'
          }
        />
      )}
      {type === WheelBogeyType.Nose && <NoseWheelSteering x={0} y={10} />}
      {type === WheelBogeyType.BLG && <BodyWheelSteering x={0} y={181} />}
      {wheels}
      {(type === WheelBogeyType.BLG || type === WheelBogeyType.WLG) && (
        <AccuFlag x={-6} y={type === WheelBogeyType.BLG ? 24 : -22} />
      )}
      {type === WheelBogeyType.WLG && <AccuFlag x={-6} y={70} />}
    </g>
  );
};

interface AccuFlagProps {
  x: number;
  y: number;
}

const AccuFlag: FC<AccuFlagProps> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <text className="F24 Green" x={0} y={0}>
      A
    </text>
    <text className="F24 Green" x={0} y={22}>
      C
    </text>
    <text className="F24 Green" x={0} y={44}>
      C
    </text>
    <text className="F24 Green" x={0} y={66}>
      U
    </text>
  </g>
);
