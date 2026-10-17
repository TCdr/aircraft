#pragma once

// Tracks a computer's power-supply outage duration and raises a sticky fault once the outage
// exceeds a threshold. The fault is cleared on the frame the power comes back (update() returns
// true); the outage time stays readable until the caller calls acknowledgeRecovery() after its own
// self-test startup sequence (order: fault cleared, startup sequence, outage time reset).
class PowerSupplyMonitor {
 public:
  PowerSupplyMonitor(double minimumOutageTimeForFailure);

  // Advances the outage timer and fault flag for this frame.
  // Returns true exactly on the frame the power supply is restored after a fault, with the fault
  // already cleared and getOutageTime() still giving the length of the outage.
  bool update(double deltaTime, bool isPowered);

  // Resets the outage timer. Call once a recovery (update() returning true) has been handled.
  void acknowledgeRecovery();

  bool hasFault();

  double getOutageTime();

 private:
  double outageTime = 0;
  bool fault = false;

  const double minimumOutageTimeForFailure;
};
