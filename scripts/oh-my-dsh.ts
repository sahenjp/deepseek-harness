import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export interface OhMyDshInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: NodeJS.ProcessEnv
}

const ROOT = resolve(import.meta.dirname, '..')
const CLI = resolve(ROOT, 'apps/cli/src/bin.ts')
const WEB_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/web.patch.yml')
const HEADLESS_PATCH = resolve(ROOT, 'scripts/oh-my-dsh/headless.patch.yml')

export function nodeSupported(version = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major >= 24 || (major === 22 && minor >= 19)
}

export function buildOhMyDshInvocation(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): OhMyDshInvocation {
  const [command = 'web', ...rest] = argv
  const common = ['--import', 'tsx/esm', CLI]
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
  const checks: readonly [string, boolean, string][] = [
    ['Node.js', nodeSupported(), process.versions.node],
    ['dsh source', existsSync(CLI), CLI],
    ['Web patch', existsSync(WEB_PATCH), WEB_PATCH],
    ['Headless patch', existsSync(HEADLESS_PATCH), HEADLESS_PATCH],
    ['DeepSeek key', Boolean(process.env.DEEPSEEK_API_KEY), process.env.DEEPSEEK_API_KEY ? 'configured' : 'not configured'],
  ]
  for (const [name, ok, detail] of checks) console.log(`${ok ? 'OK  ' : 'WARN'} ${name}: ${detail}`)
  return checks.slice(0, 4).every(([, ok]) => ok) ? 0 : 1
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv[0] === 'doctor') {
    process.exitCode = doctor()
    return
  }
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    console.log('pnpm oh-my-dsh [web options]\npnpm oh-my-dsh ask <task>\npnpm oh-my-dsh doctor')
    return
  }
  if (!nodeSupported()) throw new Error(`Node.js ${process.versions.node} is unsupported; use 22.19+ or 24+`)
  const invocation = buildOhMyDshInvocation(argv)
  const child = spawn(invocation.command, invocation.args, { cwd: process.cwd(), env: invocation.env, stdio: 'inherit' })
  child.once('error', error => {
    console.error(`oh-my-dsh: ${error.message}`)
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    if (signal !== null) process.kill(process.pid, signal)
    else process.exitCode = code ?? 1
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`oh-my-dsh: ${(error as Error).message}`)
    process.exitCode = 1
  })
}
