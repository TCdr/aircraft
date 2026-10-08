// Native tests of FadecFailureInputs.h (no MSFS SDK). Run: bash fbw-common/src/wasm/fbw_common/test/run_tests.sh
#include <cstdio>
#include <cstdlib>

#include "../src/FadecFailureInputs.h"

static int failures = 0;

#define EXPECT(condition)                                       \
  do {                                                          \
    if (!(condition)) {                                         \
      std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      failures++;                                               \
    }                                                           \
  } while (0)

// A bus as the generated models define them: plain words with a sign status matrix and data
struct TestWord {
  unsigned int SSM;
  float Data;
};
struct TestBus {
  TestWord ats_discrete_word;
  TestWord selected_flex_temp_deg;
};

static void leverDrivesTheFadecWithoutOverride() {
  EXPECT(FadecFailureInputs::fadecModelThrustLeverAngle(25.0, 0.0, 0.0) == 25.0);
  // variables not written yet by systems.wasm read 0: no override
  EXPECT(FadecFailureInputs::fadecModelThrustLeverAngle(45.0, 0.0, 0.0) == 45.0);
}

static void overrideReplacesTheLever() {
  EXPECT(FadecFailureInputs::fadecModelThrustLeverAngle(-20.0, 1.0, -6.0) == -6.0);
  EXPECT(FadecFailureInputs::fadecModelThrustLeverAngle(10.0, 1.0, 25.0) == 25.0);
  EXPECT(FadecFailureInputs::fadecModelThrustLeverAngle(45.0, 1.0, 0.0) == 0.0);
}

static void autothrustOrdersReachAWorkingFadec() {
  TestBus bus{{3U, 1024.0F}, {3U, 50.0F}};
  TestBus received = FadecFailureInputs::autothrustOrdersReceived(bus, false);
  EXPECT(received.ats_discrete_word.SSM == 3U);
  EXPECT(received.ats_discrete_word.Data == 1024.0F);
  EXPECT(received.selected_flex_temp_deg.Data == 50.0F);
}

static void aLostFadecReceivesADeadBus() {
  TestBus bus{{3U, 1024.0F}, {3U, 50.0F}};
  TestBus received = FadecFailureInputs::autothrustOrdersReceived(bus, true);
  EXPECT(received.ats_discrete_word.SSM == 0U);
  EXPECT(received.ats_discrete_word.Data == 0.0F);
  EXPECT(received.selected_flex_temp_deg.SSM == 0U);
}

int main() {
  leverDrivesTheFadecWithoutOverride();
  overrideReplacesTheLever();
  autothrustOrdersReachAWorkingFadec();
  aLostFadecReceivesADeadBus();
  if (failures > 0) {
    std::printf("%d check(s) failed\n", failures);
    return EXIT_FAILURE;
  }
  std::printf("fadec_failure_inputs_test: all checks passed\n");
  return EXIT_SUCCESS;
}
