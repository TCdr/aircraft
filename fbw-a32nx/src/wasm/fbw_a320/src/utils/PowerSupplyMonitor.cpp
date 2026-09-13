#include "PowerSupplyMonitor.h"

PowerSupplyMonitor::PowerSupplyMonitor(double minimumOutageTimeForFailure) : minimumOutageTimeForFailure(minimumOutageTimeForFailure) {}

bool PowerSupplyMonitor::update(double deltaTime, bool isPowered) {
  if (!isPowered) {
    outageTime += deltaTime;
  }
  if (outageTime > minimumOutageTimeForFailure) {
    fault = true;
  }
  return isPowered && fault;
}

void PowerSupplyMonitor::acknowledgeRecovery() {
  fault = false;
  outageTime = 0;
}

bool PowerSupplyMonitor::hasFault() {
  return fault;
}

double PowerSupplyMonitor::getOutageTime() {
  return outageTime;
}
