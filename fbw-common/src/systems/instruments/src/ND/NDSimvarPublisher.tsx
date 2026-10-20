import { GenericAdirsEvents } from '@flybywiresim/fbw-sdk';
import { GenericSwitchingPanelEvents } from './types/GenericSwitchingPanelEvents';

export type NDSimvars = GenericAdirsEvents &
  GenericSwitchingPanelEvents & {
    elec: boolean;
    elecFo: boolean;
    potentiometerCaptain: number;
    potentiometerFo: number;
    ilsCourse: number;
    selectedHeading: Degrees;
    showSelectedHeading: boolean;
    absoluteTime: Seconds;
    /** The energy circle radius from the FMS, NM, 0 without an energy circle */
    energyCircleDistance: number;
  };
