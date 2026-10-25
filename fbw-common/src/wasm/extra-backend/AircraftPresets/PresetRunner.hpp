// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#ifndef FLYBYWIRE_AIRCRAFT_PRESET_RUNNER_HPP
#define FLYBYWIRE_AIRCRAFT_PRESET_RUNNER_HPP

#include <cstddef>
#include <string>
#include <vector>

#include "ProcedureStep.hpp"

namespace aircraft_presets {

/**
 * The calculator code access of the runner. The MSFS module implements it with execute_calculator_code, the native test with a fake
 * aircraft.
 */
class CodeEnvironment {
 public:
  virtual ~CodeEnvironment() = default;

  /// Runs calculator code that yields a number and returns whether it is non-zero.
  virtual bool evaluate(const std::string& code) = 0;

  /// Runs calculator code for its effect.
  virtual void execute(const std::string& code) = 0;
};

enum class RunnerState { IDLE, RUNNING, FINISHED, ABORTED };

/**
 * Walks through the steps of a preset. It owns no MSFS state, so every sequencing rule can be tested natively.
 *
 * Rules that keep the fast (expedited) load reliable:
 * - The mode is latched at start(). Flipping the flyPad switch halfway must not change which steps run: the steps that only exist in one
 *   mode would be skipped or doubled and leave the aircraft half configured.
 * - An action is followed by a wait until its own expected-state check holds (bounded by SETTLE_TIMEOUT_MS). The next step then never
 *   reads a state that the previous action has not reached yet; the action is never executed twice, because many of them are toggles.
 * - A condition step that never becomes true aborts the preset instead of hanging it forever.
 */
class PresetRunner {
 public:
  /// An action whose expected state does not show up within this time is logged and the preset goes on.
  static constexpr double SETTLE_TIMEOUT_MS = 2000.0;

  /// The longest wait for a condition step (an engine start in normal mode takes about a minute, ADIRS alignment is quick or skipped).
  static constexpr double CONDITION_TIMEOUT_MS = 180000.0;

  static constexpr std::size_t NO_STEP = static_cast<std::size_t>(-1);

  /// Receives warnings and the abort reason; empty by default.
  using MessageSink = void (*)(const std::string&);

  explicit PresetRunner(CodeEnvironment& environment, MessageSink sink = nullptr) : environment(environment), sink(sink) {}

  /**
   * Starts a preset. The steps must stay valid until the run ends.
   * @param expeditedDelayMs extra wait after every expedited step that is not marked EXPEDITED_DELAY
   */
  void start(const std::vector<ProcedureStep*>* presetSteps, const bool expedited, const double expeditedDelayMs) {
    steps                = presetSteps;
    expeditedRun         = expedited;
    expeditedStepDelayMs = expeditedDelayMs < 0.0 ? 0.0 : expeditedDelayMs;
    nextStep             = 0;
    elapsedMs            = 0.0;
    nextStepNotBeforeMs  = 0.0;
    waitingSinceMs       = 0.0;
    pendingSettle        = nullptr;
    conditionStep        = NO_STEP;
    abortReason.clear();
    state = RunnerState::RUNNING;
  }

  /// Stops a running preset without error; does nothing otherwise.
  void cancel() {
    if (state == RunnerState::RUNNING) {
      state = RunnerState::FINISHED;
    }
  }

  /// Returns to IDLE so that the end state of the previous run is not read twice.
  void reset() {
    steps         = nullptr;
    pendingSettle = nullptr;
    state         = RunnerState::IDLE;
  }

  /// Advances the run by one simulation frame. Does at most one step per call.
  void tick(const double deltaMs) {
    if (state != RunnerState::RUNNING) {
      return;
    }
    elapsedMs += deltaMs;

    if (pendingSettle != nullptr && !settleDone()) {
      return;
    }
    if (elapsedMs < nextStepNotBeforeMs) {
      return;
    }

    if (steps == nullptr || nextStep >= steps->size()) {
      state = RunnerState::FINISHED;
      return;
    }

    const ProcedureStep* step = (*steps)[nextStep];

    if (isSkippedInThisMode(*step)) {
      ++nextStep;
      return;
    }

    if (step->type & StepType::CONDITION) {
      runConditionStep(*step);
      return;
    }
    runActionStep(*step);
  }

  RunnerState getState() const { return state; }
  bool        isRunning() const { return state == RunnerState::RUNNING; }
  bool        isExpedited() const { return expeditedRun; }
  const std::string& getAbortReason() const { return abortReason; }

  /// 0..1 share of the steps that are done
  double getProgress() const { return steps == nullptr || steps->empty() ? 0.0 : static_cast<double>(nextStep) / steps->size(); }

  /// Description of the step the run is working on, for the flyPad
  const std::string& getCurrentDescription() const { return currentDescription; }

 private:
  CodeEnvironment&                 environment;
  MessageSink                      sink;
  const std::vector<ProcedureStep*>* steps = nullptr;

  RunnerState state                = RunnerState::IDLE;
  bool        expeditedRun         = false;
  double      expeditedStepDelayMs = 0.0;
  std::size_t nextStep             = 0;
  double      elapsedMs            = 0.0;
  double      nextStepNotBeforeMs  = 0.0;

  // start of the current wait (condition or settle), on the elapsed clock
  double waitingSinceMs = 0.0;

  // index of the condition step being polled, to restart the timeout for each one
  std::size_t conditionStep = NO_STEP;

  // the action step whose expected state has not shown up yet
  const ProcedureStep* pendingSettle = nullptr;

  std::string currentDescription;
  std::string abortReason;

  bool isSkippedInThisMode(const ProcedureStep& step) const {
    const bool runsInThisMode = expeditedRun ? (step.type & StepType::EXPEDITED_MODE) != 0 : (step.type & StepType::NORMAL_MODE) != 0;
    return !runsInThisMode;
  }

  void report(const std::string& message) const {
    if (sink != nullptr) {
      sink(message);
    }
  }

  double delayAfter(const ProcedureStep& step) const {
    if (expeditedRun && !(step.type & StepType::EXPEDITED_DELAY)) {
      return expeditedStepDelayMs;
    }
    return step.delayAfter;
  }

  void runConditionStep(const ProcedureStep& step) {
    currentDescription = step.description;
    if (conditionStep != nextStep) {
      conditionStep  = nextStep;
      waitingSinceMs = elapsedMs;
    }

    if (step.expectedStateCheckCode.empty() || environment.evaluate(step.expectedStateCheckCode)) {
      ++nextStep;
      return;
    }

    if (elapsedMs - waitingSinceMs >= CONDITION_TIMEOUT_MS) {
      abortReason = "Timeout waiting for: " + step.description;
      report(abortReason);
      state = RunnerState::ABORTED;
      return;
    }
    nextStepNotBeforeMs = elapsedMs + step.delayAfter;
  }

  void runActionStep(const ProcedureStep& step) {
    currentDescription = step.description;

    if (!step.expectedStateCheckCode.empty() && environment.evaluate(step.expectedStateCheckCode)) {
      // already in the wanted state: no action and no delay
      ++nextStep;
      return;
    }

    environment.execute(step.actionCode);
    ++nextStep;
    nextStepNotBeforeMs = elapsedMs + delayAfter(step);

    if (!step.expectedStateCheckCode.empty()) {
      pendingSettle  = &step;
      waitingSinceMs = elapsedMs;
    }
  }

  /// @return true when the previous action has reached its expected state or ran out of time
  bool settleDone() {
    if (environment.evaluate(pendingSettle->expectedStateCheckCode)) {
      pendingSettle = nullptr;
      return true;
    }
    if (elapsedMs - waitingSinceMs >= SETTLE_TIMEOUT_MS) {
      report("Expected state not reached after: " + pendingSettle->description);
      pendingSettle = nullptr;
      return true;
    }
    return false;
  }
};

}  // namespace aircraft_presets

#endif  // FLYBYWIRE_AIRCRAFT_PRESET_RUNNER_HPP
