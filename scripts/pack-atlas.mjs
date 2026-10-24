#!/usr/bin/env node
/** Pack fixed, reviewed cells without changing their geometry. */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const script = fileURLToPath(new URL('pack-atlas.py', import.meta.url))
const result = spawnSync(process.env.PYTHON || 'python', [script, ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit',
})
if (result.error) {
  console.error(`Atlas packing requires Python with Pillow: ${result.error.message}`)
}
process.exit(result.status ?? 1)
