// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the aircraft preset runner (AircraftPresets/PresetRunner.hpp): run test/run_tests.sh.

#include <cstdio>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include "../AircraftPresets/PresetRunner.hpp"

using aircraft_presets::CodeEnvironment;
using aircraft_presets::PresetRunner;
using aircraft_presets::RunnerState;

static int failures = 0;

static void expectTrue(const char* what, bool condition) {
  if (!condition) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static std::vector<std::string> messages;
static void                     collectMessage(const std::string& message) { messages.push_back(message); }

// A cut-down aircraft: calculator code "set X" sets the variable X after the latency of the sim, and "X" reads it
class FakeAircraft : public CodeEnvironment {
 public:
  double                           now     = 0.0;
  double                           latency = 0.0;  // time between an action and its effect in the sim
  std::map<std::string, bool>      variables;
  std::vector<std::string>         executed;
  std::vector<std::pair<double, std::string>> pendingEffects;

  bool evaluate(const std::string& code) override {
    const auto found = variables.find(code);
    return found != variables.end() && found->second;
  }

  void execute(const std::string& code) override {
    executed.push_back(code);
    if (code.rfind("set ", 0) == 0) {
      pendingEffects.emplace_back(now + latency, code.substr(4));
    }
  }

  void advance(double deltaMs) {
    now += deltaMs;
    for (auto effect = pendingEffects.begin(); effect != pendingEffects.end();) {
      if (effect->first <= now) {
        variables[effect->second] = true;
        effect                    = pendingEffects.erase(effect);
      } else {
        ++effect;
      }
    }
  }
};

static ProcedureStep action(const char* name, StepType type, double delay, const char* check, const char* code) {
  return ProcedureStep(name, type, delay, check, code);
}

struct Preset {
  std::vector<ProcedureStep>  storage;
  std::vector<ProcedureStep*> steps;
  explicit Preset(std::vector<ProcedureStep> definitions) : storage(std::move(definitions)) {
    for (auto& step : storage) {
      steps.push_back(&step);
    }
  }
};

// Runs the preset in frames of dtMs until it ends or maxMs have passed; returns the time it took
static double run(PresetRunner& runner, FakeAircraft& aircraft, double dtMs, double maxMs) {
  double elapsed = 0.0;
  while (runner.isRunning() && elapsed < maxMs) {
    aircraft.advance(dtMs);
    runner.tick(dtMs);
    elapsed += dtMs;
  }
  return elapsed;
}

static void testNormalModeRunsInOrderWithDelays() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 1000, "a", "set a"), action("B", StepType::PROC, 500, "b", "set b"),
                       action("C", StepType::EXON, 0, "c", "set c")});
  runner.start(&preset.steps, false, 0.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("normal: finished", runner.getState() == RunnerState::FINISHED);
  expectTrue("normal: A then B, C skipped", aircraft.executed == (std::vector<std::string>{"set a", "set b"}));
  expectTrue("normal: waited the delay of A and B", took >= 1500.0);
}

static void testExpeditedSkipsNormalOnlySteps() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 1000, "a", "set a"), action("B", StepType::PROC, 500, "b", "set b"),
                       action("C", StepType::EXON, 0, "c", "set c"), action("N", StepType::NCON, 100, "n", "")});
  runner.start(&preset.steps, true, 0.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("expedited: finished", runner.getState() == RunnerState::FINISHED);
  expectTrue("expedited: A and C, B and the NCON skipped", aircraft.executed == (std::vector<std::string>{"set a", "set c"}));
  expectTrue("expedited: the delays are not waited", took < 500.0);
}

static void testExpeditedKeepsDelayOfNoexSteps() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::NOEX, 1000, "a", "set a"), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, true, 0.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("noex: the delay is kept in expedited mode", took >= 1000.0);
}

static void testExpediteDelayBetweenSteps() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 1000, "a", "set a"), action("B", StepType::STEP, 1000, "b", "set b")});
  runner.start(&preset.steps, true, 300.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("expedite delay: applied between the steps", took >= 300.0 && took < 1000.0);
}

static void testStateAlreadySetSkipsAction() {
  FakeAircraft aircraft;
  aircraft.variables["a"] = true;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 5000, "a", "set a"), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, false, 0.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("already set: no action", aircraft.executed == (std::vector<std::string>{"set b"}));
  expectTrue("already set: no delay", took < 1000.0);
}

// The reported fast-load fault: step B reads a state that step A only reaches a few frames later
static void testNextStepWaitsForTheEffectOfTheActionBefore() {
  FakeAircraft aircraft;
  aircraft.latency = 300.0;
  PresetRunner runner(aircraft, collectMessage);
  // B needs A done: its check is true when "a" is set, and its action only makes sense then (a toggle in the real aircraft)
  Preset preset({action("A", StepType::STEP, 0, "a", "set a"), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, true, 0.0);

  double aWasSetWhenBRan = -1.0;
  double elapsed         = 0.0;
  while (runner.isRunning() && elapsed < 10000.0) {
    const size_t before = aircraft.executed.size();
    aircraft.advance(16.0);
    runner.tick(16.0);
    elapsed += 16.0;
    if (aircraft.executed.size() > before && aircraft.executed.back() == "set b") {
      aWasSetWhenBRan = aircraft.variables["a"] ? 1.0 : 0.0;
    }
  }
  expectTrue("settle: B ran after the effect of A", aWasSetWhenBRan == 1.0);
  expectTrue("settle: no action is executed twice", aircraft.executed == (std::vector<std::string>{"set a", "set b"}));
  expectTrue("settle: no warning when the effect shows up", messages.empty());
}

static void testSettleTimeoutContinuesWithAWarning() {
  messages.clear();
  FakeAircraft aircraft;
  aircraft.latency = 1e9;  // the effect never shows up
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 0, "a", "set a"), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, true, 0.0);
  const double took = run(runner, aircraft, 50.0, 60000.0);
  expectTrue("settle timeout: preset goes on", runner.getState() == RunnerState::FINISHED);
  expectTrue("settle timeout: A once, B once", aircraft.executed == (std::vector<std::string>{"set a", "set b"}));
  expectTrue("settle timeout: waited about the timeout", took >= PresetRunner::SETTLE_TIMEOUT_MS && took < 10000.0);
  expectTrue("settle timeout: a warning names the step", !messages.empty() && messages[0].find("A") != std::string::npos);
}

static void testConditionWaitsAndPolls() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("Wait", StepType::COND, 1000, "ready", ""), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, false, 0.0);
  // the condition becomes true after 2.5 s
  double elapsed = 0.0;
  while (runner.isRunning() && elapsed < 20000.0) {
    aircraft.advance(50.0);
    elapsed += 50.0;
    if (elapsed >= 2500.0) {
      aircraft.variables["ready"] = true;
    }
    runner.tick(50.0);
  }
  expectTrue("condition: finished", runner.getState() == RunnerState::FINISHED);
  expectTrue("condition: B ran after the condition", aircraft.executed == (std::vector<std::string>{"set b"}));
  expectTrue("condition: B did not run before the condition", elapsed >= 2500.0);
}

static void testConditionTimeoutAborts() {
  messages.clear();
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("Await ENG 2", StepType::COND, 2000, "never", ""), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, false, 0.0);
  run(runner, aircraft, 100.0, PresetRunner::CONDITION_TIMEOUT_MS + 10000.0);
  expectTrue("timeout: aborted", runner.getState() == RunnerState::ABORTED);
  expectTrue("timeout: the later steps did not run", aircraft.executed.empty());
  expectTrue("timeout: reason names the step", runner.getAbortReason().find("Await ENG 2") != std::string::npos);
}

static void testEachConditionHasItsOwnTimeout() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  // the first condition takes 100 s, the second one 100 s again: together over the timeout, each one under it
  Preset preset({action("One", StepType::COND, 1000, "one", ""), action("Two", StepType::COND, 1000, "two", "")});
  runner.start(&preset.steps, false, 0.0);
  double elapsed = 0.0;
  while (runner.isRunning() && elapsed < 400000.0) {
    aircraft.advance(100.0);
    elapsed += 100.0;
    if (elapsed >= 100000.0) {
      aircraft.variables["one"] = true;
    }
    if (elapsed >= 200000.0) {
      aircraft.variables["two"] = true;
    }
    runner.tick(100.0);
  }
  expectTrue("two conditions: finished without a timeout", runner.getState() == RunnerState::FINISHED);
}

static void testCancelAndReset() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({action("A", StepType::STEP, 10000, "a", "set a"), action("B", StepType::STEP, 0, "b", "set b")});
  runner.start(&preset.steps, false, 0.0);
  run(runner, aircraft, 50.0, 500.0);
  runner.cancel();
  expectTrue("cancel: ended", runner.getState() == RunnerState::FINISHED);
  run(runner, aircraft, 50.0, 20000.0);
  expectTrue("cancel: B never ran", aircraft.executed == (std::vector<std::string>{"set a"}));
  runner.reset();
  expectTrue("reset: idle again", runner.getState() == RunnerState::IDLE);
  runner.start(&preset.steps, false, 0.0);
  expectTrue("restart: running again", runner.isRunning());
}

static void testEmptyPresetFinishes() {
  FakeAircraft aircraft;
  PresetRunner runner(aircraft, collectMessage);
  Preset       preset({});
  runner.start(&preset.steps, false, 0.0);
  runner.tick(16.0);
  expectTrue("empty: finished at once", runner.getState() == RunnerState::FINISHED);
}

int main() {
  testNormalModeRunsInOrderWithDelays();
  testExpeditedSkipsNormalOnlySteps();
  testExpeditedKeepsDelayOfNoexSteps();
  testExpediteDelayBetweenSteps();
  testStateAlreadySetSkipsAction();
  testNextStepWaitsForTheEffectOfTheActionBefore();
  testSettleTimeoutContinuesWithAWarning();
  testConditionWaitsAndPolls();
  testConditionTimeoutAborts();
  testEachConditionHasItsOwnTimeout();
  testCancelAndReset();
  testEmptyPresetFinishes();

  if (failures == 0) {
    std::printf("preset_runner_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
