#!/usr/bin/env node
// PostToolUse hook: format .ts files under src/ and test/ after Claude edits them.
const { execFileSync } = require('child_process');
const path = require('path');

let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  const filePath = JSON.parse(input).tool_input?.file_path;
  if (!filePath || !filePath.endsWith('.ts')) return;

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rel = path.relative(root, filePath);
  if (!/^(src|test)\//.test(rel) || rel.startsWith('test/disabled_TODO/')) return;

  try {
    execFileSync('npx', ['prettier', '--write', filePath], { cwd: root, stdio: 'pipe' });
  } catch (e) {
    // exit code 2 feeds stderr back to Claude
    console.error(String(e.stderr || e.message));
    process.exit(2);
  }
});
