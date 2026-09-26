import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { applyPersistedRoutes, formatRoutes, readPersistedRoutes, routeConfigPath } from './oh-my-dsh/routes.ts'

export interface OhMyDshInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

const ROOT = resolve(import.meta.dirname, '..')
const CLI = resolve(ROOT, 'apps/cli/src/bin.ts')
const WEB_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/web.patch.yml')
const HEADLESS_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/headless.patch.yml')
const TUI = resolve(ROOT, 'scripts/oh-my-dsh/tui.ts')

export function nodeSupported(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 19)
}

export function buildOhMyDshInvocation(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): OhMyDshInvocation {
  const [command = 'tui', ...rest] = argv
  const common = ['--import', 'tsx/esm', CLI]

  if (command === 'tui') {
    return {
      command: process.execPath,
      args: ['--import', 'tsx/esm', TUI, ...rest],
      env: { ...env },
    }
  }

  if (command === 'ask') {
    if (rest.length === 0 || rest.join(' ').trim() === '') throw new Error('ask requires a task')
    return {
      command: process.execPath,
      args: [...common, '--profile', 'headless', '--patch', HEADLESS_PATCH, ...rest],
      env: { ...env, DSH_TOOLS_MODE: 'ptc' },
    }
  }

  if (command === 'web') {
    return {
      command: process.execPath,
      args: [...common, '--profile', 'web', '--patch', WEB_PATCH, ...rest],
      env: { ...env },
    }
  }

  if (command.startsWith('-')) {
    return {
      command: process.execPath,
      args: [...common, '--profile', 'web', '--patch', WEB_PATCH, command, ...rest],
      env: { ...env },
    }
  }

  throw new Error(`unknown command: ${command}`)
}

function doctor(): number {
  const routeEnv = { ...process.env }
  let routeConfigOk = true
  let routeConfigDetail = routeConfigPath(routeEnv)
  try {
    readPersistedRoutes(routeEnv)
    applyPersistedRoutes(routeEnv)
  } catch (error) {
    routeConfigOk = false
    routeConfigDetail = error instanceof Error ? error.message : String(error)
  }
  const checks: readonly [string, boolean, string][] = [
    ['Node.js', nodeSupported(), process.versions.node],
    ['dsh source', existsSync(CLI), CLI],
    ['Web patch', existsSync(WEB_PATCH), WEB_PATCH],
    ['Headless patch', existsSync(HEADLESS_PATCH), HEADLESS_PATCH],
    ['TUI', existsSync(TUI), TUI],
    ['Route config', routeConfigOk, routeConfigDetail],
    ['DeepSeek key', Boolean(process.env.DEEPSEEK_API_KEY), process.env.DEEPSEEK_API_KEY ? 'configured' : 'not configured'],
  ]
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'WARN'} ${name}: ${detail}`)
  console.log('\nRoutes')
  for (const route of formatRoutes(routeEnv)) console.log(`  ${route}`)
  return checks.slice(0, 6).every(([, ok]) => ok) ? 0 : 1
}

function printHelp(): void {
  console.log([
    'pnpm oh-my-dsh',
    'pnpm oh-my-dsh web [options]',
    'pnpm oh-my-dsh ask <task>',
    'pnpm oh-my-dsh routes',
    'pnpm oh-my-dsh doctor',
  ].join('\n'))
}

async function spawnInherited(invocation: OhMyDshInvocation): Promise<number> {
  return await new Promise<number>((resolveExit, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: process.cwd(),
      env: invocation.env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal !== null) process.kill(process.pid, signal)
      resolveExit(code ?? 1)
    })
  })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv[0] === 'doctor') {
    process.exitCode = doctor()
    return
  }

  applyPersistedRoutes(process.env)

  if (argv[0] === 'routes') {
    for (const route of formatRoutes(process.env)) console.log(route)
    return
  }

  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    printHelp()
    return
  }

  if (!nodeSupported()) throw new Error(`Node.js ${process.versions.node} is unsupported; use 22.19+ or 24+`)
  process.exitCode = await spawnInherited(buildOhMyDshInvocation(argv))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`oh-my-dsh: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
