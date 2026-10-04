const imagePlugin = require('esbuild-plugin-inline-image');
const postCssPlugin = require('esbuild-style-plugin-v2');
const tailwind = require('tailwindcss');
const postCssColorFunctionalNotation = require('postcss-color-functional-notation');
const postCssInset = require('postcss-inset');
const { typecheckingPlugin } = require('#build-utils');
const { hostedInstrumentPlugin } = require('./src/systems/instruments/buildSrc/hostedInstrument.cjs');

/** @type { import('@synaptic-simulations/mach').MachConfig } */
module.exports = {
  packageName: 'A380X',
  packageDir: 'out/flybywire-aircraft-a380-842',
  plugins: [
    imagePlugin({ limit: -1 }),
    postCssPlugin({
      extract: true,
      postcss: {
        plugins: [
          tailwind('../fbw-common/src/systems/instruments/src/EFB/tailwind.config.js'),

          // transform: hsl(x y z / alpha) -> hsl(x, y, z, alpha)
          postCssColorFunctionalNotation(),

          // transform: inset: 0; -> top/right/left/bottom: 0;
          postCssInset(),
        ],
      },
    }),
    typecheckingPlugin(),
  ],
  instruments: [
    msfsAvionicsInstrument('Clock'),
    // EWD, ND and PFD: also drawn on another DU (CDS reconfiguration), with a scoped stylesheet (*-hosted.html/css)
    msfsAvionicsInstrument('EWD', 'instrument.tsx', true),
    msfsAvionicsInstrument('FCU'),
    msfsAvionicsInstrument('MFD'),
    msfsAvionicsInstrument('ND', 'instrument.tsx', true),
    msfsAvionicsInstrument('OIT'),
    msfsAvionicsInstrument('PFD', 'instrument.tsx', true),
    msfsAvionicsInstrument('RMP'),
    msfsAvionicsInstrument('SDv2'),
    msfsAvionicsInstrument('popup'),

    reactInstrument('BAT'),
    reactInstrument('EFB', ['/Pages/VCockpit/Instruments/Shared/Map/MapInstrument.html']),
    reactInstrument('ISISlegacy'),
    reactInstrument('OITlegacy'),
    reactInstrument('RTPI'),
    reactInstrument('SD'),
  ],
};

function msfsAvionicsInstrument(name, index = 'instrument.tsx', hosted = false) {
  const simulatorPackage = {
    type: 'baseInstrument',
    templateId: `A380X_${name}`,
    mountElementId: `${name}_CONTENT`,
    fileName: name.toLowerCase(),
    imports: ['/JS/dataStorage.js'],
  };
  return {
    name,
    index: `src/systems/instruments/src/${name}/${index}`,
    simulatorPackage,
    plugins: hosted ? [hostedInstrumentPlugin(name, simulatorPackage)] : undefined,
  };
}

function reactInstrument(name, additionalImports) {
  return {
    name,
    index: `src/systems/instruments/src/${name}/index.tsx`,
    simulatorPackage: {
      type: 'react',
      isInteractive: false,
      fileName: name.toLowerCase(),
      imports: ['/JS/dataStorage.js', '/JS/fbw-a380x/A380X_Simvars.js', ...(additionalImports ?? [])],
    },
  };
}
