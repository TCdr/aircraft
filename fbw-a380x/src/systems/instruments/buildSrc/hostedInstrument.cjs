// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-env node */

/*
 * The `-hosted` package files of a display drawn on another DU (A380 CDS reconfiguration, see
 * src/MsfsAvionicsCommon/HostedDisplay.ts): `<file>-hosted.html` loads the instrument's normal script with
 * `<file>-hosted.css`, its stylesheet scoped to the instrument's mount element.
 *
 * Why: all gauges of a panel.cfg block share one document, so the stylesheet of a gauge stacked on another DU's block
 * applies to that DU's own gauge too. The PFD and the ND both define classes such as .FontLarge with other sizes
 * (6.5 px in the PFD's 158.75-unit viewBox, 32.5 px on the ND): the unscoped PFD stylesheet would change the ND's
 * text. Scoped under `#PFD_CONTENT`, the hosted PFD's rules only reach the PFD, and win over the host's same-name rules
 * by specificity. Keyframes are renamed (`hosted-<name>`) so the host's animations keep their own.
 */

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

/** Prefix of the renamed keyframes */
const KEYFRAMES_PREFIX = 'hosted-';

/**
 * Scopes one selector to the mount element. Document-level selectors (:root, html, body) stand for the mount element.
 * @param {string} selector the selector
 * @param {string} scope the scope selector (e.g. #PFD_CONTENT)
 * @returns {string} the scoped selector
 */
function scopeSelector(selector, scope) {
    const trimmed = selector.trim();
    const documentLevel = /^((:root|html|body)\b\s*)+/i.exec(trimmed);
    if (documentLevel) {
        const rest = trimmed.slice(documentLevel[0].length).trim();
        return rest ? `${scope} ${rest}` : scope;
    }
    return `${scope} ${trimmed}`;
}

/**
 * Scopes a stylesheet to a mount element and renames its keyframes
 * @param {string} css the stylesheet
 * @param {string} scope the scope selector (e.g. #PFD_CONTENT)
 * @returns {string} the scoped stylesheet
 */
function scopeCss(css, scope) {
    const root = postcss.parse(css);
    const renamed = new Map();

    root.walkAtRules(/keyframes$/i, (atRule) => {
        const name = atRule.params.trim();
        renamed.set(name, KEYFRAMES_PREFIX + name);
        atRule.params = KEYFRAMES_PREFIX + name;
    });

    root.walkRules((rule) => {
        if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) {
            return;
        }
        rule.selectors = rule.selectors.map((selector) => scopeSelector(selector, scope));
    });

    root.walkDecls(/^(-webkit-)?animation(-name)?$/i, (decl) => {
        decl.value = decl.value.replace(/[A-Za-z_][\w-]*/g, (token) => renamed.get(token) ?? token);
    });

    return root.toString();
}

/**
 * The HTML file of the hosted gauge: the same template as Mach's (template.html), with the scoped stylesheet
 * @param {{ templateId: string, mountElementId: string, imports: string[], cssPath: string, jsPath: string }} options
 * @returns {string} the HTML
 */
function hostedHtml({ templateId, mountElementId, imports, cssPath, jsPath }) {
    const importLines = imports
        .map((script) => `<script type="text/html" import-script="${script}" import-async="false"></script>\n`)
        .join('');
    return (
        `<script type="text/html" id="${templateId}">\n` +
        `    <div id="${mountElementId}">\n` +
        `        <h1>If you're seeing this, instrument didn't load.</h1>\n` +
        `    </div>\n` +
        `</script>\n\n` +
        importLines +
        `\n<link rel="stylesheet" href="${cssPath}" />\n` +
        `<script type="text/html" import-script="${jsPath}" import-async="false"></script>\n`
    );
}

/**
 * esbuild plugin of a Mach instrument (mach.config.js): after the build, writes `<file>-hosted.css` and
 * `<file>-hosted.html` next to the instrument's package files
 * @param {string} name the instrument name (folder)
 * @param {{ templateId: string, mountElementId: string, fileName: string, imports?: string[] }} simulatorPackage
 * @returns {import('esbuild').Plugin} the plugin
 */
function hostedInstrumentPlugin(name, simulatorPackage) {
    return {
        name: 'hostedInstrument',
        setup(build) {
            build.onEnd(async (result) => {
                if (result.errors.length > 0 || process.env.SKIP_SIM_PACKAGE === 'true') {
                    return;
                }
                const css = await fs.promises.readFile(
                    path.join(path.dirname(build.initialOptions.outfile), 'bundle.css'),
                    {
                        encoding: 'utf-8',
                    },
                );
                const packageTarget = path.join(
                    process.env.PACKAGE_DIR,
                    'html_ui/Pages/VCockpit/Instruments',
                    process.env.PACKAGE_NAME,
                    name,
                );
                const packagePath = `/Pages/VCockpit/Instruments/${process.env.PACKAGE_NAME}/${name}`;
                const { fileName, templateId, mountElementId } = simulatorPackage;

                await fs.promises.mkdir(packageTarget, { recursive: true });
                await fs.promises.writeFile(
                    path.join(packageTarget, `${fileName}-hosted.css`),
                    scopeCss(css, `#${mountElementId}`),
                );
                await fs.promises.writeFile(
                    path.join(packageTarget, `${fileName}-hosted.html`),
                    hostedHtml({
                        templateId,
                        mountElementId,
                        imports: simulatorPackage.imports ?? [],
                        cssPath: `${packagePath}/${fileName}-hosted.css`,
                        jsPath: `${packagePath}/${fileName}.js`,
                    }),
                );
            });
        },
    };
}

module.exports = { hostedInstrumentPlugin, scopeCss, scopeSelector, hostedHtml };
