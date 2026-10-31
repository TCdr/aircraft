// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ReactElement } from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';

/*
 * The React instrument framework (Common/defaults) looks its mount point up when it is first imported: spec files must
 * import this module before any SD page or element, so that the mount exists by then.
 */
const frameworkRoot = document.createElement('div');
const frameworkMount = document.createElement('div');
frameworkMount.id = 'MSFS_REACT_MOUNT';
frameworkRoot.appendChild(frameworkMount);
document.body.appendChild(frameworkRoot);

type SimVarValues = Record<string, number | string>;

export interface RenderedSdElement {
  container: SVGSVGElement;
  /** Call from a finally block: restores the SimVar functions and unmounts the element. */
  dispose(): void;
}

/**
 * Renders an SD page element (hooks of the React SD pages read through SimVar.GetSimVarValue) in jsdom, with the given
 * SimVar values; every SimVar that is not listed reads 0.
 * @param element the element to render
 * @param simVars SimVar name (as in the useSimVar call, with its L: prefix) to value
 * @returns the container holding the rendered SVG/HTML and the function that undoes the stubbing
 */
export function renderSdElement(element: ReactElement, simVars: SimVarValues = {}): RenderedSdElement {
  const original = {
    getSimVarValue: SimVar.GetSimVarValue,
    getGlobalVarValue: SimVar.GetGlobalVarValue,
  };
  SimVar.GetSimVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetSimVarValue;
  SimVar.GetGlobalVarValue = ((name: string) => simVars[name] ?? 0) as unknown as typeof SimVar.GetGlobalVarValue;
  // SVG namespace, as in the instrument: React then creates the g/text/path elements as SVG elements
  const container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  act(() => {
    ReactDOM.render(element, container);
  });
  return {
    container,
    dispose: () => {
      ReactDOM.unmountComponentAtNode(container);
      SimVar.GetSimVarValue = original.getSimVarValue;
      SimVar.GetGlobalVarValue = original.getGlobalVarValue;
    },
  };
}

/**
 * @param simVars SimVar values as for renderSdElement
 * @param element the element to render
 * @param inspect reads what it needs out of the rendered container
 * @returns whatever inspect returns, after the element is unmounted and the stubs removed
 */
export function withRenderedSdElement<T>(
  element: ReactElement,
  simVars: SimVarValues,
  inspect: (container: SVGSVGElement) => T,
): T {
  const rendered = renderSdElement(element, simVars);
  try {
    return inspect(rendered.container);
  } finally {
    rendered.dispose();
  }
}

/**
 * Sends the instrument update event that useUpdate hooks listen to, as the instrument framework does every frame.
 * @param deltaTime the frame time in milliseconds
 */
export function sendInstrumentUpdate(deltaTime = 0): void {
  act(() => {
    frameworkRoot.dispatchEvent(new CustomEvent('update', { detail: deltaTime }));
  });
}
