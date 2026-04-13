const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const changelogPath = path.join(repoRoot, 'apps', 'web', 'src', 'data', 'admin-changelog.json');

const run = (command) =>
  execSync(command, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();

const inferAreas = (files) => {
  const areas = new Set();
  for (const file of files) {
    if (file.startsWith('apps/web/')) areas.add('web');
    else if (file.startsWith('apps/api/')) areas.add('api');
    else if (file.startsWith('apps/mobile/')) areas.add('mobile');
    else if (file.startsWith('packages/')) areas.add('packages');
    else areas.add('infra');
  }
  return Array.from(areas);
};

try {
  const subject = run('git log -1 --pretty=%s');
  if (!subject) process.exit(0);
  if (subject.startsWith('Merge ')) process.exit(0);
  if (subject.includes('[skip-changelog]')) process.exit(0);
  if (subject.startsWith('chore(changelog):')) process.exit(0);

  const commit = run('git log -1 --pretty=%h');
  const date = run('git log -1 --pretty=%cI');
  const filesRaw = run('git show --pretty="" --name-only --diff-filter=ACMRT HEAD');
  const files = filesRaw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!fs.existsSync(changelogPath)) {
    fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
    fs.writeFileSync(changelogPath, '[]\n', 'utf8');
  }

  const existing = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
  const alreadyExists = existing.some((entry) => entry.commit === commit);
  if (alreadyExists) process.exit(0);

  const nextEntry = {
    id: `${date.slice(0, 10)}-${commit}`,
    date,
    title: subject,
    summary: subject,
    areas: inferAreas(files),
    commit,
    files: files.slice(0, 30),
  };

  const next = [nextEntry, ...existing];
  fs.writeFileSync(changelogPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  execSync(`git add "${changelogPath}"`, { cwd: repoRoot, stdio: 'ignore' });
} catch (error) {
  process.stderr.write(`[changelog-hook] ${error.message}\n`);
  process.exit(0);
}
