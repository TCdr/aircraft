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

// A380 ENG FADEC FAULT: the frame where the lost link takes the A/THR control away gets an angle below the THRUST LOCK band
static void theLostLinkFrameMovesTheLeverOutOfTheLockBands() {
  using namespace FadecFailureInputs;
  // CL detent: just below the CL band, still in the CLB thrust range (above 0, below 24)
  const double clFrame = thrustLeverAngleWithoutThrustLock(25.0, true, true);
  EXPECT(clFrame < THRUST_LOCK_CL_BAND_LOW_DEG);
  EXPECT(clFrame > THRUST_LOCK_CL_BAND_LOW_DEG - 0.1);
  EXPECT(thrustLeverAngleWithoutThrustLock(24.0, true, true) < THRUST_LOCK_CL_BAND_LOW_DEG);
  EXPECT(thrustLeverAngleWithoutThrustLock(26.0, true, true) < THRUST_LOCK_CL_BAND_LOW_DEG);
  // MCT detent: just below the MCT band, still in the MCT/FLX thrust range (above 25)
  const double mctFrame = thrustLeverAngleWithoutThrustLock(35.0, true, true);
  EXPECT(mctFrame < THRUST_LOCK_MCT_BAND_LOW_DEG);
  EXPECT(mctFrame > THRUST_LOCK_MCT_BAND_LOW_DEG - 0.1);
}

static void theLeverIsKeptOtherwise() {
  using namespace FadecFailureInputs;
  // link working: the THRUST LOCK of an A/THR disconnection is kept
  EXPECT(thrustLeverAngleWithoutThrustLock(25.0, false, true) == 25.0);
  // link lost, but the A/THR did not control the engine on the previous frame (A/THR off, or the frames after the cut)
  EXPECT(thrustLeverAngleWithoutThrustLock(25.0, true, false) == 25.0);
  EXPECT(thrustLeverAngleWithoutThrustLock(35.0, true, false) == 35.0);
  // lever outside the bands: nothing to avoid
  EXPECT(thrustLeverAngleWithoutThrustLock(20.0, true, true) == 20.0);
  EXPECT(thrustLeverAngleWithoutThrustLock(30.0, true, true) == 30.0);
  EXPECT(thrustLeverAngleWithoutThrustLock(45.0, true, true) == 45.0);
  EXPECT(thrustLeverAngleWithoutThrustLock(-6.0, true, true) == -6.0);
}

int main() {
  leverDrivesTheFadecWithoutOverride();
  overrideReplacesTheLever();
  autothrustOrdersReachAWorkingFadec();
  aLostFadecReceivesADeadBus();
  theLostLinkFrameMovesTheLeverOutOfTheLockBands();
  theLeverIsKeptOtherwise();
  if (failures > 0) {
    std::printf("%d check(s) failed\n", failures);
    return EXIT_FAILURE;
  }
  std::printf("fadec_failure_inputs_test: all checks passed\n");
  return EXIT_SUCCESS;
}
