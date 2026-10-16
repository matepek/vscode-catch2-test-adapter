#!/usr/bin/env node
// PreToolUse hook (Bash): block shell commands that write to .github/workflows/.
// The Edit(...) deny rule only covers the Edit tool; this closes the `sed -i` / `>` / `mv` bypass.
// It is a heuristic guard against accidents, not a sandbox.
let input = '';
process.stdin.on('data', chunk => (input += chunk));
process.stdin.on('end', () => {
  let command;
  try {
    command = JSON.parse(input).tool_input?.command;
  } catch {
    return;
  }
  if (typeof command !== 'string' || !command.includes('.github/workflows')) return;

  const writes = [
    /\bsed\s+(-\S*i|--in-place)/,
    /\bperl\s+-\S*i/,
    /\b(tee|mv|cp|rm|install|truncate|patch|ed)\b/,
    /\bgit\s+(apply|checkout|restore|rm|mv)\b/,
    /(^|[^0-9&])>{1,2}\s*\S*\.github\/workflows/,
  ];
  if (writes.some(re => re.test(command))) {
    // exit code 2 blocks the call and feeds stderr back to Claude
    console.error('Blocked: .github/workflows/ changes need explicit maintainer approval (see AGENTS.md).');
    process.exit(2);
  }
});
