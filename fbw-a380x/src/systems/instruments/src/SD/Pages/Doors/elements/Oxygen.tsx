import { useSimVar } from '@instruments/common/simVars';
import { SdacActive, OnGround, Position } from '@instruments/common/types';
import React from 'react';
import { oxygenIndication, oxygenPressureIndication } from './OxygenIndication';

/** The amber half-frame (lower half of a box) around a pressure value whose baseline is at y */
const HalfFrame: React.FC<{ y: number; visible: boolean }> = ({ y, visible }) => (
  <path className={`Amber SW2 NoFill ${visible ? '' : 'Hide'}`} d={`M24,${y - 11} l 0,17 l 66,0 l 0,-17`} />
);

const Oxygen: React.FC<Position & SdacActive & OnGround & { oneEngineRunning: boolean }> = ({
  x,
  y,
  active,
  onGround,
  oneEngineRunning,
}) => {
  // The bottle pressures of the oxygen model (a380_systems oxygen.rs)
  const [crewBottlePressure] = useSimVar('L:A32NX_OXYGEN_CREW_BOTTLE_PRESSURE', 'number', 1000);
  const crewOxygenPressure = Math.round(crewBottlePressure);
  // CREW SUPPLY pb-sw: 1 when OFF (the SECURING THE AIRCRAFT checklist checks OXYGEN OFF with it)
  const [crewSupplyOffVar] = useSimVar('L:PUSH_OVHD_OXYGEN_CREW', 'boolean', 500);
  const indication = oxygenIndication(active, onGround, crewSupplyOffVar > 0);

  const [cabinBottlePressure] = useSimVar('L:A32NX_OXYGEN_CABIN_BOTTLE_PRESSURE', 'number', 1000);
  const cabinOxygenPressure = Math.round(cabinBottlePressure);
  const [fmsPassengers] = useSimVar('L:A32NX_FMS_PAX_NUMBER', 'number', 1000);

  const pressures = oxygenPressureIndication({
    active,
    onGround,
    oneEngineRunning,
    fmsPassengers,
    ckptBottlePressurePsi: crewOxygenPressure,
    cabinBottlePressurePsi: cabinOxygenPressure,
  });
  const ckptPressureAmber = pressures.ckptValueAmber;
  const cabinPressureAmber = pressures.cabinValueAmber;

  return (
    <g transform={`translate(${x} ${y})`}>
      <g id="crewOxygen">
        <text x={0} y={0} className={`F22 EndAlign LS1 ${indication.ckptAmber ? 'AmberFill' : 'White'}`}>
          CKPT
        </text>
        <text x={86} y={0} className={`F25 EndAlign ${ckptPressureAmber ? 'Amber' : 'Green'} LS1`}>
          {!active ? 'XX' : crewOxygenPressure}
        </text>
        <HalfFrame y={0} visible={pressures.ckptHalfFrame} />
        <text x={91} y={0} className="F22 Cyan LS1">
          PSI
        </text>
        <text x={-30} y={26} className={`F22 Amber ${indication.ckptRegulPrLo ? '' : 'Hide'}`}>
          REGUL PR LO
        </text>
      </g>
      <path className="White SW2 StrokeRound" d="M-26,57 l 122,0" />
      <g id="cabinOxygen">
        <text x={15} y={124} className={`F22 EndAlign ${indication.cabinAmber ? 'Amber' : 'White'} LS1`}>
          CABIN
        </text>
        <text x={86} y={124} className={`F26 EndAlign ${cabinPressureAmber ? 'Amber' : 'Green'}`}>
          {!active ? 'XX' : cabinOxygenPressure}
        </text>
        <HalfFrame y={124} visible={pressures.cabinHalfFrame} />
        <text x={91} y={124} className="F22 Cyan LS1">
          PSI
        </text>
        <text x={-30} y={150} className={`F22 Amber ${indication.cabinRegulPrLo ? '' : 'Hide'}`}>
          REGUL PR LO
        </text>
      </g>
    </g>
  );
};

export default Oxygen;
