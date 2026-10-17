// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The slot table of the gauge instances and the module's budget of MapViews: pure logic (no MSFS dependency), tested
// natively by test/gauge_slots_test.cpp.
//
// All the gauges of the module run inside one WASM module instance whose memory outlives a flight: on a flight reload
// the sim installs the gauges of the new flight while this table still holds what the previous flight left. A slot
// (and its MapViews) outlives its gauge when the old gauge's PRE_KILL comes after the new gauge's PRE_INSTALL, or never
// comes. A MapView created while the module already has kMaxMapViews does not render (see the note in ndwxr.h), and
// the gauge installed last gets it: the A380X F/O VD terrain gauge, last in panel.cfg, whose VD showed the runways
// only after several flight reloads (measured in the sim, twice, both times gone after an MSFS restart). So:
// - a gauge installed again with the same context (no PRE_KILL in between) takes its old slot over: the old views are
//   deleted (the context is alive, it is being installed) before the new ones are created;
// - a gauge installed while a gauge of the same role holds a slot (the panel has one gauge per role) supersedes it:
//   the old slot no longer draws, and is released at its own PRE_KILL (its context is alive until then);
// - a gauge creates its views only while the module stays within kMaxMapViews; otherwise it waits (tried again every
//   frame) until other views are deleted. When it has waited kSupersededGraceFrames, the superseded slot of its role
//   (else another superseded slot) is abandoned: its views no longer count, without calling the sim (its PRE_KILL may
//   never come, and its context may be gone); should the PRE_KILL come after all, the views are deleted then;
// - a view id is a number within its gauge's context (each gauge's first view is 2, measured in the sim): a slot
//   released late never deletes an id that another slot of the same context holds (the sim may have handed it on),
//   while the same number in another context is another view and is deleted.

#pragma once

namespace ndwxr {

// The MapViews this module can have at once (see the note in ndwxr.h).
constexpr int kMaxMapViews = 8;

// The frames a gauge waiting for room waits for the PRE_KILL of the superseded gauge of its role (about 5 s).
constexpr int kSupersededGraceFrames = 300;

// What a gauge is, from its panel.cfg parameter: the side, and (A380X) whether it is the VD terrain gauge of that side.
struct GaugeRole {
  bool isRight = false;
  bool isVdTerrain = false;
};

// Counts of the table's events (checked by gauge_slots_test.cpp).
struct GaugeSlotStats {
  int installs = 0;
  int kills = 0;
  int killsWithoutSlot = 0;  // a PRE_KILL of a context that holds no slot
  int takeOvers = 0;         // slots of a context installed again without a PRE_KILL
  int supersedes = 0;        // slots of a role installed again before the old gauge's PRE_KILL
  int abandons = 0;          // superseded slots no longer counted because their PRE_KILL did not come in time
  int viewWaits = 0;         // gauges that had to wait for room for their views
};

// The table. Slot needs, all reset by Slot{}: bool inUse, a ctx, bool isRight, bool isVdTerrain, bool superseded,
// bool abandoned, bool viewsCreated, int viewsReserved (the views it counts against kMaxMapViews), bool waitingForViews and int
// waitFrames. Engine needs:
//   int viewsNeeded(const Slot&)                 - how many views the slot's role creates
//   void createViews(Slot&)                      - creates and sets them up
//   bool holdsView(const Slot&, int id)          - whether the slot holds that view id
//   void destroy(Slot&, const GaugeSlots& table) - deletes the slot's views (but not one table.viewHeldByOther)
//                                                  and everything else the slot owns, with the slot's context
template <typename Slot, int N>
class GaugeSlots {
 public:
  using Context = decltype(Slot::ctx);

  Slot slots[N];
  int viewsLive = 0;
  GaugeSlotStats stats;

  // The slot that draws for a context (a superseded slot does not).
  Slot* find(Context ctx) {
    for (Slot& slot : slots) {
      if (slot.inUse && !slot.superseded && slot.ctx == ctx) {
        return &slot;
      }
    }
    return nullptr;
  }

  // PRE_INSTALL: takes over or supersedes the earlier slots of this context and role, then gives the gauge a free
  // slot (null when none is left). Its views are created by ensureViews.
  template <typename Engine>
  Slot* install(Context ctx, GaugeRole role, Engine& engine) {
    ++stats.installs;
    for (Slot& slot : slots) {
      if (!slot.inUse) {
        continue;
      }
      if (slot.ctx == ctx) {
        ++stats.takeOvers;
        release(slot, engine);
      } else if (!slot.superseded && slot.isRight == role.isRight && slot.isVdTerrain == role.isVdTerrain) {
        ++stats.supersedes;
        slot.superseded = true;
      }
    }
    Slot* free = freeSlot();
    // The table is full of slots whose PRE_KILL never came: an abandoned one (else a superseded one) makes room.
    for (int pass = 0; pass < 2 && free == nullptr; ++pass) {
      for (Slot& slot : slots) {
        if (free == nullptr && slot.inUse && slot.superseded && (pass == 1 || slot.abandoned)) {
          abandon(slot);
          forget(slot);
          free = &slot;
        }
      }
    }
    if (free == nullptr) {
      return nullptr;
    }
    *free = Slot{};
    free->inUse = true;
    free->ctx = ctx;
    free->isRight = role.isRight;
    free->isVdTerrain = role.isVdTerrain;
    return free;
  }

  // Creates the slot's views when the budget has room; true once they exist. Called at the install and before every
  // draw (a frame), so a gauge that had to wait gets its views as soon as others are deleted.
  template <typename Engine>
  bool ensureViews(Slot& slot, Engine& engine) {
    if (slot.viewsCreated) {
      return true;
    }
    const int needed = engine.viewsNeeded(slot);
    if (viewsLive + needed > kMaxMapViews) {
      if (!slot.waitingForViews) {
        slot.waitingForViews = true;
        slot.waitFrames = 0;
        ++stats.viewWaits;
      }
      if (++slot.waitFrames < kSupersededGraceFrames || !abandonSupersededOfRole(slot)) {
        return false;
      }
      if (viewsLive + needed > kMaxMapViews) {
        return false;
      }
    }
    viewsLive += needed;
    slot.viewsReserved = needed;
    slot.viewsCreated = true;
    slot.waitingForViews = false;
    engine.createViews(slot);
    return true;
  }

  // PRE_KILL (a superseded slot is released by its own gauge's kill).
  template <typename Engine>
  void kill(Context ctx, Engine& engine) {
    ++stats.kills;
    for (Slot& slot : slots) {
      if (slot.inUse && slot.ctx == ctx) {
        release(slot, engine);
        return;
      }
    }
    ++stats.killsWithoutSlot;
  }

  // Whether a slot other than `except`, of the same context, holds the view id. View ids are numbered per context:
  // the same number in another context is another view (comparing the numbers alone kept 3 of the 4 gauges of a
  // flight from deleting their views when unloaded).
  template <typename Engine>
  bool viewHeldByOther(const Slot& except, int id, const Engine& engine) const {
    for (const Slot& slot : slots) {
      if (&slot != &except && slot.inUse && slot.ctx == except.ctx && engine.holdsView(slot, id)) {
        return true;
      }
    }
    return false;
  }

 private:
  Slot* freeSlot() {
    for (Slot& slot : slots) {
      if (!slot.inUse) {
        return &slot;
      }
    }
    return nullptr;
  }

  // Deletes what the slot owns (with its own, live context) and frees it.
  template <typename Engine>
  void release(Slot& slot, Engine& engine) {
    engine.destroy(slot, *this);
    forget(slot);
  }

  // A superseded slot's views stop counting, without calling the sim; the slot stays for a late PRE_KILL.
  void abandon(Slot& slot) {
    if (slot.abandoned) {
      return;
    }
    ++stats.abandons;
    slot.abandoned = true;
    viewsLive -= slot.viewsReserved;
    if (viewsLive < 0) {
      viewsLive = 0;
    }
    slot.viewsReserved = 0;
  }

  // The superseded slot of the waiting gauge's role, else any superseded slot (a gauge of another role, whose own
  // successor got its views without waiting, can be the one in the way).
  bool abandonSupersededOfRole(const Slot& waiting) {
    for (int pass = 0; pass < 2; ++pass) {
      for (Slot& slot : slots) {
        const bool sameRole = slot.isRight == waiting.isRight && slot.isVdTerrain == waiting.isVdTerrain;
        if (slot.inUse && slot.superseded && !slot.abandoned && (pass == 1 || sameRole)) {
          abandon(slot);
          return true;
        }
      }
    }
    return false;
  }

  void forget(Slot& slot) {
    viewsLive -= slot.viewsReserved;
    if (viewsLive < 0) {
      viewsLive = 0;
    }
    slot = Slot{};
  }
};

}  // namespace ndwxr
