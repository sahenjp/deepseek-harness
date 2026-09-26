import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { createInterface as createLineReader } from 'node:readline'
import { pathToFileURL } from 'node:url'

export interface OhMyDshInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

export interface RoleRoute {
  readonly role: 'main' | 'scout' | 'worker' | 'reviewer' | 'architect'
  readonly provider: string
  readonly model: string
  readonly effort?: string
  readonly inherited: boolean
}

interface HeadlessEvent {
  readonly type?: string
  readonly sessionId?: string
  readonly phase?: string
  readonly tool?: string
  readonly callId?: string
  readonly input?: unknown
  readonly result?: string
  readonly status?: string
  readonly text?: string
}

const ROOT = resolve(import.meta.dirname, '..')
const CLI = resolve(ROOT, 'apps/cli/src/bin.ts')
const WEB_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/web.patch.yml')
const HEADLESS_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/headless.patch.yml')
const TUI = resolve(ROOT, 'scripts/oh-my-dsh/tui.ts')
const ROLE_NAMES = ['scout', 'worker', 'reviewer', 'architect'] as const

const ansi = {
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  reset: '\u001b[0m',
}

export function nodeSupported(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 19)
}

function commonArgs(): string[] {
  return ['--import', 'tsx/esm', CLI]
}

export function buildOhMyDshInvocation(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): OhMyDshInvocation {
  const [command = 'tui', ...rest] = argv
  if (command === 'tui') {
    return {
      command: process.execPath,
      args: ['--import', 'tsx/esm', TUI, ...rest],
      env: { ...env },
    }
  }
  if (command === 'ask') {
    if (rest.length === 0 || rest.join(' ').trim() === '') throw new Error('ask requires a task')
    return buildHeadlessJsonInvocation(rest.join(' '), undefined, env, false)
  }
  if (command === 'web') {
    return {
      command: process.execPath,
      args: [...commonArgs(), '--profile', 'web', '--patch', WEB_PATCH, ...rest],
      env: { ...env },
    }
  }
  if (command.startsWith('-')) {
    return {
      command: process.execPath,
      args: [...commonArgs(), '--profile', 'web', '--patch', WEB_PATCH, command, ...rest],
      env: { ...env },
    }
  }
  throw new Error(`unknown command: ${command}`)
}

export function buildHeadlessJsonInvocation(
  task: string,
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env,
  json = true,
): OhMyDshInvocation {
  if (task.trim() === '') throw new Error('task must not be empty')
  return {
    command: process.execPath,
    args: [
      ...commonArgs(),
      '--profile', 'headless',
      '--patch', HEADLESS_PATCH,
      ...(json ? ['--json'] : []),
      ...(sessionId === undefined ? [] : ['--session-id', sessionId]),
      task,
    ],
    env: { ...env, DSH_TOOLS_MODE: 'ptc' },
  }
}

export function effectiveRoutes(env: NodeJS.ProcessEnv = process.env): RoleRoute[] {
  const mainProvider = env.OMDSH_MAIN_PROVIDER ?? 'deepseek-official'
  const mainModel = env.OMDSH_MAIN_MODEL ?? 'deepseek-flash'
  const mainEffort = env.OMDSH_MAIN_EFFORT
  const main: RoleRoute = {
    role: 'main', provider: mainProvider, model: mainModel,
    ...(mainEffort === undefined || mainEffort === '' ? {} : { effort: mainEffort }),
    inherited: false,
  }
  const roles = ROLE_NAMES.map((role): RoleRoute => {
    const prefix = `OMDSH_${role.toUpperCase()}`
    const model = env[`${prefix}_MODEL`]
    const provider = env[`${prefix}_PROVIDER`] ?? mainProvider
    const effort = env[`${prefix}_EFFORT`]
    return {
      role,
      provider,
      model: model ?? mainModel,
      ...(effort === undefined || effort === '' ? {} : { effort }),
      inherited: model === undefined || model === '',
    }
  })
  return [main, ...roles]
}

function routeSummary(route: RoleRoute): string {
  const suffix = route.effort === undefined ? '' : ` / ${route.effort}`
  const inheritance = route.inherited ? ' (inherit)' : ''
  return `${route.role.padEnd(9)} ${route.provider}/${route.model}${suffix}${inheritance}`
}

function compactJson(value: unknown, max = 120): string {
  let text: string
  try { text = JSON.stringify(value) }
  catch { text = String(value) }
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function formatHeadlessEvent(event: HeadlessEvent): string | undefined {
  switch (event.type) {
    case 'thinking':
      return event.text === undefined || event.text === '' ? undefined : `${ansi.dim}  thinking  ${event.text}${ansi.reset}`
    case 'tool_call':
      return `${ansi.cyan}  ┌ ${event.tool ?? 'tool'}${ansi.reset} ${ansi.dim}${compactJson(event.input)}${ansi.reset}`
    case 'tool_result': {
      const ok = event.status !== 'error'
      const mark = ok ? `${ansi.green}✓${ansi.reset}` : `${ansi.red}×${ansi.reset}`
      const result = event.result === undefined || event.result === '' ? '' : ` ${ansi.dim}${event.result.slice(0, 180)}${ansi.reset}`
      return `  └ ${mark} ${event.callId ?? ''}${result}`.trimEnd()
    }
    case 'status':
      if (event.phase === 'turn_start') return `${ansi.dim}  · turn started${ansi.reset}`
      if (event.phase === 'turn_end') return `${ansi.dim}  · turn finished${ansi.reset}`
      return undefined
    default:
      return undefined
  }
}

function doctor(): number {
  const checks: readonly [string, boolean, string][] = [
    ['Node.js', nodeSupported(), process.versions.node],
    ['dsh source', existsSync(CLI), CLI],
    ['Web patch', existsSync(WEB_PATCH), WEB_PATCH],
    ['Headless patch', existsSync(HEADLESS_PATCH), HEADLESS_PATCH],
    ['TUI', existsSync(TUI), TUI],
    ['DeepSeek key', Boolean(process.env.DEEPSEEK_API_KEY), process.env.DEEPSEEK_API_KEY ? 'configured' : 'not configured'],
  ]
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'WARN'} ${name}: ${detail}`)
  console.log('\nRoutes')
  for (const route of effectiveRoutes()) console.log(`  ${routeSummary(route)}`)
  return checks.slice(0, 5).every(([, ok]) => ok) ? 0 : 1
}

function printHelp(): void {
  console.log(`oh-my-dsh

  pnpm oh-my-dsh                 interactive terminal session
  pnpm oh-my-dsh web [options]   Web UI
  pnpm oh-my-dsh ask <task>      one-shot answer
  pnpm oh-my-dsh doctor          environment and route diagnostics
  pnpm oh-my-dsh routes          show effective role routes

Interactive commands:
  /help      show commands
  /new       start a fresh session
  /session   show current session id
  /routes    show effective role routes
  /doctor    run diagnostics
  /clear     clear the terminal
  /exit      quit
`)
}

function spawnInherited(invocation: OhMyDshInvocation): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(), env: invocation.env, stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal !== null) process.kill(process.pid, signal)
      resolveExit(code ?? 1)
    })
  })
}

async function runTurn(task: string, sessionId?: string): Promise<{ sessionId?: string; code: number }> {
  const invocation = buildHeadlessJsonInvocation(task, sessionId)
  const child = spawn(invocation.command, invocation.args, {
    cwd: process.cwd(), env: invocation.env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (child.stdout === null || child.stderr === null) throw new Error('headless stream pipes are unavailable')
  let resolvedSession = sessionId
  let finalText = ''
  let childError: Error | undefined
  child.once('error', error => { childError = error })
  child.stderr.on('data', chunk => process.stderr.write(`${ansi.dim}${String(chunk)}${ansi.reset}`))
  const lines = createLineReader({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of lines) {
    let event: HeadlessEvent
    try { event = JSON.parse(line) as HeadlessEvent }
    catch {
      console.log(`${ansi.yellow}  ! unparsed output${ansi.reset} ${line}`)
      continue
    }
    if (event.type === 'session' && typeof event.sessionId === 'string') resolvedSession = event.sessionId
    if (event.type === 'final') {
      finalText = event.text ?? ''
      continue
    }
    const rendered = formatHeadlessEvent(event)
    if (rendered !== undefined) console.log(rendered)
  }
  const code = await new Promise<number>((resolveExit) => {
    if (child.exitCode !== null) return resolveExit(child.exitCode)
    child.once('exit', value => resolveExit(value ?? 1))
  })
  if (childError !== undefined) throw childError
  if (finalText !== '') console.log(`\n${ansi.bold}assistant${ansi.reset}\n${finalText}\n`)
  return { sessionId: resolvedSession, code }
}

async function interactive(): Promise<void> {
  console.log(`${ansi.bold}OH MY DSH${ansi.reset} ${ansi.dim}interactive · PTC · role routing${ansi.reset}`)
  console.log(`${ansi.dim}Type /help for commands. Specialist tools: scout, worker, reviewer, architect.${ansi.reset}\n`)
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  let sessionId: string | undefined
  try {
    while (true) {
      const label = sessionId === undefined ? 'new' : sessionId.slice(0, 12)
      let input: string
      try { input = await rl.question(`${ansi.cyan}${label} ›${ansi.reset} `) }
      catch { break }
      const task = input.trim()
      if (task === '') continue
      if (task === '/exit' || task === '/quit') break
      if (task === '/help') { printHelp(); continue }
      if (task === '/new') { sessionId = undefined; console.log('new session'); continue }
      if (task === '/session') { console.log(sessionId ?? '(new session)'); continue }
      if (task === '/routes') { for (const route of effectiveRoutes()) console.log(`  ${routeSummary(route)}`); continue }
      if (task === '/doctor') { doctor(); continue }
      if (task === '/clear') { process.stdout.write('\u001b[2J\u001b[H'); continue }
      const result = await runTurn(input, sessionId)
      sessionId = result.sessionId ?? sessionId
      if (result.code !== 0) console.log(`${ansi.yellow}turn exited with code ${result.code}${ansi.reset}`)
    }
  } finally {
    rl.close()
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === 'doctor') {
    process.exitCode = doctor()
    return
  }
  if (argv[0] === 'routes') {
    for (const route of effectiveRoutes()) console.log(routeSummary(route))
    return
  }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    printHelp()
    return
  }
  if (!nodeSupported()) throw new Error(`Node.js ${process.versions.node} is unsupported; use 22.19+ or 24+`)
  if (argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    await interactive()
    return
  }
  const invocation = buildOhMyDshInvocation(argv)
  process.exitCode = await spawnInherited(invocation)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`oh-my-dsh: ${(error as Error).message}`)
    process.exitCode = 1
  })
}
