#include "PowerSupplyMonitor.h"

PowerSupplyMonitor::PowerSupplyMonitor(double minimumOutageTimeForFailure) : minimumOutageTimeForFailure(minimumOutageTimeForFailure) {}

bool PowerSupplyMonitor::update(double deltaTime, bool isPowered) {
  if (!isPowered) {
    outageTime += deltaTime;
  }
  if (outageTime > minimumOutageTimeForFailure) {
    fault = true;
  }
  if (isPowered && fault) {
    // Power is back: the fault is cleared at once, so that the caller's startup sequence (which runs
    // only without a power supply fault) is not skipped. The outage time is kept for that sequence
    // (the ELAC chooses its long self-test after an outage longer than 3 s) until acknowledgeRecovery().
    fault = false;
    return true;
  }
  return false;
}

void PowerSupplyMonitor::acknowledgeRecovery() {
  outageTime = 0;
}

bool PowerSupplyMonitor::hasFault() {
  return fault;
}

double PowerSupplyMonitor::getOutageTime() {
  return outageTime;
}
