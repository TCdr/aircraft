// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// ---------------------------------------------------------------------------
// The obstacle grid of the A32NX (see obstacle_grid.h) in memory: loads the file of the aircraft package once and turns
// the blocks around the aircraft into runs of cells for the terrain picture.
//
// The file is read through the simulator's asynchronous file API, as the GPWS does for the same file (the SDK header of
// it is not part of the SDK copy this builds against, so the three functions used are declared here; the build links
// with --allow-undefined). The whole file is about 265 KB, so it is kept compressed in memory and a block is inflated
// the first time the ND range reaches it. The obstacles are only the United States', so what is inflated stays small
// and is never dropped.
// ---------------------------------------------------------------------------

#ifndef A380X

#include "ndwxr.h"

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wundef"
#pragma clang diagnostic ignored "-Wconversion"
#pragma clang diagnostic ignored "-Wold-style-cast"
#pragma clang diagnostic ignored "-Wdouble-promotion"
#include "../../fbw_common/src/zlib/zlib.h"
#pragma clang diagnostic pop

extern "C" {
typedef unsigned long long FsIoFile;
typedef void (*FsIoOpenCallback)(FsIoFile file, void* userData);
typedef void (*FsIoReadCallback)(FsIoFile file, char* buffer, int byteOffset, int bytesRead, void* userData);
FsIoFile fsIOOpen(const char* path, unsigned flags, FsIoOpenCallback callback, void* userData);
unsigned fsIORead(FsIoFile file, char* buffer, int byteOffset, int bytesToRead, FsIoReadCallback callback, void* userData);
bool fsIOHasError(FsIoFile file);
}

namespace ndwxr {

namespace {

// Same path (relative to the package root) the GPWS opens
constexpr const char* kObstacleGridPath = "./SimObjects/AirPlanes/FlyByWire_A320_NEO/panel/obstacle_grid.bin";
constexpr unsigned kFsIoOpenReadOnly = 1;
constexpr unsigned kFsIoSuccess = 0;
// Design choice: at most 2 blocks (90,000 cells each) are inflated per frame, so that reaching new blocks by a range
// change does not stall a frame.
constexpr int kBlocksInflatedPerFrame = 2;

enum class LoadStage { NotStarted, Opening, ReadingHeader, ReadingIndex, ReadingFile, Ready, Failed };

struct LoadedBlock {
  ObstacleBlockId id;
  std::vector<ObstacleCell> cells;
};

struct ObstacleStore {
  LoadStage stage = LoadStage::NotStarted;
  FsIoFile file = 0;
  // set by the simulator's callbacks
  bool openDone = false;
  bool readDone = false;
  int bytesRead = 0;
  int bytesRequested = 0;
  // the file; grown only while no read is pending, since the simulator writes into it
  std::vector<uint8_t> bytes;
  ObstacleGridLayout layout;
  std::vector<LoadedBlock> blocks;
  std::vector<uint8_t> inflated;
};

ObstacleStore g_store;

void onOpen(FsIoFile file, void*) {
  g_store.file = file;
  g_store.openDone = true;
}

void onRead(FsIoFile, char*, int, int bytesRead, void*) {
  g_store.bytesRead = bytesRead;
  g_store.readDone = true;
}

void fail(const char* why) {
  // once: the stage stays failed
  std::printf("[ndwxr] obstacle grid unavailable: %s\n", why);
  g_store.stage = LoadStage::Failed;
}

bool startRead(size_t length) {
  g_store.bytes.resize(length);
  g_store.readDone = false;
  g_store.bytesRequested = static_cast<int>(length);
  const unsigned error = fsIORead(g_store.file, reinterpret_cast<char*>(g_store.bytes.data()), 0, g_store.bytesRequested, onRead, nullptr);
  return error == kFsIoSuccess;
}

// The end of the last block in the file: the size to read.
size_t fileSizeFromIndex() {
  size_t end = static_cast<size_t>(g_store.layout.indexOffset) + obstacleIndexBytes(g_store.layout);
  for (int row = 0; row < g_store.layout.blockRows; ++row) {
    for (int column = 0; column < g_store.layout.blockColumns; ++column) {
      ObstacleBlockEntry entry;
      if (obstacleBlockEntry(g_store.layout, g_store.bytes.data(), g_store.bytes.size(), ObstacleBlockId{row, column}, &entry) &&
          entry.isDeflated && static_cast<size_t>(entry.offset) + entry.length > end) {
        end = static_cast<size_t>(entry.offset) + entry.length;
      }
    }
  }
  return end;
}

void advanceLoading() {
  ObstacleStore& store = g_store;
  switch (store.stage) {
    case LoadStage::NotStarted:
      store.stage = LoadStage::Opening;
      store.openDone = false;
      if (fsIOOpen(kObstacleGridPath, kFsIoOpenReadOnly, onOpen, nullptr) == 0) {
        fail("cannot open the file");
      }
      return;
    case LoadStage::Opening:
      if (!store.openDone) {
        return;
      }
      if (store.file == 0 || fsIOHasError(store.file) || !startRead(kObstacleHeaderBytes)) {
        fail("cannot read the header");
        return;
      }
      store.stage = LoadStage::ReadingHeader;
      return;
    case LoadStage::ReadingHeader:
    case LoadStage::ReadingIndex:
    case LoadStage::ReadingFile:
      break;
    default:
      return;
  }

  if (fsIOHasError(store.file)) {
    fail("read error");
    return;
  }
  if (!store.readDone) {
    return;
  }
  if (store.bytesRead != store.bytesRequested) {
    fail("short read");
    return;
  }
  if (store.stage == LoadStage::ReadingHeader) {
    if (!parseObstacleGridLayout(store.bytes.data(), store.bytes.size(), &store.layout)) {
      fail("not an obstacle grid");
      return;
    }
    if (!startRead(static_cast<size_t>(store.layout.indexOffset) + obstacleIndexBytes(store.layout))) {
      fail("cannot read the index");
      return;
    }
    store.stage = LoadStage::ReadingIndex;
  } else if (store.stage == LoadStage::ReadingIndex) {
    if (!startRead(fileSizeFromIndex())) {
      fail("cannot read the blocks");
      return;
    }
    store.stage = LoadStage::ReadingFile;
  } else {
    store.stage = LoadStage::Ready;
  }
}

// Inflates a block and keeps its cells; a block that cannot be read is kept empty, so it is not tried again.
void loadBlock(ObstacleBlockId id) {
  g_store.blocks.push_back(LoadedBlock{id, {}});
  std::vector<ObstacleCell>& cells = g_store.blocks.back().cells;
  ObstacleBlockEntry entry;
  if (!obstacleBlockEntry(g_store.layout, g_store.bytes.data(), g_store.bytes.size(), id, &entry) || !entry.isDeflated) {
    // The obstacle file only has constant blocks of 0 (no obstacle)
    return;
  }
  if (static_cast<size_t>(entry.offset) + entry.length > g_store.bytes.size()) {
    return;
  }
  const size_t side = static_cast<size_t>(obstacleCellsPerBlockSide(g_store.layout));
  g_store.inflated.resize(side * side);
  z_stream stream = {};
  stream.next_in = const_cast<Bytef*>(g_store.bytes.data() + entry.offset);
  stream.avail_in = entry.length;
  stream.next_out = g_store.inflated.data();
  stream.avail_out = static_cast<uInt>(g_store.inflated.size());
  // Raw deflate, as the file writer makes it
  if (inflateInit2(&stream, -15) != Z_OK) {
    return;
  }
  const int result = inflate(&stream, Z_FINISH);
  const bool complete = result == Z_STREAM_END && stream.total_out == g_store.inflated.size();
  inflateEnd(&stream);
  if (complete) {
    collectObstacleCells(g_store.layout, id, g_store.inflated.data(), g_store.inflated.size(), &cells);
  }
}

}  // namespace

int collectObstacleRuns(const ObstacleView& view, ThreatRun* out, int capacity) {
  advanceLoading();
  if (g_store.stage != LoadStage::Ready) {
    return 0;
  }
  ObstacleBlockId blocks[kObstacleMaxBlocksInView];
  const int blockCount = obstacleBlocksInView(g_store.layout, view, blocks, kObstacleMaxBlocksInView);
  int count = 0;
  int inflatedThisFrame = 0;
  for (int i = 0; i < blockCount; ++i) {
    const LoadedBlock* loaded = nullptr;
    for (const LoadedBlock& block : g_store.blocks) {
      if (block.id.row == blocks[i].row && block.id.column == blocks[i].column) {
        loaded = &block;
        break;
      }
    }
    if (loaded == nullptr) {
      if (inflatedThisFrame >= kBlocksInflatedPerFrame) {
        continue;
      }
      loadBlock(blocks[i]);
      ++inflatedThisFrame;
      loaded = &g_store.blocks.back();
    }
    count = appendObstacleRuns(loaded->cells, view, out, capacity, count);
  }
  return count;
}

}  // namespace ndwxr

#endif  // !A380X
