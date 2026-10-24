// Where the test scripts find things: the same rules as server/src/config.ts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let local = {}
try { local = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'chalkbyte.local.json'), 'utf8')) } catch { /* no local settings */ }
const env = (name) => process.env[`CHALKBYTE_${name}`] ?? process.env[`LAB_${name}`]

export const PORT = Number(env('PORT') ?? local.port ?? 4317)
/** The code folder the server uses (my-code/ unless configured). */
export const ROOT = path.resolve(APP_DIR, env('ROOT') ?? local.codeDir ?? 'my-code')
