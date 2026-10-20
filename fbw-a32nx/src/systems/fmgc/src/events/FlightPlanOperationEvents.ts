// Copyright (c) 2026 FlyByWire Simulations
import { FlightPlanIndex } from '../flightplanning/FlightPlanManager';
import { ConstantMachSegmentDeletionReason } from '../flightplanning/ConstantMachSegment';
export interface FlightPlanOperationEvents {
  /** Event triggered when immediate exit is selected on the MCDU/MFD */
  fms_set_hold_immediate_exit: { index: FlightPlanIndex; exit: boolean };

  /** Event triggered when the draft wind entries are automatically deleted from the active flightplan due to TMPY creation. */
  fms_draft_winds_inserted: null;

  /** Event triggered when the constant Mach segment of the active flight plan is deleted by the FMS */
  fms_constant_mach_segment_auto_deleted: ConstantMachSegmentDeletionReason;
}
