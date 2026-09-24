// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Shared NanoVG helpers: the sRGB encoding the engine expects of paint tints, clearing the
// gauge's persistent surface, and the two plain fills of the mask pipeline.

#include "ndwxr.h"

namespace ndwxr {

// Wipes this gauge's own surface back to fully transparent so nd.html shows
// through again. Composite state is set back to source-over afterwards.
// Both operations are used as belt and braces: either one alone clears the
// surface.
void clearLayer(NVGcontext* vg, float width, float height) {
  nvgBeginPath(vg);
  nvgRect(vg, 0.0f, 0.0f, width, height);
  nvgFillColor(vg, nvgRGBAf(0.0f, 0.0f, 0.0f, 0.0f));
  nvgGlobalCompositeOperation(vg, NVG_COPY);
  nvgFill(vg);

  nvgBeginPath(vg);
  nvgRect(vg, 0.0f, 0.0f, width, height);
  nvgFillColor(vg, nvgRGBAf(0.0f, 0.0f, 0.0f, 1.0f));
  nvgGlobalCompositeOperation(vg, NVG_DESTINATION_OUT);
  nvgFill(vg);

  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

// The engine treats paint colors (the tint set on the image paint) as sRGB-encoded
// and decodes them to linear before multiplying them with the texture and
// blending. A weight meant as a LINEAR fraction therefore has to be passed
// encoded: in-sim, a plain 1/9 tint decoded to ~0.012 and the nine-tap blur came
// out at ~40% brightness with the turbulence erase barely working.
float encodeSrgb(float linear) {
  return linear <= 0.0031308f ? 12.92f * linear : 1.055f * std::pow(linear, 1.0f / 2.4f) - 0.055f;
}

// The two plain (untextured) fills of the mask pipeline over a rect; the caller sets
// the scissor. Sharpen squares what's on the surface (dst * dst, kSharpenPasses
// times); Colorize multiplies it by the band colors (dst * color).
void sharpenRect(NVGcontext* vg, float x, float y, float w, float h, int passes) {
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_DST_COLOR, NVG_ZERO, NVG_ONE);
  for (int i = 0; i < passes; ++i) {
    nvgBeginPath(vg);
    nvgRect(vg, x, y, w, h);
    nvgFillColor(vg, nvgRGBAf(1.0f, 1.0f, 1.0f, 1.0f));
    nvgFill(vg);
  }
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

void colorizeRect(NVGcontext* vg, float x, float y, float w, float h) {
  nvgGlobalCompositeBlendFuncSeparate(vg, NVG_ZERO, NVG_SRC_COLOR, NVG_ZERO, NVG_ONE);
  nvgBeginPath(vg);
  nvgRect(vg, x, y, w, h);
  nvgFillColor(vg, nvgRGBAf(encodeSrgb(kRedLevel), encodeSrgb(kGreenLevel), 0.0f, 1.0f));
  nvgFill(vg);
  nvgGlobalCompositeOperation(vg, NVG_SOURCE_OVER);
}

}  // namespace ndwxr
