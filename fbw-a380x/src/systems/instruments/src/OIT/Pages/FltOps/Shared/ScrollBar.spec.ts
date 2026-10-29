// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import {
  pageScrollTop,
  SCROLL_LINE_PX,
  SCROLL_LINES_PER_CLICK,
  ScrollBar,
  scrollTopForThumb,
  stepScrollTop,
  thumbGeometry,
} from './ScrollBar';

describe('scroll bar maths', () => {
  it('hides the thumb when the content fits', () => {
    expect(thumbGeometry(500, 500, 0, 400).visible).toBe(false);
    expect(thumbGeometry(500, 400, 0, 400).visible).toBe(false);
  });

  it('sizes the thumb by the visible part and places it by the scrolled part', () => {
    expect(thumbGeometry(500, 1000, 0, 400)).toEqual({ visible: true, thumbHeight: 200, thumbTop: 0 });
    expect(thumbGeometry(500, 1000, 500, 400).thumbTop).toBe(200);
    expect(thumbGeometry(500, 1000, 250, 400).thumbTop).toBe(100);
    // a very long list keeps a thumb that can be grabbed
    expect(thumbGeometry(500, 100000, 0, 400).thumbHeight).toBe(24);
  });

  it('steps three lines and stops at both ends', () => {
    const step = SCROLL_LINES_PER_CLICK * SCROLL_LINE_PX;
    expect(stepScrollTop(0, 1, 500, 1000)).toBe(step);
    expect(stepScrollTop(10, -1, 500, 1000)).toBe(0);
    expect(stepScrollTop(490, 1, 500, 1000)).toBe(500);
  });

  it('pages by the visible height minus one line', () => {
    expect(pageScrollTop(0, 1, 500, 2000)).toBe(500 - SCROLL_LINE_PX);
    expect(pageScrollTop(100, -1, 500, 2000)).toBe(0);
  });

  it('turns a dragged thumb back into a scrolled distance', () => {
    expect(scrollTopForThumb(0, 500, 1000, 400)).toBe(0);
    expect(scrollTopForThumb(200, 500, 1000, 400)).toBe(500);
    expect(scrollTopForThumb(100, 500, 1000, 400)).toBe(250);
    expect(scrollTopForThumb(9999, 500, 1000, 400)).toBe(500);
  });
});

describe('ScrollBar element', () => {
  /** @returns a scroll container with a measured height and its bar */
  function build(): { container: HTMLElement; bar: ScrollBar } {
    const parent = document.createElement('div');
    const container = document.createElement('div');
    parent.appendChild(container);
    document.body.appendChild(parent);
    // jsdom has no layout: the measures are given
    Object.defineProperty(container, 'clientHeight', { value: 300 });
    Object.defineProperty(container, 'offsetHeight', { value: 300 });
    Object.defineProperty(container, 'scrollHeight', { value: 1000 });
    return { container, bar: new ScrollBar(container) };
  }

  it('raises scrollTop when the down arrow is clicked, and lowers it with the up arrow', () => {
    const { container, bar } = build();
    const down = bar.element.querySelector('.oit-scroll-arrow.down') as HTMLElement;
    const up = bar.element.querySelector('.oit-scroll-arrow.up') as HTMLElement;
    down.dispatchEvent(new MouseEvent('mousedown'));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(container.scrollTop).toBe(SCROLL_LINES_PER_CLICK * SCROLL_LINE_PX);
    up.dispatchEvent(new MouseEvent('mousedown'));
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(container.scrollTop).toBe(0);
    bar.destroy();
  });

  it('shows itself only while the content is longer than the pane', () => {
    const { bar } = build();
    expect(bar.element.style.display).toBe('flex');
    bar.destroy();
  });
});
