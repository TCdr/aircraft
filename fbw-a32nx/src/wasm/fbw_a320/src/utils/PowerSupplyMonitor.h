#pragma once

// Tracks a computer's power-supply outage duration and raises a sticky fault once the outage
// exceeds a threshold. The fault is cleared, and the outage timer reset, only once the caller
// calls acknowledgeRecovery() - typically after running its own self-test startup sequence.
class PowerSupplyMonitor {
 public:
  PowerSupplyMonitor(double minimumOutageTimeForFailure);

  // Advances the outage timer and fault flag for this frame.
  // Returns true exactly on the frame the power supply is restored after a fault.
  bool update(double deltaTime, bool isPowered);

  // Clears the fault and resets the outage timer. Call once a recovery (update() returning true)
  // has been handled.
  void acknowledgeRecovery();

  bool hasFault();

  double getOutageTime();

 private:
  double outageTime = 0;
  bool fault = false;

  const double minimumOutageTimeForFailure;
};
