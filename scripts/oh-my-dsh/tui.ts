import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import { expandRoleShortcut, formatRoutes, parseRouteRole, parseRouteSelection, setRoute } from './routes.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const CLI = resolve(ROOT, 'apps/cli/src/bin.ts')
const HEADLESS_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/headless.patch.yml')

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
}

function paint(code: string, value: string): string {
  return process.stdout.isTTY ? `${code}${value}${ansi.reset}` : value
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function short(value: unknown, cap = 120): string {
  let text: string
  if (typeof value === 'string') text = value
  else {
    try { text = JSON.stringify(value) }
    catch { text = String(value) }
  }
  return text.length <= cap ? text : `${text.slice(0, cap - 1)}…`
}

interface TurnResult {
  readonly sessionId?: string
  readonly exitCode: number
}

async function runTurn(task: string, sessionId: string | undefined): Promise<TurnResult> {
  const args = [
    '--import', 'tsx/esm', CLI,
    '--profile', 'headless',
    '--patch', HEADLESS_PATCH,
    '--json',
    ...(sessionId === undefined ? [] : ['--session-id', sessionId]),
    task,
  ]
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.stdout === null || child.stderr === null) throw new Error('headless child streams are unavailable')
  const exit = new Promise<number>(resolveExit => {
    child.once('exit', code => resolveExit(code ?? 1))
    child.once('error', () => resolveExit(1))
  })
  let discoveredSession = sessionId
  let emittedText = false
  let finalText = ''
  const calls = new Map<string, string>()
  const output = createInterface({ input: child.stdout })
  const errors: string[] = []
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => errors.push(String(chunk)))

  for await (const line of output) {
    if (line.trim() === '') continue
    let event: unknown
    try { event = JSON.parse(line) }
    catch {
      console.log(paint(ansi.dim, line))
      continue
    }
    if (!record(event) || typeof event.type !== 'string') continue
    if (event.type === 'session') {
      if (typeof event.sessionId === 'string') discoveredSession = event.sessionId
      if (sessionId === undefined && discoveredSession !== undefined) {
        console.log(paint(ansi.dim, `session ${discoveredSession}`))
      }
      continue
    }
    if (event.type === 'thinking' && typeof event.text === 'string') {
      const compact = event.text.replace(/\s+/g, ' ').trim()
      if (compact !== '') console.log(paint(ansi.dim, `  … ${short(compact, 180)}`))
      continue
    }
    if (event.type === 'tool_call') {
      const tool = typeof event.tool === 'string' ? event.tool : 'tool'
      const id = typeof event.callId === 'string' ? event.callId : ''
      if (id !== '') calls.set(id, tool)
      console.log(paint(ansi.cyan, `  → ${tool}`) + paint(ansi.dim, ` ${short(event.input)}`))
      continue
    }
    if (event.type === 'tool_result') {
      const id = typeof event.callId === 'string' ? event.callId : ''
      const tool = calls.get(id) ?? 'tool'
      const failed = event.status === 'error'
      console.log(paint(failed ? ansi.red : ansi.green, `  ${failed ? '×' : '✓'} ${tool}`) + paint(ansi.dim, ` ${short(event.result)}`))
      continue
    }
    if (event.type === 'text' && typeof event.text === 'string') {
      emittedText = true
      process.stdout.write(event.text.endsWith('\n') ? event.text : `${event.text}\n`)
      continue
    }
    if (event.type === 'final' && typeof event.text === 'string') {
      finalText = event.text
      continue
    }
    if (event.type === 'error' && typeof event.message === 'string') {
      console.error(paint(ansi.red, `error: ${event.message}`))
    }
  }

  const exitCode = await exit
  if (!emittedText && finalText !== '') console.log(finalText)
  const diagnostic = errors.join('').trim()
  if (diagnostic !== '') console.error(paint(exitCode === 0 ? ansi.dim : ansi.red, diagnostic))
  return { sessionId: discoveredSession, exitCode }
}

function printHelp(): void {
  console.log([
    '/help                              commands',
    '/new                               start a new session',
    '/session                           show current session id',
    '/resume <session-id>               continue an existing headless session',
    '/routes                            show model routes',
    '/scout <task>                       run Scout and wait',
    '/worker <task>                      run Worker and wait',
    '/review <task>                      run Reviewer and wait',
    '/architect <task>                   run Architect and wait',
    '/clear                              clear the terminal',
    '/route <role> <provider>/<model> [effort]',
    '/route <role> inherit              inherit/default route',
    '/exit                              quit',
    '',
    'roles: scout, worker, reviewer, architect',
  ].join('\n'))
}

export async function runTui(): Promise<void> {
  console.log(paint(ansi.bold, 'oh-my-dsh') + paint(ansi.dim, ' · terminal session'))
  console.log(paint(ansi.dim, 'type /help for commands'))
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY })
  let sessionId: string | undefined
  try {
    while (true) {
      const prompt = sessionId === undefined ? '❯ ' : '› '
      let line: string
      try {
        line = await rl.question(paint(ansi.yellow, prompt))
      } catch {
        break
      }
      const trimmed = line.trim()
      if (trimmed === '') continue
      if (trimmed === '/exit' || trimmed === '/quit') break
      if (trimmed === '/help') {
        printHelp()
        continue
      }
      if (trimmed === '/new') {
        sessionId = undefined
        console.log(paint(ansi.dim, 'new session'))
        continue
      }
      if (trimmed === '/clear') {
        if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H')
        continue
      }
      if (trimmed === '/session') {
        console.log(sessionId ?? 'new')
        continue
      }
      if (trimmed.startsWith('/resume ')) {
        const wanted = trimmed.slice('/resume '.length)
        if (wanted.trim() === '') {
          console.error('session id is required')
          continue
        }
        sessionId = wanted
        console.log(paint(ansi.dim, `resume ${sessionId}`))
        continue
      }
      if (trimmed === '/routes') {
        console.log(formatRoutes(process.env).join('\n'))
        continue
      }
      if (trimmed.startsWith('/route ')) {
        const [, roleText = '', routeText = '', effort] = trimmed.split(/\s+/)
        const role = parseRouteRole(roleText)
        if (role === undefined) {
          console.error('unknown role')
          continue
        }
        try {
          if (routeText === 'inherit' || routeText === 'default') setRoute(process.env, role)
          else setRoute(process.env, role, parseRouteSelection(routeText, effort))
          console.log(formatRoutes(process.env).find(row => row.startsWith(role)) ?? role)
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error))
        }
        continue
      }
      const result = await runTurn(expandRoleShortcut(line) ?? line, sessionId)
      sessionId = result.sessionId
      if (result.exitCode !== 0) console.log(paint(ansi.red, `turn exited ${result.exitCode}`))
    }
  } finally {
    rl.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runTui().catch(error => {
    console.error(`oh-my-dsh: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
