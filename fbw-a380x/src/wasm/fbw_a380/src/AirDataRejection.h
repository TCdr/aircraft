#pragma once

// The ADR data the flight control computers (PRIMs and SECs) receive after the air data monitoring by the PRIMs. Pure
// functions, no MSFS SDK: tested natively with the generated A380PrimComputerGeneralLogic model by
// test/air_data_rejection_test.cpp (test/run_tests.sh).
//
// A380 FCOM DSC-34-10-30-10 "ADR monitoring by PRIM" (a380_fcom.txt l.85698-85725): "If one of these parameters [CAS,
// Mach, altitude, static pressure] is rejected, the ADR (including all other air data parameters) or ISIS is rejected
// until the end of the flight for flight controls internal use." (l.85704-85705); "If one AOA parameter is rejected, the
// AOA and the side slip angle of the affected ADR are rejected" (l.85719). DSC-34-10-30-40 (l.86272-86273): "If two
// ADRs are rejected in sequence, there is a reversion to alternate law."; NAV ALL AIR DATA DISAGREE (l.164024): "The
// flight control law reverts to direct law".
//
// The comparison itself runs in systems.wasm (a380_systems air_data_monitoring.rs), which writes the L:vars
// A32NX_PRIM_ADR_n_REJECTED, A32NX_PRIM_ALL_AIR_DATA_REJECTED and A32NX_PRIM_AOA_n_REJECTED. Here a rejected ADR goes to
// the PRIM and SEC models with a failure warning status: the models already count such an ADR as failed, which gives the
// alternate law with two rejected ADRs and the direct law with three. The displays keep the ADR data as it is.
//
// Design choice: the models have no separate AOA status. A rejected AOA alone is sent with a failure warning status on its
// AOA word only; the models then count that ADR as failed (two rejected AOAs: alternate law, FCOM l.85722).

#include "A380PrimComputerGeneralLogic_types.h"

namespace AirDataRejection {

constexpr uint32_T FAILURE_WARNING = static_cast<uint32_T>(SignStatusMatrix::FailureWarning);

/// The rejections the PRIM air data monitoring has latched (the L:vars of systems.wasm)
struct Rejections {
  bool adrRejected[3] = {false, false, false};
  bool allAirDataRejected = false;
  bool aoaRejected[3] = {false, false, false};
};

/// The ADR bus of ADR n (index 0, 1, 2) as the flight control computers use it
inline base_adr_bus forFlightControls(const base_adr_bus& bus, int adrIndex, const Rejections& rejections) {
  base_adr_bus result = bus;
  const bool adrRejected = rejections.allAirDataRejected || rejections.adrRejected[adrIndex];
  if (adrRejected) {
    result.altitude_standard_ft.SSM = FAILURE_WARNING;
    result.altitude_corrected_1_ft.SSM = FAILURE_WARNING;
    result.altitude_corrected_2_ft.SSM = FAILURE_WARNING;
    result.mach.SSM = FAILURE_WARNING;
    result.airspeed_computed_kn.SSM = FAILURE_WARNING;
    result.airspeed_true_kn.SSM = FAILURE_WARNING;
    result.vertical_speed_ft_min.SSM = FAILURE_WARNING;
    result.aoa_corrected_deg.SSM = FAILURE_WARNING;
    result.corrected_average_static_pressure.SSM = FAILURE_WARNING;
  } else if (rejections.aoaRejected[adrIndex]) {
    result.aoa_corrected_deg.SSM = FAILURE_WARNING;
  }
  return result;
}

}  // namespace AirDataRejection
