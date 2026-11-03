// Dev server wiring for /api/chat, loaded by the Vite plugin in vite.config.ts.
import { readFileSync } from 'node:fs'
import { makeConverse } from './bedrock'
import { handleChat, memoryStore, type Deps } from './handler'
import { makeTmdb } from './tools'

let deps: Omit<Deps, 'system'> | undefined

export function handle(body: unknown, env: Record<string, string>) {
  deps ??= {
    converse: makeConverse(env.BEDROCK_MODEL_ID || undefined),
    tmdb: makeTmdb(env.TMDB_READ_TOKEN),
    sessions: memoryStore(),
    disabled: env.KILL_SWITCH === '1',
  }
  // Re-read each turn so prompt edits apply without a restart.
  return handleChat(body, { ...deps, system: readFileSync('prompts/system-v3.md', 'utf8') })
}
