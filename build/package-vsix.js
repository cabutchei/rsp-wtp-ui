const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const distDir = path.join(extensionRoot, 'dist');
const pkg = require(path.join(extensionRoot, 'package.json'));
const outputVsix = path.join(distDir, `${pkg.name}-${pkg.version}.vsix`);

function ensureDistDir() {
    fs.mkdirSync(distDir, { recursive: true });
}

function runVscePackage() {
    const vsceCmd = process.platform === 'win32' ? 'vsce.cmd' : 'vsce';
    const result = spawnSync(vsceCmd, ['package', '--out', outputVsix], {
        cwd: extensionRoot,
        stdio: 'inherit',
        shell: false
    });

    if (result.error) {
        if (result.error.code === 'ENOENT') {
            throw new Error(
                "Could not find 'vsce' in PATH. Install it globally or run with a PATH that includes vsce."
            );
        }
        throw result.error;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        throw new Error(`vsce package failed with exit code ${result.status}`);
    }
    console.log(`Packaged extension: ${outputVsix}`);
}

function main() {
    ensureDistDir();
    runVscePackage();
}

try {
    main();
} catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
}
