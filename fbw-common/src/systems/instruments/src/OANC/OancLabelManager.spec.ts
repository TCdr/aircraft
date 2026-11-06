// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FeatureType } from '@flybywiresim/fbw-sdk';
import { Subject } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { Label, LabelStyle } from './Oanc';
import { OancLabelFilter } from './OancLabelFilter';
import { OancLabelManager } from './OancLabelManager';

const STYLE_PROPERTIES = ['left', 'top', 'transform', 'visibility'];

/** An element whose style records every write */
function createElement() {
  const values: Record<string, string> = {};
  const writes: string[] = [];
  const style = {};
  for (const property of STYLE_PROPERTIES) {
    Object.defineProperty(style, property, {
      get: () => values[property],
      set: (value: string) => {
        values[property] = value;
        writes.push(property);
      },
    });
  }
  const classList = { add: () => undefined, remove: () => undefined };
  return { element: { style, classList, remove: () => undefined } as unknown as HTMLDivElement, values, writes };
}

function createLabel(text: string, position: [number, number], style = LabelStyle.Taxiway): Label {
  return { text, style, position, rotation: undefined, associatedFeature: undefined } as unknown as Label;
}

/** The fields of the Oanc that the label manager reads */
function createFakeOanc() {
  const container = createElement();
  return {
    container,
    doneDrawing: true,
    referenceOffset: [10, 20] as number[],
    arpReferencedMapParams: { coordinatesToXYy: (): number[] => [] },
    referencePos: { lat: 0, long: 0 },
    interpolatedMapHeading: Subject.create(0),
    zoomLevelIndex: Subject.create(2),
    panOffsetX: Subject.create(0),
    panOffsetY: Subject.create(0),
    modeAnimationOffsetX: Subject.create(0),
    modeAnimationOffsetY: Subject.create(0),
    labelContainerRef: { instance: container.element },
    scale: 1,
    getZoomLevelInverseScale() {
      return this.scale;
    },
    /** Depends on the pan, heading and scale like the real projection does */
    projectPoint(point: number[]) {
      const shear = this.interpolatedMapHeading.get() * 0.01;
      return [point[0] * this.scale + this.panOffsetX.get() + 300, point[1] * this.scale + point[0] * shear + 300];
    },
  };
}

type FakeOanc = ReturnType<typeof createFakeOanc>;

function createManager(oanc: FakeOanc) {
  oanc.arpReferencedMapParams.coordinatesToXYy = () => [...oanc.referenceOffset];
  const manager = new OancLabelManager(oanc as never);
  manager.showLabels = true;
  return manager;
}

function addLabel(manager: OancLabelManager<number>, label: Label) {
  const created = createElement();
  manager.visibleLabels.insert(label);
  manager.visibleLabelElements.set(label, created.element);
  return created;
}

function totalWrites(...elements: { writes: string[] }[]) {
  return elements.reduce((sum, it) => sum + it.writes.length, 0);
}

/** What an ungated reflow writes for the same state: a fresh manager has nothing remembered */
function freshValues(oanc: FakeOanc, labels: Label[], filter: OancLabelFilter, ...runways: (string | undefined)[]) {
  const manager = createManager(oanc);
  manager.currentFilter = filter;
  const elements = labels.map((label) => addLabel(manager, label));
  manager.reflowLabels(...runways);
  return elements.map((it) => ({ ...it.values }));
}

describe('OancLabelManager reflow', () => {
  function setup() {
    const oanc = createFakeOanc();
    const manager = createManager(oanc);
    const first = addLabel(manager, createLabel('A', [30, 40]));
    const second = addLabel(manager, createLabel('B', [-100, 250]));
    manager.reflowLabels();
    return { oanc, manager, first, second };
  }

  it('writes the labels on the first reflow', () => {
    const { first, second } = setup();

    expect(first.values.left).toBeDefined();
    expect(second.values.transform).toBe('translate(-50%, -50%)');
  });

  it('writes no style when nothing changed', () => {
    const { manager, first, second } = setup();
    const writesBefore = totalWrites(first, second);

    manager.reflowLabels();
    manager.reflowLabels();

    expect(totalWrites(first, second)).toBe(writesBefore);
  });

  const changes: [string, (oanc: FakeOanc) => void][] = [
    ['heading', (oanc) => oanc.interpolatedMapHeading.set(33)],
    ['zoom scale', (oanc) => (oanc.scale = 0.5)],
    ['pan x', (oanc) => oanc.panOffsetX.set(15)],
    ['pan y', (oanc) => oanc.panOffsetY.set(-15)],
    ['mode animation offset', (oanc) => oanc.modeAnimationOffsetY.set(120)],
    ['reference position', (oanc) => (oanc.referenceOffset = [55, 66])],
  ];

  for (const [name, change] of changes) {
    it(`writes again, like an ungated reflow, when the ${name} changes`, () => {
      const { oanc, manager, first, second } = setup();
      const writesBefore = totalWrites(first, second);

      change(oanc);
      manager.reflowLabels();

      expect(totalWrites(first, second)).toBeGreaterThan(writesBefore);
      expect([first.values, second.values]).toEqual(
        freshValues(oanc, [...manager.visibleLabels.getArray()], manager.currentFilter),
      );
    });
  }

  it('writes again when the filter changes', () => {
    const { oanc, manager, first, second } = setup();
    const labels = [...manager.visibleLabels.getArray()];

    manager.currentFilter = { type: 'none' };
    manager.reflowLabels();

    expect(first.values.visibility).toBe('hidden');
    expect([first.values.visibility, second.values.visibility]).toEqual(
      freshValues(oanc, labels, { type: 'none' }).map((it) => it.visibility),
    );
  });

  it('writes again when the selected runway changes', () => {
    const { oanc, manager } = setup();
    const arrowLabel = createLabel('27R', [1, 1], LabelStyle.BtvSelectedRunwayArrow);
    const arrow = addLabel(manager, arrowLabel);
    manager.reflowLabels();
    expect(arrow.values.visibility).toBe('hidden');

    manager.reflowLabels(undefined, undefined, 'KLAX27R');

    expect(arrow.values.visibility).toBe('inherit');
    expect(arrow.values.transform).toBe(
      freshValues(oanc, [arrowLabel], manager.currentFilter, undefined, undefined, 'KLAX27R')[0].transform,
    );
  });

  it('writes a label that was added', () => {
    const { manager } = setup();

    const added = addLabel(manager, createLabel('D', [70, 80]));
    manager.reflowLabels();

    expect(added.values.left).toBeDefined();
  });

  it('writes again when a label style changes', () => {
    const { manager } = setup();
    const exit = {
      ...createLabel('X', [1, 1], LabelStyle.ExitLine),
      associatedFeature: { properties: { feattype: FeatureType.RunwayExitLine } },
    } as unknown as Label;
    const exitElement = addLabel(manager, exit);
    manager.reflowLabels(undefined, undefined, undefined, 'X');
    expect(exitElement.values.visibility).toBe('hidden');

    manager.updateLabelClasses({} as never, false, false, undefined, 'X');
    manager.reflowLabels(undefined, undefined, undefined, 'X');

    expect(exitElement.values.visibility).toBe('inherit');
  });

  describe('runway axis label', () => {
    function setupAxis() {
      const oanc = createFakeOanc();
      const manager = createManager(oanc);
      const axisLabel = {
        ...createLabel('09L', [0, 0], LabelStyle.RunwayAxis),
        associatedFeature: {
          properties: {},
          geometry: {
            coordinates: [
              [0, 0],
              [200, 150],
            ],
          },
        },
      } as unknown as Label;
      const axis = addLabel(manager, axisLabel);
      manager.reflowLabels();
      return { oanc, manager, axis, axisLabel };
    }

    it('is placed and rotated along the projected runway', () => {
      const { axis } = setupAxis();

      expect(axis.values.left).toBeDefined();
      expect(axis.values.transform).toContain('rotate(');
    });

    it('writes nothing when the inputs are unchanged', () => {
      const { manager, axis } = setupAxis();
      const writesBefore = axis.writes.length;

      manager.reflowLabels();

      expect(axis.writes.length).toBe(writesBefore);
    });

    it('writes again, like an ungated reflow, when the heading changes', () => {
      const { oanc, manager, axis, axisLabel } = setupAxis();
      const writesBefore = axis.writes.length;

      oanc.interpolatedMapHeading.set(40);
      manager.reflowLabels();

      expect(axis.writes.length).toBeGreaterThan(writesBefore);
      expect(axis.values).toEqual(freshValues(oanc, [axisLabel], manager.currentFilter)[0]);
    });
  });

  it('hides the container, then shows it again, when the labels are switched off and on', () => {
    const { oanc, manager } = setup();
    expect(oanc.container.values.visibility).toBe('inherit');

    manager.showLabels = false;
    manager.reflowLabels();
    expect(oanc.container.values.visibility).toBe('hidden');

    manager.showLabels = true;
    manager.reflowLabels();
    expect(oanc.container.values.visibility).toBe('inherit');
  });

  it('reflows after the labels were cleared and new ones added', () => {
    const { manager } = setup();
    manager.clearLabels();

    const added = addLabel(manager, createLabel('E', [9, 9]));
    manager.reflowLabels();

    expect(added.values.left).toBeDefined();
  });
});
