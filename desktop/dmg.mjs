import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

if (process.platform !== 'darwin') throw new Error('DMG packaging requires macOS');
const root = process.cwd();
const {version} = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
const app = path.join(root, 'dist-desktop/easy text-darwin-arm64/easy text.app');
await fs.access(path.join(app, 'Contents/MacOS/easy text'));
const bundleVersion = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', path.join(app, 'Contents/Info.plist')], {encoding:'utf8'}).trim();
if (bundleVersion !== version) throw new Error('Rebuild the app: package and bundle versions differ');
const output = path.join(root, 'dist-desktop', `easy-text-${version}-macOS-arm64.dmg`);
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'easy-text-dmg-'));
try {
  execFileSync('/usr/bin/ditto', [app, path.join(stage, 'easy text.app')], {stdio:'inherit'});
  await fs.symlink('/Applications', path.join(stage, 'Applications'));
  execFileSync('/usr/bin/hdiutil', ['create', '-volname', `easy text ${version}`, '-srcfolder', stage, '-format', 'UDZO', '-ov', output], {stdio:'inherit'});
  execFileSync('/usr/bin/hdiutil', ['verify', output], {stdio:'inherit'});
  const digest = createHash('sha256').update(await fs.readFile(output)).digest('hex');
  await fs.writeFile(`${output}.sha256`, `${digest}  ${path.basename(output)}\n`);
  console.log(`DMG: ${output}\nSHA256: ${digest}`);
} finally {
  await fs.rm(stage, {recursive:true, force:true});
}
