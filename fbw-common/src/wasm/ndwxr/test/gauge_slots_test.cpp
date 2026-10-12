// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Native unit test of the gauge slot table and the MapView budget (src/gauge_slots.h) through flight reloads: run
// test/run_tests.sh. The fake engine below behaves as the sim was measured to (ndwxr.h): a MapView created while the
// module already has kMaxMapViews does not render.

#include <cstdio>
#include <utility>
#include <vector>

#include "../src/gauge_slots.h"

using ndwxr::GaugeRole;
using ndwxr::GaugeSlots;
using ndwxr::kMaxMapViews;

static int failures = 0;

static void expect(const char* what, bool actual) {
  if (!actual) {
    std::printf("FAIL %s\n", what);
    ++failures;
  }
}

static void expectEqual(const char* what, int actual, int expected) {
  if (actual != expected) {
    std::printf("FAIL %s: %d, expected %d\n", what, actual, expected);
    ++failures;
  }
}

// One gauge instance as the table sees it (the gauge code's Instance has the same fields).
struct FakeSlot {
  bool inUse = false;
  unsigned long long ctx = 0;
  bool isRight = false;
  bool isVdTerrain = false;
  bool superseded = false;
  bool abandoned = false;
  bool viewsCreated = false;
  int viewsReserved = 0;
  bool waitingForViews = false;
  int waitFrames = 0;
  std::vector<int> views;
};

using Table = GaugeSlots<FakeSlot, 8>;

// The sim's side: the MapViews that exist, in creation order. A view id is a number within its context, as in the sim
// (each gauge's first view is 2, measured 2026-10-10 with temporary L:vars).
struct FakeEngine {
  struct View {
    unsigned long long ctx;
    int id;
    bool renders;
  };
  static constexpr int kFirstId = 2;
  std::vector<View> existing;
  std::vector<std::pair<unsigned long long, int>> nextIds;  // per context
  bool recycleIds = false;  // hand out the lowest free id of the context (as a pool would) instead of a new one
  int viewsPerGauge = 2;    // the A380X: 2 per ND gauge and 2 per VD terrain gauge
  int mostViewsAtOnce = 0;

  int newId(unsigned long long ctx) {
    if (!recycleIds) {
      for (auto& next : nextIds) {
        if (next.first == ctx) {
          return next.second++;
        }
      }
      nextIds.push_back({ctx, kFirstId + 1});
      return kFirstId;
    }
    for (int id = kFirstId;; ++id) {
      bool taken = false;
      for (const View& view : existing) {
        taken = taken || (view.ctx == ctx && view.id == id);
      }
      if (!taken) {
        return id;
      }
    }
  }

  // fsMapViewCreate.
  int create(unsigned long long ctx) {
    const View view{ctx, newId(ctx), static_cast<int>(existing.size()) < kMaxMapViews};
    existing.push_back(view);
    if (static_cast<int>(existing.size()) > mostViewsAtOnce) {
      mostViewsAtOnce = static_cast<int>(existing.size());
    }
    return view.id;
  }

  // fsMapViewDelete (the id in that context).
  void erase(unsigned long long ctx, int id) {
    for (auto it = existing.begin(); it != existing.end(); ++it) {
      if (it->ctx == ctx && it->id == id) {
        existing.erase(it);
        return;
      }
    }
  }

  bool renders(unsigned long long ctx, int id) const {
    for (const View& view : existing) {
      if (view.ctx == ctx && view.id == id) {
        return view.renders;
      }
    }
    return false;
  }

  // The Engine interface of GaugeSlots.
  int viewsNeeded(const FakeSlot&) const { return viewsPerGauge; }
  void createViews(FakeSlot& slot) {
    for (int i = 0; i < viewsPerGauge; ++i) {
      slot.views.push_back(create(slot.ctx));
    }
  }
  bool holdsView(const FakeSlot& slot, int id) const {
    for (int view : slot.views) {
      if (view == id) {
        return true;
      }
    }
    return false;
  }
  void destroy(FakeSlot& slot, const Table& table) {
    for (int id : slot.views) {
      if (!table.viewHeldByOther(slot, id, *this)) {
        erase(slot.ctx, id);
      }
    }
  }
};

constexpr GaugeRole kL{false, false};
constexpr GaugeRole kLV{false, true};
constexpr GaugeRole kR{true, false};
constexpr GaugeRole kRV{true, true};
constexpr GaugeRole kRoles[4] = {kL, kLV, kR, kRV};

// PRE_INSTALL as the gauge code does it: a slot, then its views when there is room.
static FakeSlot* install(Table& table, FakeEngine& engine, unsigned long long ctx, GaugeRole role) {
  FakeSlot* slot = table.install(ctx, role, engine);
  if (slot != nullptr) {
    table.ensureViews(*slot, engine);
  }
  return slot;
}

// What a gauge shows: its views exist and render (found by its context, as PRE_DRAW does, which retries the views).
static bool gaugeShows(Table& table, FakeEngine& engine, unsigned long long ctx) {
  FakeSlot* slot = table.find(ctx);
  if (slot == nullptr || !table.ensureViews(*slot, engine) || slot->views.empty()) {
    return false;
  }
  for (int id : slot->views) {
    if (!engine.renders(slot->ctx, id)) {
      return false;
    }
  }
  return true;
}

// The four A380X gauges of one flight, in panel.cfg order (L, LV, R, RV), with contexts base + 0..3.
static void installFlight(Table& table, FakeEngine& engine, unsigned long long base) {
  for (int i = 0; i < 4; ++i) {
    install(table, engine, base + static_cast<unsigned long long>(i), kRoles[i]);
  }
}

static void killFlight(Table& table, FakeEngine& engine, unsigned long long base) {
  for (int i = 0; i < 4; ++i) {
    table.kill(base + static_cast<unsigned long long>(i), engine);
  }
}

static bool flightShows(Table& table, FakeEngine& engine, unsigned long long base) {
  bool all = true;
  for (int i = 0; i < 4; ++i) {
    all = gaugeShows(table, engine, base + static_cast<unsigned long long>(i)) && all;
  }
  return all;
}

// Frames of the flight's gauges drawing (each PRE_DRAW retries the views of a gauge that waits for room).
static void drawFlight(Table& table, FakeEngine& engine, unsigned long long base, int frames) {
  for (int frame = 0; frame < frames; ++frame) {
    for (int i = 0; i < 4; ++i) {
      FakeSlot* slot = table.find(base + static_cast<unsigned long long>(i));
      if (slot != nullptr) {
        table.ensureViews(*slot, engine);
      }
    }
  }
}

// The sim drops a gauge (and its views) without a PRE_KILL.
static void dropGauge(Table& table, FakeEngine& engine, unsigned long long ctx) {
  for (const FakeSlot& slot : table.slots) {
    if (slot.inUse && slot.ctx == ctx) {
      for (int id : slot.views) {
        engine.erase(ctx, id);
      }
    }
  }
}

static int slotsDrawing(const Table& table) {
  int count = 0;
  for (const FakeSlot& slot : table.slots) {
    count += slot.inUse && !slot.superseded ? 1 : 0;
  }
  return count;
}

static void testFreshStart() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  expect("fresh start: every gauge shows", flightShows(table, engine, 10));
  expectEqual("fresh start: views", table.viewsLive, kMaxMapViews);
}

static void testReloadKillsFirst() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  for (int reload = 1; reload <= 5; ++reload) {
    killFlight(table, engine, 10 * reload);
    installFlight(table, engine, 10 * (reload + 1));
  }
  expect("reloads, kills first: every gauge shows", flightShows(table, engine, 60));
  expectEqual("reloads, kills first: views", static_cast<int>(engine.existing.size()), kMaxMapViews);
}

// The new flight's gauges installed before the old flight's are killed: the old code created the new views next to
// the old ones, so the gauges installed last (the F/O VD terrain gauge last of all) got views past the budget.
static void testReloadNewBeforeOldKill() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  for (int reload = 1; reload <= 5; ++reload) {
    const unsigned long long oldBase = 10ULL * static_cast<unsigned long long>(reload);
    installFlight(table, engine, oldBase + 10);
    drawFlight(table, engine, oldBase + 10, 30);
    killFlight(table, engine, oldBase);
    expect("new before old kill: every gauge shows", flightShows(table, engine, oldBase + 10));
  }
  expect("new before old kill: F/O VD shows", gaugeShows(table, engine, 63));
  expect("new before old kill: never more than kMaxMapViews views", engine.mostViewsAtOnce <= kMaxMapViews);
  expectEqual("new before old kill: old gauges superseded", table.stats.supersedes, 20);
  expectEqual("new before old kill: every kill finds its slot", table.stats.killsWithoutSlot, 0);
}

// The sim drops the old flight's gauges and their views without a PRE_KILL: the old code kept their slots, and the
// table ran full on the second reload.
static void testReloadWithoutKills() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  for (int reload = 1; reload <= 5; ++reload) {
    const unsigned long long oldBase = 10ULL * static_cast<unsigned long long>(reload);
    for (int i = 0; i < 4; ++i) {
      dropGauge(table, engine, oldBase + static_cast<unsigned long long>(i));
    }
    installFlight(table, engine, oldBase + 10);
    drawFlight(table, engine, oldBase + 10, ndwxr::kSupersededGraceFrames + 1);
    expect("no kills: every gauge shows", flightShows(table, engine, oldBase + 10));
    expectEqual("no kills: one drawing slot per gauge", slotsDrawing(table), 4);
  }
  expect("no kills: never more than kMaxMapViews views", engine.mostViewsAtOnce <= kMaxMapViews);
}

// Only the F/O VD terrain gauge misses its PRE_KILL (and the sim drops it): the old code drew the reinstalled gauge
// from its stale slot when the sim gave it the same context, and ran out of slots after four reloads.
static void testRvKillMissed() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  for (int reload = 1; reload <= 5; ++reload) {
    const unsigned long long oldBase = 10ULL * static_cast<unsigned long long>(reload);
    for (int i = 0; i < 3; ++i) {
      table.kill(oldBase + static_cast<unsigned long long>(i), engine);
    }
    dropGauge(table, engine, oldBase + 3);
    installFlight(table, engine, oldBase + 10);
    drawFlight(table, engine, oldBase + 10, ndwxr::kSupersededGraceFrames + 1);
  }
  expect("RV kill missed: F/O VD shows", gaugeShows(table, engine, 63));
  expect("RV kill missed: every gauge shows", flightShows(table, engine, 60));
}

// A PRE_KILL that comes after the grace: the late kill still deletes the old views.
static void testLateKillAfterGrace() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  installFlight(table, engine, 20);
  drawFlight(table, engine, 20, ndwxr::kSupersededGraceFrames + 1);
  expectEqual("late kill: old views abandoned", table.stats.abandons, 4);
  killFlight(table, engine, 10);
  expectEqual("late kill: every kill finds its slot", table.stats.killsWithoutSlot, 0);
  expectEqual("late kill: old views deleted", static_cast<int>(engine.existing.size()), kMaxMapViews);
}

// The sim installs a context again without killing it first: its old views are deleted, the new slot draws.
static void testSameContextReinstalled() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  install(table, engine, 13, kRV);
  expect("same context reinstalled: shows", gaugeShows(table, engine, 13));
  int withContext = 0;
  for (const FakeSlot& slot : table.slots) {
    withContext += slot.inUse && slot.ctx == 13 ? 1 : 0;
  }
  expectEqual("same context reinstalled: one slot", withContext, 1);
  expectEqual("same context reinstalled: views", static_cast<int>(engine.existing.size()), kMaxMapViews);
}

// The sim dropped a gauge's views itself and gave the same numbers to a gauge of the next flight (another context):
// the old slot's late PRE_KILL must not delete the new gauge's views.
static void testRecycledIdsNotDeleted() {
  Table table;
  FakeEngine engine;
  engine.recycleIds = true;
  installFlight(table, engine, 10);
  // The old flight's CPT ND gauge loses its views (ids 1 and 2) without a PRE_KILL.
  dropGauge(table, engine, 10);
  // The new flight's gauges, the F/O VD terrain gauge first; the old ones (but the CPT ND) are killed.
  install(table, engine, 23, kRV);
  install(table, engine, 20, kL);
  install(table, engine, 21, kLV);
  install(table, engine, 22, kR);
  for (unsigned long long ctx = 11; ctx <= 13; ++ctx) {
    table.kill(ctx, engine);
  }
  // The CPT ND gets the dropped ids again; the F/O VD waits for the old CPT ND gauge's views (still counted) until it
  // has waited the grace.
  drawFlight(table, engine, 20, ndwxr::kSupersededGraceFrames + 1);
  const FakeSlot* cptNd = table.find(20);
  expect("recycled ids: the new CPT ND got the dropped numbers", cptNd != nullptr && !cptNd->views.empty() && cptNd->views[0] == FakeEngine::kFirstId);
  expect("recycled ids: the F/O VD shows after the grace", gaugeShows(table, engine, 23));
  // The old CPT ND gauge's PRE_KILL comes after all: ids 1 and 2 are the new CPT ND's now.
  table.kill(10, engine);
  expect("recycled ids: every gauge shows", flightShows(table, engine, 20));
}

// Unloading a flight deletes every view: all four gauges number their views alike (2, 3), and a gauge must not take
// the other gauges' numbers for its own views still held.
static void testUnloadDeletesEveryView() {
  Table table;
  FakeEngine engine;
  installFlight(table, engine, 10);
  for (unsigned long long ctx = 10; ctx <= 13; ++ctx) {
    table.kill(ctx, engine);
  }
  expectEqual("unload: no view left", static_cast<int>(engine.existing.size()), 0);
  installFlight(table, engine, 20);
  expect("unload: the next flight shows", flightShows(table, engine, 20));
}

// The views wait for room rather than becoming views past the budget.
static void testViewsWaitForRoom() {
  Table table;
  FakeEngine engine;
  engine.viewsPerGauge = 3;
  install(table, engine, 1, kL);
  install(table, engine, 2, kLV);
  install(table, engine, 3, kR);
  expect("no room: waits", !gaugeShows(table, engine, 3));
  expectEqual("no room: no view created", static_cast<int>(engine.existing.size()), 6);
  expectEqual("no room: counted once", table.stats.viewWaits, 1);
  table.kill(1, engine);
  expect("room again: shows", gaugeShows(table, engine, 3));
  expect("never more than kMaxMapViews views", engine.mostViewsAtOnce <= kMaxMapViews);
}

int main() {
  testFreshStart();
  testReloadKillsFirst();
  testReloadNewBeforeOldKill();
  testReloadWithoutKills();
  testRvKillMissed();
  testLateKillAfterGrace();
  testSameContextReinstalled();
  testRecycledIdsNotDeleted();
  testUnloadDeletesEveryView();
  testViewsWaitForRoom();
  if (failures == 0) {
    std::printf("gauge_slots_test: all passed\n");
  }
  return failures == 0 ? 0 : 1;
}
