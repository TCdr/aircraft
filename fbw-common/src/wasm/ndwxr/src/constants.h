// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

#pragma once

// The tuning constants of the ndwxr module, in one place: display geometry, the radar colour bands
// and their filtering, the terrain look, the A380X vertical display and the SimBridge timings. The
// comments record what was measured in the simulator and which manual page a value follows.

namespace ndwxr {

#ifdef A380X
// A380X_EFIS_x_ACTIVE_OVERLAY (FcuBusPublisher.ts): 0 = none, 1 = WXR, 2 = TERR.
constexpr double kOverlayWxr = 1.0;
constexpr double kOverlayTerr = 2.0;

// The vertical cut of the VD's terrain profile, published by EfisTawsBridge.ts (publishVdCut): along the
// active flight plan in the managed lateral modes (mode 1, the vertices below in degrees), along the
// aircraft's track otherwise (mode 0), as the real VD (FCOM DSC-31-20-40-10, "the vertical cut runs
// along the active flight plan ... or the current track").
constexpr int kVdCutMaxVertices = 32;
constexpr int kVdCutMaxSegments = kVdCutMaxVertices;

// The RDR-4000 takes about 30 s to fill its 3D buffer once the crew selects the radar (FCOM
// DSC-34-20-30, operational recommendations: "when they press the WX pb on the EFIS CP, it takes
// about 30 s to fill the buffer with radar data and have the complete display available on the
// ND and on the VD"). While it fills, the picture is revealed by one slow sweep from the left
// edge to the right one. The transmitter is shared by both NDs (see the ND draw).
constexpr double kWxrBufferFillSeconds = 30.0;

// The vertical display (VD) below the A380X ND (VerticalDisplay.tsx): its plot
// spans x = 150 (range 0) .. 690 (VD range) and y = 800 (upper altitude) ..
// 1000 (lower altitude) of the 768x1024 ND screen. The VD range is the ND
// range in ARC (10..160 NM) and half of it in ROSE NAV (5..160 NM); the VD
// publishes its altitude limits as L:A32NX_VD_{1,2}_RANGE_LOWER/_UPPER (feet).
constexpr float kVdLeft = 150.0f;
constexpr float kVdTop = 800.0f;
constexpr float kVdWidth = 540.0f;
constexpr float kVdHeight = 200.0f;

// The VD weather is STYLISED, not measured: MSFS's radar API has no vertical
// data (its "vertical" MapView mode is a single thin beam, and tilting that
// beam crashed the module), so the VD is built from the ND's own radar views, which
// see one slice of weather at about the aircraft's altitude (see the header of the
// module). The ND texel columns along the VD's vertical cut are rotated onto the VD's
// range axis and extruded vertically, shaped like the cells of a real VD: green and
// yellow columns from the ground up to a rounded, tapering top (kVdGreenTopSpan /
// kVdYellowTopSpan above the aircraft altitude), with the red core a block centred on
// the aircraft's altitude (+-kVdRedHalfSpan), where the ND measures it.
//  Turbulence (magenta) is not drawn on the VD: the real VD does not display it
//  either (FCOM DSC-31-20-40-10, weather display).
// All the heights are made up, and given as fractions of the altitude span of the
// VD plot (in-sim, fixed heights of thousands of feet were far above the plot at low
// altitude, where the VD only spans about 5000 ft, so no top was ever visible). The
// columns stand on the ground: from sea level up when the plot reaches below it.
//
// The rounded top is built from levels (kVdColumnDome): level 0 is the whole shape, only
// up to a fraction of the height; each further level covers the next band of height but
// only where the shape is also there depthPx to both sides along the range axis (an
// erosion: three taps, all must agree), so the shape is narrower the higher it goes. The
// levels follow the outline of a quarter ellipse (steep near the shape's edge, flat on
// top), so a column has straight sides up to about half its height and rounded shoulders.
// Each level only draws its own band of height (plus a small overlap, kVdBandOverlapPx).
//
// The cut is the VD's vertical cut (FCOM DSC-31-20-40-10: the active flight plan in the
// managed lateral modes, the track otherwise; "for the weather display, the WXR considers
// a zero-width vertical cut"), followed piece by piece as the terrain does (see
// drawVdErodedRect). The radar's beam has a width, though (about 3.5 degrees), so the
// base level shows the STRONGEST weather within the beam around the cut (half angle
// atan(kVdWedgeTan)): kVdLateralTapsPerSide columns on each side of the cut are drawn
// on top of each other (a union), each one only from the range where it enters the
// beam. The raw ND texture has single-texel specks and radial sweep streaks that the
// ND's own blur removes; here each column has to be at least 2 * kVdSpeckPx wide to
// count (two taps, both must agree), otherwise they came out as thin full-height lines.
//
// Each output color channel is driven by its own mask channel (precipitation view:
// R = yellow and above, G = green and above; hot view: G = red and above), so every
// channel can be clipped to its own altitude window without mixing channels; the red
// wipe removes the green channel inside the red core.
constexpr float kVdGreenTopSpan = 0.42f;
constexpr float kVdYellowTopSpan = 0.26f;
constexpr float kVdRedHalfSpan = 0.16f;

// The VD is squared harder than the ND (kSharpenPasses): the eroded levels only
// reach full strength where both taps agree, and the half values in between
// showed as dim patches and hairlines.
constexpr int kVdSharpenPasses = 4;
constexpr float kVdSpeckPx = 3.0f;

// How much of the green channel survives the red core's wipe on the VD. Much lower than
// kEraseRemainder: a band drawn once or twice (where two levels overlap) must wipe the
// same, otherwise the overlaps showed as lighter stripes through the magenta core.
constexpr float kVdEraseRemainder = 0.002f;

struct VdDomeLevel {
  float depthPx;         // how far inside the shape (along the range axis, VD pixels) this level needs to be
  float heightFraction;  // how much of the full height it reaches
};

// h = h0 + (1 - h0) * sqrt(1 - (1 - t)^2), depth = t * 24 (h0 = 0.5, t = 0, 1/7 .. 1).
// A single level: the real VD draws the cells as plain vertical bars with flat tops (A380 ND photo, MALPA); the
// rounded dome of before was h = h0 + (1 - h0) * sqrt(1 - (1 - t)^2), depth = t * 24 over 8 levels.
constexpr VdDomeLevel kVdColumnDome[] = {{0.0f, 1.0f}};
constexpr int kVdColumnDomeCount = 1;

// Why the red core is a plain block and not a rounded shape: the red is made by wiping the
// green channel out of the yellow with a multiply blend, and a multiply can only be "any one
// tap sees the weather" (a dilation - the erosion taps made the outer levels WIDER than the
// inner ones, an hourglass), never "all taps agree". Additive passes (the columns) can be
// eroded properly.
// Each level's band reaches this far into the band below it. The edge of a band
// falls on a fractional pixel, where the two neighbouring bands only cover part
// of it each; the VD's sharpening passes (kVdSharpenPasses) square such a
// half-covered pixel to black, which drew a dark seam between every two levels.
// Where both levels cover the pixel the overlap just adds up to full.
constexpr float kVdBandOverlapPx = 3.0f;

constexpr float kVdWedgeTan = 0.0306f;  // tan(1.75 deg), half the beam width

constexpr int kVdLateralTapsPerSide = 3;

// The heading-line columns are stretched across the whole VD height by scaling the
// ND texture this many screen pixels per texel across the path (much more than the
// VD is tall, so neighbouring columns don't leak in).
constexpr float kVdColumnTexelPx = 3000.0f;
// Measured in-sim (2026-09-19): MSFS has no usable height information for the
// horizontal radar. fsMapViewSetAltitudeRangeInFeet changes nothing on it (slabs
// 3000-5000 and 9000-11000 ft above the aircraft came out identical to each other),
// and the TOP VIEW radar mode is a composite over all altitudes that saturates
// red almost everywhere and ignores the 180 degree cone - it says weather exists
// aloft, not how high. Hence the made-up heights above.
#endif
#ifndef A380X
constexpr double kWxrSysOff = 1.0;
#endif
#ifdef A380X
// Mirrors EfisNdMode in fbw-common/.../NavigationDisplay.ts:33-39 (ROSE ILS = 0,
// ROSE VOR = 1, ROSE NAV = 2, ARC = 3, PLAN = 4).
constexpr double kNdModeRoseNav = 2.0;
#endif

constexpr double kNdModeArc = 3.0;
constexpr double kNdModePlan = 4.0;

#ifdef A380X
// a380EfisRangeSettings, NavigationDisplay.ts:19. Range index 0 (-1) is the
// OANS airport map: the ND shows that instead of the moving map, so no radar.
constexpr float kRangeTableNm[8] = {-1.0f, 10.0f, 20.0f, 40.0f, 80.0f, 160.0f, 320.0f, 640.0f};
// The weather is not displayed above this ND range: "The ND can only display the weather, if the
// selected range is below, or equal to, 320 nm" (A380 FCOM DSC-31-20-50). The terrain has no such limit.
constexpr float kWxrMaxRangeNm = 320.0f;
#endif
#ifndef A380X
// a320EfisRangeSettings, NavigationDisplay.ts:9,15.
constexpr float kRangeTableNm[6] = {10.0f, 20.0f, 40.0f, 80.0f, 160.0f, 320.0f};
#endif

constexpr int kRangeCount = static_cast<int>(sizeof(kRangeTableNm) / sizeof(kRangeTableNm[0]));
constexpr float kNmToMetres = 1852.0f;

// Screen-space placement constants, matching arc/index.tsx:224,226 and
// RoseNavPage.tsx:148,150 exactly - these are hardcoded pixel constants on
// the JS side too, not derived from any simvar.
constexpr float kScreenCenterX = 384.0f;
constexpr float kArcCenterYBias = 242.0f;
constexpr float kArcPixelRadius = 498.0f;
constexpr float kRoseNavCenterYBias = 0.0f;
constexpr float kRoseNavPixelRadius = 250.0f;

constexpr unsigned kTextureSize = 768;  // matches the largest on-screen size (ARC) closely enough to avoid visible blur

// XMLVAR_A320_WeatherRadar_Mode knob positions (the A380X derives the same values
// from its SURV page buttons, see radarMode). MAP is position 3.
constexpr double kWxrModeWx = 0.0;
constexpr double kWxrModeWxTurb = 1.0;
constexpr double kWxrModeTurb = 2.0;
constexpr double kWxrModeMap = 3.0;
// The mode text the JS ND shows (A32NX_WXR_ND_{L,R}_MODE, WxrModeLabel.tsx): 0 = none, 1 + the knob
// position above (WX, WX+T, TURB, MAP), and 5 = "WXR OFF" while the A32NX radar is switched off.
constexpr int kWxrLabelOff = 5;

// Turbulence proxy: real WXR finds turbulence from Doppler spectral width,
// which MSFS doesn't expose - a rain rate above this (mm/h; a strong convective
// core) stands in for it. It has to sit above the red band's start (see
// kRedFromMmH), otherwise the magenta would cover every red cell. Measured
// in-sim: 30 never triggered (no magenta at all under a thunderstorm), 20 does
// while leaving the red visible around the core. Real Airbus WXR only reports
// turbulence out to ~40 NM, drawn magenta inside precipitation.
constexpr float kTurbulenceRateMmH = 20.0f;
constexpr float kTurbulenceMaxRangeNm = 40.0f;

// Brightness scale applied to every band color (see the header) - lower it if
// the weather still looks washed out, raise it if it looks too dim. Measured
// in-sim at 0.7: greens came out vivid, but amber read pale yellow.
constexpr float kColorGain = 0.85f;

// The MapView texture carries per-texel noise: neighboring texels flip between
// color bands, which reads as grain (a real radar shows solid, consistent
// areas). The band colors are applied by the engine before we get the texture,
// so it can't be denoised at the source; instead every draw is repeated as a
// kSmoothingGrid x kSmoothingGrid set of copies shifted by up to
// +/-kSmoothingSpacingPx (each at 1/taps strength) and summed, i.e. a box blur.
// A grid of 1 turns smoothing off; each extra tap costs another full-image fill
// per ND.
constexpr int kSmoothingGrid = 3;
constexpr float kSmoothingSpacingPx = 2.5f;

// Fraction of the precipitation color that survives underneath fully covered
// turbulence (0 would be a clean wipe; the smoothed erase is a product of taps).
constexpr float kEraseRemainder = 0.05f;

// A partly covered turbulence marker (coverage c = the fraction of taps that see
// the marker) is boosted by this factor before it saturates, so magenta reaches
// full strength - and wipes the precipitation under it - from c = 1/gain
// upward instead of only at c = 1. Near the threshold the marker flips texel by
// texel, and a linear blend of that came out as pale pink instead of magenta.
// Magenta therefore saturates at pure magenta.
constexpr float kTurbulenceGain = 2.0f;

// Weather color bands, by rain rate like the color levels of an airborne weather
// radar (ARINC 708 style): black below 0.7 mm/h, green 0.7-4 mm/h, amber 4-12
// mm/h, red above 12 mm/h. Magenta is reserved for turbulence (see
// kTurbulenceRateMmH), never precipitation. An earlier palette used the
// weatherai.world GROUND radar reflectivity table (red from 50 dBZ, about
// 49 mm/h); MSFS's rain rates never got that high, so red never showed up, not
// even without turbulence. Below the green threshold nothing is drawn (MSFS's
// clear-sky baseline measured <= 0.001 mm/h).
constexpr float kGreenFromMmH = 0.7f;
constexpr float kYellowFromMmH = 4.0f;
constexpr float kRedFromMmH = 12.0f;

// The band colors on the ND (linear, before the paint encoding). Yellow is the
// green channel of the green band plus the red channel of the red band, so green
// and yellow share their green level.
constexpr float kRedLevel = 1.0f * kColorGain;
constexpr float kGreenLevel = 0.85f * kColorGain;

// How the band colors are built (the "precipitation" and the "hot" MapView both
// use color tables that are pure 0/1 masks, so the engine's color handling can't
// distort them):
//   precipitation view: R = rate >= kYellowFromMmH, G = rate >= kGreenFromMmH
//   hot view:           G = rate >= kRedFromMmH, R and B = rate >= kTurbulenceRateMmH
// Each mask is drawn as a kSmoothingGrid x kSmoothingGrid blur whose taps add up
// to kPrecipGain at full coverage, so it saturates once 1/kPrecipGain of the taps
// see the mask; squaring the result kSharpenPasses times then turns the ramp
// below that into a fairly sharp edge (a coverage of 1/3 comes out at ~0.2, 5/9 at
// 1). The hot view's G mask then wipes the green channel of the precipitation
// (yellow -> red), and its R/B masks add magenta.
constexpr float kPrecipGain = 2.0f;
constexpr int kSharpenPasses = 2;

// Upper edge of the last band - effectively unbounded so the strongest cells
// keep the last color instead of dropping out.
constexpr float kTopBandRate = 1000000.0f;

// The area of the ARC page: the compass disk about the aircraft (R = kArcPixelRadius) cut to the
// shape the ND's own map uses (CanvasMap.tsx ARC_CLIP), as on the real display: the picture goes on
// below the aircraft symbol down to the message boxes (between x = 174 and 591), and both bottom
// corners stay free for the VOR/MORA fields on the left (from y = 625, the aircraft's level) and
// the TERR peaks box / radar mode text on the right (from y = 562), with a diagonal in between.
// While the radar's buffer fills (sweepFraction < 1, see drawWeatherRect) it is the sector swept
// so far instead. A circle too small to reach the right corner (the turbulence limit)
// is left round; the rectangular scissor of the caller cuts it at the message boxes.
// The bottom is the top of the TCAS / WXR message box (y = 680 on the map pages,
// TcasWxrMessages.tsx) less a small margin, not the ARC_CLIP polygon's 768: the real
// display's picture stops just above that box.
constexpr float kArcCornerTop = 562.0f;
constexpr float kArcCornerLeft = 648.0f;
constexpr float kArcNotchRightX = 591.0f;
constexpr float kArcNotchRightY = 625.0f;
constexpr float kArcNotchLeftX = 174.0f;
constexpr float kArcNotchLeftY = 683.0f;
constexpr float kArcLeftCornerX = 122.0f;
constexpr float kArcLeftCornerY = 625.0f;
constexpr float kArcClipBottom = 674.0f;
// The engine's radar cone, centred on the heading: the real antenna's azimuth sweep. A32NX: the
// Honeywell RDR-4B sweeps 180 degrees (Avionics International, "Product Focus: Weather Radar",
// 2002). A380X: the Honeywell RDR-4000 scans 160 degrees, +-80 (Honeywell's IntuVue white
// paper; its display covers +-90 from the radar's memory, which the engine does not have, so
// nothing is painted behind the aircraft). The area path and the scissor clip whatever the cone
// paints beyond the display's shape.
#ifdef A380X
constexpr float kRadarConeDegrees = 160.0f;
#else
constexpr float kRadarConeDegrees = 180.0f;
#endif
constexpr float kDegToRadF = 0.01745329f;

// The color list: kTerrainBandCount equal bands of kTerrainBandFeet over
// [kTerrainMinFeet, kTerrainMaxFeet] of (aircraft altitude - terrain height). The range is deliberately
// far wider on the "terrain above the aircraft" side than the 2000 ft the display cares about: terrain
// beyond the range's top is NOT drawn with the first entry (measured in-sim 2026-09-20 with a probe at
// Aspen and in the Alps: mountains 3000+ ft above the aircraft came out in a rainbow of other entries,
// no red at all), whereas terrain beyond the bottom does take the last entry. So the top has to reach
// past any terrain (Everest is 29,000 ft above sea level): the bands above +2000 ft all carry the red
// entry. 128 entries of 250 ft cover -29,500 .. +2,500 ft, band edges on multiples of 250 ft.
constexpr float kTerrainBandFeet = 250.0f;
constexpr int kTerrainBandCount = 128;
constexpr float kTerrainMinFeet = -29500.0f;
constexpr float kTerrainMaxFeet = kTerrainMinFeet + kTerrainBandFeet * static_cast<float>(kTerrainBandCount);

// The two dot styles of the terrain. ORDERED is a regular 4x4 Bayer pattern (14/16, 7/16 and
// 3/16 of the cells lit); the first in-sim version, and liked. RANDOM is white noise like the
// real display, whose dense-red area was measured on a photo of a real A320 ND at about 70%
// lit, in irregular clumps of about one ND pixel cells (medium and light are guesses).
enum class TerrainDotStyle { Ordered, Random };

constexpr TerrainDotStyle kTerrainDotStyle = TerrainDotStyle::Random;
constexpr bool kOrderedDots = kTerrainDotStyle == TerrainDotStyle::Ordered;

// Dot density of the three levels (the fraction of lit cells).
constexpr float kTerrainDense = kOrderedDots ? 14.0f / 16.0f : 0.70f;
constexpr float kTerrainMedium = kOrderedDots ? 7.0f / 16.0f : 0.40f;
constexpr float kTerrainLight = kOrderedDots ? 3.0f / 16.0f : 0.18f;

// The water is blue dots at every altitude (the look of the other addons' TERR ON ND): the dot density, and the
// blue channel's level (the green channel of the water dots is at the radar's green level, which makes cyan).
constexpr float kTerrainWater = 1.0f;
constexpr float kTerrainWaterBlue = 0.6f;

// Size of the dither image in cells, of one cell in ND pixels, and how often the 0/1
// result is squared (2^kTerrainSharpenPasses has to crush the not-lit side to black).
constexpr int kTerrainPatternCells = kOrderedDots ? 4 : 128;
constexpr float kTerrainDotCellPx = 2.0f;
constexpr int kTerrainSharpenPasses = 8;

// Terrain elevation relative to the aircraft (feet) where the levels start; the
// gear position moves the lower ones (Honeywell: 500 ft gear up, 250 ft gear down).
constexpr float kTerrainRedFromFeet = 2000.0f;
constexpr float kTerrainDenseYellowFromFeet = 1000.0f;
constexpr float kTerrainLightGreenFromFeet = -2000.0f;

// "The reference altitude is computed based on the current aircraft altitude or, if descending
// more than 1 000 ft/min, the altitude expected in 30 s" (A320 FCOM DSC-31-45, GPWS terrain
// picture). The view colours by the aircraft's own altitude, so the bands are shifted instead by
// the altitude the aircraft loses in that time (see the ND draw).
constexpr float kTerrainLookAheadFromFpm = 1000.0f;
constexpr float kTerrainLookAheadSeconds = 30.0f;

// Ground mapping, the radar's MAP mode, from the same altitude view: "black indicates water,
// green indicates the ground, and amber indicates cities and mountains" (A320 FCOM
// DSC-34-SURV-30-30, display mode selector; the A380's SURV CONTROLS MODE button has the
// same MAP mode, FCOM: "use MAP to detect prominent terrain (mountain, city, and coastline)").
// Mountains are the terrain within kMapMountainBelowFeet below the aircraft or above it; the
// sim's terrain data has no cities. The list spans [kMapMinFeet, kMapMaxFeet] of (aircraft
// altitude - terrain height) in kTerrainBandCount bands: entry 0 is the water (which no land
// reaches, see kTerrainMinFeet), the last entry, and everything further below, the plain ground.
constexpr float kMapMinFeet = -29500.0f;
constexpr float kMapMaxFeet = 10500.0f;
constexpr float kMapMountainBelowFeet = 6000.0f;

// Water is never coloured by the altitude list: the engine gives it the FIRST entry, the same
// one that terrain far above the aircraft ends up on (dense red in the terrain view: a red
// sea). A second view with a two-entry list and a range far below any real value tells the
// two apart: everything on land is beyond the range and lands on the last entry (black),
// water is on the first (white). The terrain drawn over water is wiped and replaced by
// what sea level really is relative to the aircraft.
constexpr float kWaterMaskMinFeet = -60000.0f;
constexpr float kWaterMaskMaxFeet = -50000.0f;

// ---------------------------------------------------------------------------
// PEAKS mode (EGPWS): when no terrain of the range comes within 2000 ft below the aircraft, the
// standard display would be empty; the real display then shows the terrain in green by its
// elevation relative to the range's highest and lowest terrain (the figures of the TERR peaks
// box): solid green for the top 5 % of that span, dense dots down to 65 %, light dots down to
// 35 %, nothing below. The figures come from the SimBridge (the TERR peaks box LVars written by
// TerrainThresholdsProvider); without them there is no peaks mode. The view's range is set to
// [alt - max - margin, alt - min] every frame, so the list itself is fixed: the bands are
// fractions of the range. The margin above the highest terrain covers the difference between the
// SimBridge's elevations and the sim's own mesh (terrain beyond the range's top would come out
// in other entries, see kTerrainMinFeet).
// ---------------------------------------------------------------------------
constexpr float kPeaksBelowFeet = 2000.0f;    // peaks mode while the highest terrain is further below than this

constexpr float kPeaksMarginFraction = 0.25f;  // of the span, above the highest terrain

constexpr float kPeaksSolidFrom = 0.95f;       // fractions of the span (from the lowest terrain)

constexpr float kPeaksDenseFrom = 0.65f;
constexpr float kPeaksLightFrom = 0.35f;
constexpr float kPeaksMinSpanFeet = 500.0f;

#ifdef A380X
// ---------------------------------------------------------------------------
// Terrain profile on the VD (A380X). Its own gauge instance (the "V" panel.cfg
// parameter), because it needs whole-rect passes (a compare against a ramp, then
// squaring) that would destroy the weather drawn in the same rect by the ND's
// instance; each gauge has its own surface, and both are added onto the display.
//
// The terrain along the vertical cut is read from an altitude-mode MapView whose
// color list codes ELEVATION as brightness (in the R and G channels, see
// setVdTerrainList): over the plot, entry k is I = 2 - (k + 0.5) / kVdTerrainSteps, and
// the view's range is set every frame to [baro altitude - VD upper limit - plot span,
// baro altitude - VD lower limit] (the engine colors by its true altitude MINUS the
// terrain height; see drawVdTerrainGauge for why the baro altitude goes into the
// range), so a texel's brightness is the fraction of the VD plot height that the
// terrain reaches (terrain above the plot, up to one plot height above it, is full
// brightness; the engine colours terrain beyond the top of the range with arbitrary
// entries, see kTerrainMinFeet). The texture column along the cut is stretched over
// the whole plot height (see kVdColumnTexelPx) and compared with a vertical ramp: the
// same "add half the value and half the complement of the threshold, double, square"
// compare as the terrain dots, which lights a pixel where brightness >= ramp, i.e. a
// bar from the bottom up to the terrain. Water always takes the list's first entry
// (see configureWaterMaskView), which no land reaches: it has no R and G, so the
// compare leaves no bar over water. The water itself is drawn from a second view, a
// water mask as the A32NX ND has (white over water), as a flat area up to sea level in
// the same colour as the ND's water: the real VD's water is blue (FCOM DSC-31-20-40-10),
// and the ND's teal is what the crew sees next to it.
//
// The cut follows the real VD's (FCOM DSC-31-20-40-10): the active flight plan in the
// managed lateral modes, published as vertices by EfisTawsBridge.ts (see g_vdCutMode) and
// followed piece by piece from the aircraft's projection onto it, or the aircraft's track
// otherwise. The cut has a width of 2 x the TAWS RNP on the real aircraft (1 NM in the
// take-off and terminal areas, 2 NM en route, less on approach; never more than 10 NM) and
// the profile is the highest terrain across it: here kVdCutTaps columns spread over the
// width are drawn as a union, the width taken from the altitude (en route above
// kVdCutEnrouteFeet). Where the next track change exceeds 3 degrees the rest of the plot
// is greyed (the real VD's grey area).
// ---------------------------------------------------------------------------
constexpr int kVdCutTaps = 5;
constexpr float kVdCutEnrouteFeet = 18000.0f;
constexpr float kVdCutEnrouteHalfWidthNm = 2.0f;
constexpr float kVdCutTerminalHalfWidthNm = 1.0f;

// The aircraft counts as on the flight plan within this cross-track distance of it; further away
// the cut falls back to the track (the real VD's "VIEW ALONG ACFT TRK").
constexpr float kVdCutMaxCrossTrackNm = 5.0f;

// Bands of the colour list over the plot height; the list has twice as many entries (see
// setVdTerrainList), and the view's range spans twice the plot height accordingly.
constexpr int kVdTerrainSteps = 64;
constexpr int kVdTerrainListSize = 2 * kVdTerrainSteps;
constexpr int kVdRampRows = 256;

// The ramp never quite reaches 0, so a texel of no terrain (brightness 0) stays unlit
// in the bottom row too.
constexpr float kVdRampFloor = 1.0f / 64.0f;
constexpr int kVdTerrainSharpenPasses = 8;

// Frames a view is left alone after its settings were changed (the ND's role change, the VD starting to show)
// before it is drawn: it shows what it had before, or an empty texture, until the engine has rendered it again.
constexpr int kRoleWarmupFrames = 60;
constexpr int kVdWarmupFrames = 15;
#endif

constexpr double kSimBridgeStatusPeriodSeconds = 0.1;
constexpr double kSimBridgeConnectRetrySeconds = 5.0;
constexpr double kSimBridgeFiguresMaxAgeSeconds = 5.0;

}  // namespace ndwxr
