// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { NavLogMenuItem } from './OitNavLogPanel';

/**
 * The menu that opens at the arrow after a waypoint of the NAV LOG. It sits on the page, not in the scrolled document
 * window, so a row at the bottom of the window does not cut it off.
 */
export class NavLogRowMenu {
  private readonly element: HTMLDivElement;
  private listenTimer: number | null = null;

  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!this.element.contains(event.target as Node)) {
      this.close();
    }
  };

  /** @param host the element of the page the menu is placed in; it is positioned relative to it */
  constructor(private readonly host: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'oit-eff-row-menu';
    this.element.style.display = 'none';
    host.appendChild(this.element);
  }

  /**
   * @param anchor the arrow that was clicked
   * @param items the lines of the menu
   */
  public open(anchor: HTMLElement, items: readonly NavLogMenuItem[]): void {
    this.close();
    for (const item of items) {
      const line = document.createElement('div');
      line.className = `mfd-dropdown-menu-element${item.disabled ? ' disabled' : ''}`;
      line.textContent = item.label;
      line.addEventListener('click', () => {
        if (!item.disabled) {
          this.close();
          item.action();
        }
      });
      this.element.appendChild(line);
    }
    const hostRect = this.host.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    this.element.style.display = 'block';
    this.element.style.left = `${Math.round(anchorRect.left - hostRect.left)}px`;
    // Below the waypoint, or above it when the menu would leave the page
    const below = anchorRect.bottom - hostRect.top;
    const opensUpwards = below + this.element.offsetHeight > this.host.clientHeight;
    this.element.style.top = `${Math.round(opensUpwards ? anchorRect.top - hostRect.top - this.element.offsetHeight : below)}px`;
    // The click that opened the menu must not close it again
    this.listenTimer = window.setTimeout(() => document.addEventListener('click', this.onDocumentClick), 0);
  }

  public close(): void {
    if (this.listenTimer !== null) {
      window.clearTimeout(this.listenTimer);
      this.listenTimer = null;
    }
    document.removeEventListener('click', this.onDocumentClick);
    this.element.style.display = 'none';
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }
  }

  public destroy(): void {
    this.close();
    if (this.element.parentElement !== null) {
      this.element.parentElement.removeChild(this.element);
    }
  }
}
