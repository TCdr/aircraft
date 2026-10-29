// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ScrollBar } from './ScrollBar';

/**
 * Design choice: the OIT screen is a fixed 1333 x 1000 and the page area ends above the switching bar, at this y. The
 * browser of the sim does not shrink flex items below their content the way a modern browser does, so a page given
 * only a flex height grows past the screen when a list is long. The panes get explicit pixel heights from this limit.
 */
const PAGE_BOTTOM_PX = 938;

/** How a pane gets its explicit height */
export type PaneHeightRule =
  /** down to the bottom of the page area */
  | 'to-page-bottom'
  /** what the parent has left after its other children (the parent stacks its children in a column) */
  | 'fill'
  /** the height of the parent (the pane sits beside its siblings, or alone) */
  | 'same';

export interface PaneRule {
  readonly selector: string;
  readonly rule: PaneHeightRule;
}

/**
 * @param element an element
 * @param selector a CSS selector
 * @returns whether the element matches the selector
 */
function matches(element: Element, selector: string): boolean {
  const e = element as Element & { webkitMatchesSelector?: (s: string) => boolean };
  return (e.matches ?? e.webkitMatchesSelector).call(element, selector);
}

/**
 * @param root the root of the search, which is itself a candidate
 * @param selector a CSS selector
 * @returns the root and its descendants that match
 */
function findAll(root: HTMLElement, selector: string): HTMLElement[] {
  const found = Array.prototype.slice.call(root.querySelectorAll(selector)) as HTMLElement[];
  return matches(root, selector) ? [root].concat(found) : found;
}

/**
 * @param value a CSS length such as 12px
 * @returns the number of px, 0 for none
 */
function px(value: string): number {
  const n = parseFloat(value);
  return isNaN(n) ? 0 : n;
}

/**
 * @param element an element
 * @returns its top and bottom margins together, px
 */
function verticalMargins(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  return px(style.marginTop) + px(style.marginBottom);
}

/**
 * @param parent a pane with an explicit height
 * @returns the height inside its padding
 */
function innerHeight(parent: HTMLElement): number {
  const style = window.getComputedStyle(parent);
  return parent.clientHeight - px(style.paddingTop) - px(style.paddingBottom);
}

/**
 * @param element a pane
 * @param rule how it gets its height
 * @returns the height in px, null when the pane is not shown
 */
function paneHeight(element: HTMLElement, rule: PaneHeightRule): number | null {
  const parent = element.parentElement;
  if (parent === null || window.getComputedStyle(element).display === 'none') {
    return null;
  }
  if (rule === 'to-page-bottom') {
    return Math.max(0, PAGE_BOTTOM_PX - element.getBoundingClientRect().top);
  }
  if (rule === 'same') {
    return Math.max(0, innerHeight(parent) - verticalMargins(element));
  }
  let used = verticalMargins(element);
  const children = parent.children;
  for (let i = 0; i < children.length; i++) {
    const sibling = children[i] as HTMLElement;
    const style = window.getComputedStyle(sibling);
    if (sibling !== element && style.display !== 'none' && style.position !== 'absolute') {
      used += sibling.offsetHeight + verticalMargins(sibling);
    }
  }
  return Math.max(0, innerHeight(parent) - used);
}

const POLL_MS = 250;

/**
 * Gives the panes of an OIT page explicit heights, top down, and a click-operated scroll bar to the panes that scroll.
 * It runs once at start and then lightly polls, so a pane that the page rebuilds (a tab, a list) is handled too.
 */
export class PaneScope {
  private readonly bars: ScrollBar[] = [];
  private readonly timer: number;

  /**
   * @param root the root element of the page
   * @param rules the panes that need an explicit height, outermost first
   * @param scrollers selectors of the panes that scroll
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly rules: readonly PaneRule[],
    private readonly scrollers: readonly string[],
  ) {
    this.timer = window.setInterval(() => this.update(), POLL_MS);
    this.update();
  }

  /** Lays the panes out and measures the scroll bars again: the page calls it after it rebuilt its content */
  public update(): void {
    for (const { selector, rule } of this.rules) {
      for (const element of findAll(this.root, selector)) {
        const height = paneHeight(element, rule);
        if (height !== null) {
          element.style.height = `${height}px`;
          // The pane keeps its flex width, but never shrinks below the explicit height
          element.style.flexShrink = '0';
          element.style.minHeight = '0px';
          if (rule === 'to-page-bottom') {
            element.style.overflow = 'hidden';
          }
        }
      }
    }
    for (let i = this.bars.length - 1; i >= 0; i--) {
      if (!document.body.contains(this.bars[i].container)) {
        this.bars[i].destroy();
        this.bars.splice(i, 1);
      }
    }
    for (const selector of this.scrollers) {
      for (const element of findAll(this.root, selector)) {
        if (!this.bars.some((bar) => bar.container === element) && element.parentElement !== null) {
          this.bars.push(new ScrollBar(element));
        }
      }
    }
    this.bars.forEach((bar) => bar.refresh());
  }

  public destroy(): void {
    window.clearInterval(this.timer);
    this.bars.forEach((bar) => bar.destroy());
    this.bars.length = 0;
  }
}
