import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const skillSources = [
  '@servicenow/agent-pack-aiux',
  '@servicenow/agent-pack-horizon-design-knowledge'
];
const targetDir = path.join(rootDir, '.claude', 'skills');

// Deprecated in favor of aiux-build — never copy these into a scaffolded app.
const deprecatedSkills = new Set(['aiux-app', 'aiux-element', 'aiux-widget']);

// Copy one pack's skills into .claude/skills and return how many were copied.
// A missing pack is skipped rather than fatal: this script runs as a
// `postinstall` hook, so it must never fail `pnpm install` — e.g. a
// production/CI install (`--prod`, `--ignore-scripts` aside) that prunes the
// dev-dependency packs should still succeed.
function copySkills(packageName) {
  const skillsDir = path.join(rootDir, 'node_modules', packageName, 'skills');
  if (!fs.existsSync(skillsDir)) return 0;

  fs.mkdirSync(targetDir, {recursive: true});
  let count = 0;
  for (const entry of fs.readdirSync(skillsDir, {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    if (deprecatedSkills.has(entry.name)) continue;
    fs.cpSync(
      path.join(skillsDir, entry.name),
      path.join(targetDir, entry.name),
      {recursive: true, force: true}
    );
    count++;
  }
  return count;
}

let total = 0;
for (const packageName of skillSources) total += copySkills(packageName);

// Create .agents/skills -> .claude/skills link so other agents discover the
// same skills without a separate copy. Only when .claude/skills actually
// exists — e.g. a --prod install that pruned the agent-pack devDeps never
// populated it, and a link to a nonexistent directory would just dangle.
//
// POSIX: a relative symlink (portable across machines/checkouts).
// Windows: symlinks need Administrator privileges or Developer Mode enabled,
// which most users don't have — use a directory junction instead, which
// needs neither (but requires an absolute target).
const agentsSkillsLink = path.join(rootDir, '.agents', 'skills');
const isWindows = process.platform === 'win32';
const agentsLinkTarget = isWindows
  ? targetDir
  : path.join('..', '.claude', 'skills');
const linkType = isWindows ? 'junction' : undefined;
const linkKind = isWindows ? 'junction' : 'symlink';
if (fs.existsSync(targetDir)) {
  try {
    const existing = fs.lstatSync(agentsSkillsLink);
    if (
      existing.isSymbolicLink() &&
      fs.readlinkSync(agentsSkillsLink) === agentsLinkTarget
    ) {
      // Already correct — nothing to do.
    } else {
      fs.rmSync(agentsSkillsLink, {recursive: true, force: true});
      fs.mkdirSync(path.dirname(agentsSkillsLink), {recursive: true});
      fs.symlinkSync(agentsLinkTarget, agentsSkillsLink, linkType);
      console.log(`Updated .agents/skills ${linkKind} → .claude/skills`);
    }
  } catch {
    fs.mkdirSync(path.dirname(agentsSkillsLink), {recursive: true});
    fs.symlinkSync(agentsLinkTarget, agentsSkillsLink, linkType);
    console.log(`Created .agents/skills ${linkKind} → .claude/skills`);
  }
}

if (total > 0) {
  console.log(
    `Copied ${total} ServiceNow agent skill(s) to ${path.relative(rootDir, targetDir)}`
  );
} else {
  console.log(
    'ServiceNow agent packs not found in node_modules — skipping skill copy. ' +
      'They are copied automatically on `pnpm install`; run `pnpm agent:skills` to retry.'
  );
}
