// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

'use strict';

const fallbacks = [
  'NotoSansJP',
  'NotoSansSC',
  'NotoSansKR',
  'NotoSansArabic',
  'NotoSansThai',
  'NotoSansHebrew',
  'NotoSansDevanagari',
];

module.exports = {
  mode: 'jit',
  content: [
    // THOSE PATHS ARE RELATIVE TO fbw-a32nx/ AT THE MOMENT. This should be fixed at some point in the future
    './**/*.{jsx,tsx}',
    '../fbw-common/src/systems/instruments/src/EFB/**/*.{jsx,tsx}',
  ],
  theme: {
    extend: {
      width: () => ({
        'inr-tk': '13.45rem',
        'out-tk': '5.25rem',
      }),
      height: () => ({
        'content-section-reduced': '54rem',
        'content-section-full': '57.25rem',
      }),
      inset: () => ({
        'ctr-tk-y': '18.75rem',
        'inn-tk-y': '14.5rem',
        'inn-tk-l': '31.5rem',
        'inn-tk-r': '24.75rem',
        'out-tk-y': '12.75rem',
        'out-tk-l': '26.25rem',
        'out-tk-r': '19.5rem',
        'overlay-b-y': '10.25rem',
        'overlay-bl': '22.5rem',
        'overlay-br': '15.5rem',
        'overlay-t-y': '18rem',
        'overlay-tl': '21rem',
        'overlay-tr': '14rem',
      }),
      rotate: () => ({
        '18.5': '18.5deg',
        '-18.5': '-18.5deg',
        '26.5': '26.5deg',
        '-26.5': '-26.5deg',
      }),
      colors: () => ({
        'theme-highlight': 'var(--color-highlight)',
        'theme-body': 'var(--color-body)',
        'theme-text': 'var(--color-text)',
        'theme-unselected': 'var(--color-unselected)',
        'theme-secondary': 'var(--color-secondary)',
        'theme-statusbar': 'var(--color-statusbar)',
        'theme-statusbar-mismatch': 'var(--color-statusbar-mismatch)',
        'theme-accent': 'var(--color-accent)',
        // Material 3 tones (Assets/Theme.css, UtilComponents/Material)
        m3: {
          ground: 'var(--m3-ground)',
          card: 'var(--m3-card)',
          'card-low': 'var(--m3-card-low)',
          tile: 'var(--m3-tile)',
          outline: 'var(--m3-outline)',
          'outline-strong': 'var(--m3-outline-strong)',
          text: 'var(--m3-text)',
          muted: 'var(--m3-muted)',
          primary: 'var(--m3-primary)',
          'on-primary': 'var(--m3-on-primary)',
          'primary-container': 'var(--m3-primary-container)',
          'on-primary-container': 'var(--m3-on-primary-container)',
          'primary-light': 'var(--m3-primary-light)',
          tonal: 'var(--m3-tonal)',
          'warn-container': 'var(--m3-warn-container)',
          'on-warn': 'var(--m3-on-warn)',
          'error-container': 'var(--m3-error-container)',
          'on-error': 'var(--m3-on-error)',
        },
        cyan: {
          DEFAULT: '#00E0FE',
          medium: '#00C4F5',
        },
        utility: {
          red: 'var(--color-utility-red)',
          green: 'var(--color-utility-green)',
          orange: 'var(--color-utility-orange)',
          amber: 'var(--color-utility-amber)',
          blue: 'var(--color-utility-blue)',
          purple: 'var(--color-utility-purple)',
          pink: 'var(--color-utility-pink)',
          salmon: 'var(--color-utility-salmon)',
          grey: 'var(--color-utility-grey)',
          'dark-grey': 'var(--color-utility-dark-grey)',
        },
      }),
      maxWidth: { '1/2': '50%' },
    },
    fontFamily: {
      mono: ['JetBrains Mono', ...fallbacks],
      body: ['Inter', ...fallbacks],
      title: ['Manrope', ...fallbacks],
      rmp: ['AirbusRMP'],
    },
  },
  // eslint-disable-next-line global-require
  plugins: [require('@flybywiresim/tailwind-config')],
};
