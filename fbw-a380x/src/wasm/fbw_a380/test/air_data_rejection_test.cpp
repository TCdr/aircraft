// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native test of the ADRs the flight control computers receive after the PRIM air data monitoring (src/AirDataRejection.h):
// run test/run_tests.sh. The PRIM is the generated A380PrimComputerGeneralLogic model, used as it is, fed with three valid
// ADRs as FlyByWireInterface::updatePrim feeds it; its outputs double_adr_failure / triple_adr_failure select the
// alternate and the direct law in the PRIM laws model.
//
// Build with -DWITHOUT_THE_FIX to run the same checks with the ADR data as before (no rejection): the checks of the rejected
// ADRs must fail.

#include <cstdio>

#include "A380PrimComputerGeneralLogic.h"
#include "AirDataRejection.h"

static int failures = 0;

static void expect(bool condition, const char* what) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static constexpr uint32_T SSM_NORMAL_OPERATION = 3U;

static base_arinc_429 normal(float value) {
  return {SSM_NORMAL_OPERATION, value};
}

/// A valid ADR in cruise: FL 350, 280 kt, M .82, AOA 2.5 deg
static base_adr_bus validAdr() {
  base_adr_bus bus = {};
  bus.altitude_standard_ft = normal(35000.0F);
  bus.altitude_corrected_1_ft = normal(35000.0F);
  bus.altitude_corrected_2_ft = normal(35000.0F);
  bus.mach = normal(0.82F);
  bus.airspeed_computed_kn = normal(280.0F);
  bus.airspeed_true_kn = normal(480.0F);
  bus.vertical_speed_ft_min = normal(0.0F);
  bus.aoa_corrected_deg = normal(2.5F);
  bus.corrected_average_static_pressure = normal(238.4F);
  return bus;
}

static base_adr_bus sentToFlightControls(const base_adr_bus& bus, int index, const AirDataRejection::Rejections& rejections) {
#ifdef WITHOUT_THE_FIX
  (void)index;
  (void)rejections;
  return bus;
#else
  return AirDataRejection::forFlightControls(bus, index, rejections);
#endif
}

struct LawInputs {
  bool doubleAdrFailure;
  bool tripleAdrFailure;
};

/// One PRIM step with the three valid ADRs after the given rejections
static LawInputs primWith(const AirDataRejection::Rejections& rejections) {
  static A380PrimComputerGeneralLogic prim;
  prim.initialize();
  auto& in = prim.A380PrimComputerGeneralLogic_U.in;
  in = {};
  in.time.dt = 0.05;
  in.sim_data.computer_running = true;
  const base_adr_bus adr = validAdr();
  in.bus_inputs.adr_1_bus = sentToFlightControls(adr, 0, rejections);
  in.bus_inputs.adr_2_bus = sentToFlightControls(adr, 1, rejections);
  in.bus_inputs.adr_3_bus = sentToFlightControls(adr, 2, rejections);
  prim.step();
  const auto& logic = prim.A380PrimComputerGeneralLogic_Y.out.general_logic;
  return {logic.double_adr_failure != 0, logic.triple_adr_failure != 0};
}

int main() {
  {
    AirDataRejection::Rejections none;
    const LawInputs law = primWith(none);
    expect(!law.doubleAdrFailure && !law.tripleAdrFailure, "no rejection: normal law inputs");
  }
  {
    AirDataRejection::Rejections one;
    one.adrRejected[1] = true;
    const LawInputs law = primWith(one);
    expect(!law.doubleAdrFailure, "one rejected ADR: no reversion");
    // The rejected ADR goes with a failure warning status, the displays keep it
    const base_adr_bus sent = sentToFlightControls(validAdr(), 1, one);
    expect(sent.airspeed_computed_kn.SSM == AirDataRejection::FAILURE_WARNING, "rejected ADR 2: CAS sent as failed");
    expect(sentToFlightControls(validAdr(), 0, one).airspeed_computed_kn.SSM == SSM_NORMAL_OPERATION, "ADR 1 untouched");
  }
  {
    AirDataRejection::Rejections two;
    two.adrRejected[0] = true;
    two.adrRejected[2] = true;
    const LawInputs law = primWith(two);
    expect(law.doubleAdrFailure && !law.tripleAdrFailure, "two rejected ADRs: alternate law (double ADR failure)");
  }
  {
    AirDataRejection::Rejections all;
    all.allAirDataRejected = true;
    const LawInputs law = primWith(all);
    expect(law.tripleAdrFailure, "all air data rejected: direct law (triple ADR failure)");
  }
  {
    AirDataRejection::Rejections aoa;
    aoa.aoaRejected[0] = true;
    aoa.aoaRejected[1] = true;
    const LawInputs law = primWith(aoa);
    expect(law.doubleAdrFailure && !law.tripleAdrFailure, "two rejected AOAs: alternate law");
    const base_adr_bus sent = sentToFlightControls(validAdr(), 0, aoa);
    expect(sent.aoa_corrected_deg.SSM == AirDataRejection::FAILURE_WARNING, "rejected AOA 1: AOA sent as failed");
    expect(sent.airspeed_computed_kn.SSM == SSM_NORMAL_OPERATION, "rejected AOA 1: CAS still valid");
  }

  if (failures == 0) {
    std::printf("air_data_rejection_test: all checks passed\n");
    return 0;
  }
  std::printf("air_data_rejection_test: %d check(s) failed\n", failures);
  return 1;
}
