import { useSimVar } from '@instruments/common/simVars';
import { SdacActive, OnGround, Position } from '@instruments/common/types';
import React from 'react';
import { oxygenIndication } from './OxygenIndication';

const Oxygen: React.FC<Position & SdacActive & OnGround> = ({ x, y, active, onGround }) => {
  const minCrewOxygenPressureForFlight = 1000; // TODO Find out what this is for a crew of 5
  const crewOxygenPressure = 1829;
  const ckptPressureAmber = !!(
    crewOxygenPressure < 350 ||
    !active ||
    (onGround && crewOxygenPressure < minCrewOxygenPressureForFlight)
  );
  // CREW SUPPLY pb-sw: 1 when OFF (the SECURING THE AIRCRAFT checklist checks OXYGEN OFF with it)
  const [crewSupplyOffVar] = useSimVar('L:PUSH_OVHD_OXYGEN_CREW', 'boolean', 500);
  const indication = oxygenIndication(active, onGround, crewSupplyOffVar > 0);

  const cabinOxygenPressure = 1854;
  const cabinPressureAmber = !!(cabinOxygenPressure < 350 || !active);

  return (
    <g transform={`translate(${x} ${y})`}>
      <g id="crewOxygen">
        <text x={0} y={0} className={`F22 EndAlign LS1 ${indication.ckptAmber ? 'AmberFill' : 'White'}`}>
          CKPT
        </text>
        <text x={86} y={0} className={`F25 EndAlign ${ckptPressureAmber ? 'Amber' : 'Green'} LS1`}>
          {!active ? 'XX' : crewOxygenPressure}
        </text>
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
