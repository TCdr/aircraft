// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Height of one line of the scrolled lists, px */
export const SCROLL_LINE_PX = 26;
/** A click on an arrow moves this many lines */
export const SCROLL_LINES_PER_CLICK = 3;
/** Width of the bar, and height of its arrow buttons, px */
const SCROLL_BAR_PX = 22;
/** Design choice: the thumb never gets smaller than this, so it stays easy to grab on a very long list */
const MIN_THUMB_PX = 24;
/** Time the button must be held before it repeats, then the time between two repeats (about 10 Hz), ms */
const REPEAT_DELAY_MS = 350;
const REPEAT_INTERVAL_MS = 100;

export interface ThumbGeometry {
  readonly visible: boolean;
  readonly thumbHeight: number;
  readonly thumbTop: number;
}

/**
 * @param scrollTop the scrolled distance of the content
 * @param clientHeight the visible height of the pane
 * @param scrollHeight the height of all the content
 * @returns the scrolled distance kept inside the content
 */
function clampScrollTop(scrollTop: number, clientHeight: number, scrollHeight: number): number {
  return Math.max(0, Math.min(scrollTop, Math.max(0, scrollHeight - clientHeight)));
}

/**
 * The thumb of the bar: as long as the visible part of the content, at the place of the scrolled part.
 * @param clientHeight the visible height of the pane
 * @param scrollHeight the height of all the content
 * @param scrollTop the scrolled distance
 * @param trackHeight the height of the track between the two arrows
 * @returns the thumb, not visible when the content fits
 */
export function thumbGeometry(
  clientHeight: number,
  scrollHeight: number,
  scrollTop: number,
  trackHeight: number,
): ThumbGeometry {
  if (scrollHeight <= clientHeight + 1 || trackHeight <= 0) {
    return { visible: false, thumbHeight: 0, thumbTop: 0 };
  }
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(MIN_THUMB_PX, Math.round((trackHeight * clientHeight) / scrollHeight)),
  );
  const range = scrollHeight - clientHeight;
  const scrolled = clampScrollTop(scrollTop, clientHeight, scrollHeight);
  return { visible: true, thumbHeight, thumbTop: Math.round(((trackHeight - thumbHeight) * scrolled) / range) };
}

/**
 * @param thumbTop the place of the dragged thumb in the track
 * @param clientHeight the visible height of the pane
 * @param scrollHeight the height of all the content
 * @param trackHeight the height of the track
 * @returns the scrolled distance that puts the thumb there
 */
export function scrollTopForThumb(
  thumbTop: number,
  clientHeight: number,
  scrollHeight: number,
  trackHeight: number,
): number {
  const free = trackHeight - thumbGeometry(clientHeight, scrollHeight, 0, trackHeight).thumbHeight;
  if (free <= 0) {
    return 0;
  }
  const fraction = Math.max(0, Math.min(thumbTop, free)) / free;
  return clampScrollTop(Math.round(fraction * (scrollHeight - clientHeight)), clientHeight, scrollHeight);
}

/**
 * @param scrollTop the scrolled distance
 * @param direction -1 for up, 1 for down
 * @param clientHeight the visible height of the pane
 * @param scrollHeight the height of all the content
 * @returns the scrolled distance after one click on an arrow
 */
export function stepScrollTop(
  scrollTop: number,
  direction: -1 | 1,
  clientHeight: number,
  scrollHeight: number,
): number {
  return clampScrollTop(scrollTop + direction * SCROLL_LINES_PER_CLICK * SCROLL_LINE_PX, clientHeight, scrollHeight);
}

/**
 * @param scrollTop the scrolled distance
 * @param direction -1 for up, 1 for down
 * @param clientHeight the visible height of the pane
 * @param scrollHeight the height of all the content
 * @returns the scrolled distance after a click on the track: one page, keeping one line in view
 */
export function pageScrollTop(
  scrollTop: number,
  direction: -1 | 1,
  clientHeight: number,
  scrollHeight: number,
): number {
  const page = Math.max(SCROLL_LINE_PX, clientHeight - SCROLL_LINE_PX);
  return clampScrollTop(scrollTop + direction * page, clientHeight, scrollHeight);
}

/**
 * A click-operated vertical scroll bar for a scroll container: an arrow at each end (hold to repeat), a track that
 * pages, and a thumb to drag. The cockpit screen sends clicks and mouse moves only, no wheel and no native scroll bars,
 * so scrollTop written by this bar is the only way to scroll. Only mouse events on the bar and on the document are
 * used, as the sim browser has no Pointer Events to rely on.
 */
export class ScrollBar {
  public readonly element: HTMLDivElement;

  private readonly track: HTMLDivElement;
  private readonly thumb: HTMLDivElement;
  private readonly savedPaddingRight: string;
  private repeatTimer: number | null = null;
  private dragStartY = 0;
  private dragStartThumbTop = 0;
  private dragging = false;
  private shown = false;

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (this.dragging) {
      this.container.scrollTop = scrollTopForThumb(
        this.dragStartThumbTop + event.clientY - this.dragStartY,
        this.container.clientHeight,
        this.container.scrollHeight,
        this.trackHeight(),
      );
      this.refresh();
    }
  };

  private readonly onMouseUp = (): void => {
    this.dragging = false;
    this.stopRepeat();
  };

  private readonly onScroll = (): void => this.refresh();

  /** @param container the element whose scrollTop the bar drives; it must have a definite height */
  constructor(public readonly container: HTMLElement) {
    this.savedPaddingRight = container.style.paddingRight;
    container.style.overflowY = 'hidden';
    const parent = container.parentElement as HTMLElement;
    if (window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
    this.element = document.createElement('div');
    this.element.className = 'oit-scroll-bar';
    this.element.style.display = 'none';
    this.element.appendChild(this.arrowButton('up', -1));
    this.track = document.createElement('div');
    this.track.className = 'oit-scroll-track';
    this.thumb = document.createElement('div');
    this.thumb.className = 'oit-scroll-thumb';
    this.track.appendChild(this.thumb);
    this.element.appendChild(this.track);
    this.element.appendChild(this.arrowButton('down', 1));
    parent.appendChild(this.element);

    this.track.addEventListener('mousedown', (event) => this.onTrackMouseDown(event));
    this.thumb.addEventListener('mousedown', (event) => {
      event.stopPropagation();
      this.dragging = true;
      this.dragStartY = event.clientY;
      this.dragStartThumbTop = this.thumb.offsetTop;
    });
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    container.addEventListener('scroll', this.onScroll);
    this.refresh();
  }

  private arrowButton(kind: 'up' | 'down', direction: -1 | 1): HTMLDivElement {
    const button = document.createElement('div');
    button.className = `oit-scroll-arrow ${kind}`;
    button.addEventListener('mousedown', () => {
      this.step(direction);
      this.stopRepeat();
      this.repeatTimer = window.setTimeout(() => {
        this.repeatTimer = window.setInterval(() => this.step(direction), REPEAT_INTERVAL_MS);
      }, REPEAT_DELAY_MS);
    });
    return button;
  }

  private stopRepeat(): void {
    if (this.repeatTimer !== null) {
      window.clearTimeout(this.repeatTimer);
      window.clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  private step(direction: -1 | 1): void {
    this.container.scrollTop = stepScrollTop(
      this.container.scrollTop,
      direction,
      this.container.clientHeight,
      this.container.scrollHeight,
    );
    this.refresh();
  }

  private onTrackMouseDown(event: MouseEvent): void {
    const direction = event.clientY < this.thumb.getBoundingClientRect().top ? -1 : 1;
    this.container.scrollTop = pageScrollTop(
      this.container.scrollTop,
      direction,
      this.container.clientHeight,
      this.container.scrollHeight,
    );
    this.refresh();
  }

  private trackHeight(): number {
    return Math.max(0, this.container.offsetHeight - 2 * SCROLL_BAR_PX);
  }

  /** Measures the content again: the owner calls it after the content changed, a light poll does as well */
  public refresh(): void {
    const container = this.container;
    const geometry = thumbGeometry(
      container.clientHeight,
      container.scrollHeight,
      container.scrollTop,
      this.trackHeight(),
    );
    if (geometry.visible !== this.shown) {
      this.shown = geometry.visible;
      this.element.style.display = geometry.visible ? 'flex' : 'none';
      // The content keeps clear of the bar
      container.style.paddingRight = geometry.visible ? `${SCROLL_BAR_PX + 4}px` : this.savedPaddingRight;
    }
    if (!geometry.visible) {
      return;
    }
    this.element.style.top = `${container.offsetTop}px`;
    this.element.style.left = `${container.offsetLeft + container.offsetWidth - SCROLL_BAR_PX}px`;
    this.element.style.height = `${container.offsetHeight}px`;
    this.thumb.style.top = `${geometry.thumbTop}px`;
    this.thumb.style.height = `${geometry.thumbHeight}px`;
  }

  public destroy(): void {
    this.stopRepeat();
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.container.removeEventListener('scroll', this.onScroll);
    this.container.style.paddingRight = this.savedPaddingRight;
    if (this.element.parentElement !== null) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
