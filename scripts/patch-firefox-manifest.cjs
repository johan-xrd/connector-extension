#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { buildSync } = require('esbuild')

const distDir = path.resolve(__dirname, '..', 'dist')
const manifestPath = path.join(distDir, 'manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found in dist directory')
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

// CSP note: connect-src 'self' wss://* is intentionally broad because
// the signaling server URL can be configured at runtime via
// options.customSignalingServerUrl. Restricting to known hosts
// (signaling-server.radixdlt.com, signaling-server-dev.rdx-works-main.extratools.works)
// would break custom signaling configurations.

if (manifest.background && manifest.background.service_worker) {
  // Legacy path: manifest was built with service_worker (e.g. Chrome-style),
  // convert to scripts for Firefox compatibility.
  const swPath = manifest.background.service_worker
  delete manifest.background.service_worker
  delete manifest.background.type
  manifest.background.scripts = [swPath]
  console.log(
    `Converted background.service_worker -> background.scripts: [${swPath}]`,
  )
}

// Remove version_name (unsupported in Firefox MV3)
delete manifest.version_name;

// Remove use_dynamic_url from web_accessible_resources
if (Array.isArray(manifest.web_accessible_resources)) {
  for (const resource of manifest.web_accessible_resources) {
    delete resource.use_dynamic_url;
  }
}

// Ensure no unsupported background fields
if (manifest.background) {
  delete manifest.background.persistent;
  delete manifest.background.service_worker;
  delete manifest.background.type;
}

if (manifest.background && manifest.background.scripts) {
  const bundledScripts = []

  for (const scriptPath of manifest.background.scripts) {
    const absPath = path.join(distDir, scriptPath)
    if (!fs.existsSync(absPath)) {
      console.error(`ERROR: Background script not found: ${absPath}`)
      process.exit(1)
    }

    const content = fs.readFileSync(absPath, 'utf8')
    const hasTopLevelESM =
      /^\s*import[\s{]/m.test(content) || /^\s*export[\s{]/m.test(content)

    if (!hasTopLevelESM) {
      // Already a classic script — use as-is.
      console.log(
        `Background script ${scriptPath} is already a classic script`,
      )
      bundledScripts.push(scriptPath)
      continue
    }

    console.log(
      `Background script ${scriptPath} has top-level ESM — bundling to IIFE for Firefox`,
    )

    // Bundle the ESM script into a single IIFE via esbuild.
    // Resolve imports relative to the script's directory (dist/assets/).
    const outName = path.basename(scriptPath).replace(/\.js$/, '.iife.js')
    const outPath = path.join(distDir, 'assets', outName)

    try {
      buildSync({
        entryPoints: [absPath],
        bundle: true,
        format: 'iife',
        outfile: outPath,
        target: 'es2020',
        absWorkingDir: distDir,
        logLevel: 'warning',
      })
    } catch (err) {
      console.error(
        `ERROR: Failed to bundle background script to IIFE: ${err.message}`,
      )
      process.exit(1)
    }

    // Verify the output has no top-level ESM.
    const bundledContent = fs.readFileSync(outPath, 'utf8')
    const bundledHasESM =
      /^\s*import[\s{]/m.test(bundledContent) ||
      /^\s*export[\s{]/m.test(bundledContent)
    if (bundledHasESM) {
      console.error(
        'ERROR: IIFE-bundled background script still contains top-level ESM.',
      )
      console.error(
        'The build must be reconfigured for Firefox compatibility.',
      )
      process.exit(1)
    }

    console.log(
      `Bundled background script: assets/${outName}`,
    )
    bundledScripts.push(`assets/${outName}`)
  }

  manifest.background.scripts = bundledScripts
}

const SW_LOADER = 'service-worker-loader.js'
const swLoaderPath = path.join(distDir, SW_LOADER)
if (fs.existsSync(swLoaderPath)) {
  let content = fs.readFileSync(swLoaderPath, 'utf8')
  content = content.replace(
    /navigator\.serviceWorker\.register\s*\(/g,
    '// Firefox: navigator.serviceWorker.register is not supported; script loaded via manifest\nvoid (',
  )
  fs.writeFileSync(swLoaderPath, content, 'utf8')
  console.log('Patched service-worker-loader.js for Firefox compatibility')
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
console.log('Firefox manifest patched successfully')
