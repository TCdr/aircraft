// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * What part of a chart page the viewer shows. The cockpit screen sends clicks only, so the crew zooms and pans with
 * buttons and centres the chart with a click: there is no wheel and no drag. All maths here are plain numbers.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Design choice: the zoom steps, as multiples of the size at which the whole page fits the viewer */
export const ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3, 4];

/** A pan button moves the chart by this part of the viewer */
const PAN_STEP_FRACTION = 0.25;

export type PanDirection = 'left' | 'right' | 'up' | 'down';

/** The view: a zoom step and the point of the page at the middle of the viewer, as a fraction of the page */
export interface ChartViewState {
  readonly zoomIndex: number;
  readonly centreX: number;
  readonly centreY: number;
}

/** The whole page in the viewer: where a page opens, and what FIT returns to */
export const FIT_VIEW: ChartViewState = { zoomIndex: 0, centreX: 0.5, centreY: 0.5 };

/** Where the page lies in the viewer, in px of the viewer */
export interface ChartViewLayout {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * @param page the page
 * @param viewer the viewer
 * @returns the size at which the whole page fits the viewer, keeping its proportions
 */
export function fitSize(page: Size, viewer: Size): Size {
  if (page.width <= 0 || page.height <= 0 || viewer.width <= 0 || viewer.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(viewer.width / page.width, viewer.height / page.height);
  return { width: page.width * scale, height: page.height * scale };
}

/**
 * @param centre the wanted centre along one axis, as a fraction of the page
 * @param viewerLength the length of the viewer along the axis
 * @param pageLength the length of the zoomed page along the axis
 * @returns the centre kept so that the viewer shows no empty space beside the page; a page smaller than the viewer is
 * centred
 */
function clampCentre(centre: number, viewerLength: number, pageLength: number): number {
  if (pageLength <= viewerLength) {
    return 0.5;
  }
  const margin = viewerLength / 2 / pageLength;
  return Math.max(margin, Math.min(1 - margin, centre));
}

/**
 * @param state a view
 * @param page the page
 * @param viewer the viewer
 * @returns the size of the zoomed page
 */
function zoomedSize(state: ChartViewState, page: Size, viewer: Size): Size {
  const fit = fitSize(page, viewer);
  const zoom = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, state.zoomIndex))];
  return { width: fit.width * zoom, height: fit.height * zoom };
}

/**
 * @param state a view
 * @param page the page
 * @param viewer the viewer
 * @returns the view with its centre inside the page
 */
export function clampView(state: ChartViewState, page: Size, viewer: Size): ChartViewState {
  const zoomIndex = Math.max(0, Math.min(ZOOM_STEPS.length - 1, state.zoomIndex));
  const size = zoomedSize(state, page, viewer);
  return {
    zoomIndex,
    centreX: clampCentre(state.centreX, viewer.width, size.width),
    centreY: clampCentre(state.centreY, viewer.height, size.height),
  };
}

/**
 * @param state a view
 * @param page the page
 * @param viewer the viewer
 * @returns where the page lies in the viewer
 */
export function viewLayout(state: ChartViewState, page: Size, viewer: Size): ChartViewLayout {
  const view = clampView(state, page, viewer);
  const size = zoomedSize(view, page, viewer);
  return {
    left: viewer.width / 2 - view.centreX * size.width,
    top: viewer.height / 2 - view.centreY * size.height,
    width: size.width,
    height: size.height,
  };
}

/**
 * @param state a view
 * @param step 1 for ZOOM +, -1 for ZOOM -
 * @param page the page
 * @param viewer the viewer
 * @returns the view one zoom step further or back, at the same centre
 */
export function zoomView(state: ChartViewState, step: 1 | -1, page: Size, viewer: Size): ChartViewState {
  return clampView({ ...state, zoomIndex: state.zoomIndex + step }, page, viewer);
}

/**
 * @param state a view
 * @param direction the direction the chart moves to be seen: left shows what lies left of the view
 * @param page the page
 * @param viewer the viewer
 * @returns the view moved by a quarter of the viewer, stopped at the edge of the page
 */
export function panView(state: ChartViewState, direction: PanDirection, page: Size, viewer: Size): ChartViewState {
  const size = zoomedSize(state, page, viewer);
  if (size.width <= 0 || size.height <= 0) {
    return state;
  }
  const dx = (viewer.width * PAN_STEP_FRACTION) / size.width;
  const dy = (viewer.height * PAN_STEP_FRACTION) / size.height;
  const moved: ChartViewState = {
    ...state,
    centreX: state.centreX + (direction === 'left' ? -dx : direction === 'right' ? dx : 0),
    centreY: state.centreY + (direction === 'up' ? -dy : direction === 'down' ? dy : 0),
  };
  return clampView(moved, page, viewer);
}

/**
 * @param state a view
 * @param x the clicked place, px from the left edge of the viewer
 * @param y the clicked place, px from the top edge of the viewer
 * @param page the page
 * @param viewer the viewer
 * @returns the view centred on the clicked point of the page, as far as the edge of the page allows
 */
export function centreView(state: ChartViewState, x: number, y: number, page: Size, viewer: Size): ChartViewState {
  const layout = viewLayout(state, page, viewer);
  if (layout.width <= 0 || layout.height <= 0) {
    return state;
  }
  return clampView(
    { ...state, centreX: (x - layout.left) / layout.width, centreY: (y - layout.top) / layout.height },
    page,
    viewer,
  );
}
