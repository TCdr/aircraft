// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-env node */

'use strict';

// Flattens a nested translation object to "Section.Key": "text".
function flatten(tree, prefix = [], out = {}) {
  Object.keys(tree).forEach((key) => {
    const value = tree[key];
    if (value !== null && typeof value === 'object') flatten(value, [...prefix, key], out);
    else out[[...prefix, key].join('.')] = value;
  });
  return out;
}

// Rebuilds the nested object, keys in the order of `keyOrder` (keys absent from `flatValues` are skipped).
function nest(flatValues, keyOrder) {
  const root = {};
  keyOrder.forEach((key) => {
    if (!(key in flatValues)) return;
    const parts = key.split('.');
    let node = root;
    parts.slice(0, -1).forEach((part) => {
      node[part] = node[part] || {};
      node = node[part];
    });
    node[parts[parts.length - 1]] = flatValues[key];
  });
  return root;
}

/**
 * Localazy only knows the keys of the upstream flyPad. Keys this fork adds to en.json have their
 * translations only in the local language files, so a download must not drop them: a downloaded
 * text wins, a key Localazy does not know keeps the local text, and keys no longer in en.json are
 * dropped. The result follows en.json's key order.
 * @param english nested en.json
 * @param downloaded nested language file from Localazy
 * @param local nested language file currently in the repo
 */
function mergeTranslations(english, downloaded, local) {
  const englishKeys = Object.keys(flatten(english));
  const remote = flatten(downloaded);
  const current = flatten(local);
  const merged = {};
  englishKeys.forEach((key) => {
    if (key in remote) merged[key] = remote[key];
    else if (key in current) merged[key] = current[key];
  });
  return nest(merged, englishKeys);
}

module.exports = { flatten, mergeTranslations };
