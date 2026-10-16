#!/usr/bin/env node
// PostToolUse hook: format .ts files under src/ and test/ after Claude edits them.
const { execFileSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  let filePath;
  try {
    filePath = JSON.parse(input).tool_input?.file_path;
  } catch {
    return; // not our payload: never block the tool call over a formatter
  }
  if (!filePath || !filePath.endsWith('.ts')) return;

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  if (!/^(src|test)\//.test(rel) || rel.startsWith('test/disabled_TODO/')) return;

  try {
    execFileSync('npx', ['prettier', '--write', filePath], {
      cwd: root,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
  } catch (e) {
    // exit code 2 feeds stderr back to Claude
    console.error(String(e.stderr || e.message));
    process.exit(2);
  }
});
