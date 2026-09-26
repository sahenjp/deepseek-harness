import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { buildOhMyDshInvocation, nodeSupported } from './oh-my-dsh.ts'
import { applyPersistedRoutes, expandRoleShortcut, formatRoutes, getRoute, parseRouteSelection, persistRoute, readPersistedRoutes, setRoute } from './oh-my-dsh/routes.ts'

describe('oh-my-dsh launcher', () => {
  it('uses the terminal UI by default', () => {
    const invocation = buildOhMyDshInvocation([])
    expect(invocation.args.at(-1)).toMatch(/oh-my-dsh[\\/]tui\.ts$/)
  })

  it('keeps the Web surface explicit', () => {
    const invocation = buildOhMyDshInvocation(['web', '--no-open'])
    expect(invocation.args).toContain('web')
    expect(invocation.args.at(invocation.args.indexOf('--patch') + 1)).toMatch(/web\.patch\.yml$/)
    expect(invocation.args).toContain('--no-open')
  })

  it('runs ask through headless PTC', () => {
    const invocation = buildOhMyDshInvocation(['ask', 'fix tests'], {})
    expect(invocation.args).toContain('headless')
    expect(invocation.args.at(invocation.args.indexOf('--patch') + 1)).toMatch(/headless\.patch\.yml$/)
    expect(invocation.env.DSH_TOOLS_MODE).toBe('ptc')
  })

  it('rejects an empty task', () => {
    expect(() => buildOhMyDshInvocation(['ask'])).toThrow('ask requires a task')
  })

  it('tracks the repository Node floor', () => {
    expect(nodeSupported('22.18.0')).toBe(false)
    expect(nodeSupported('22.19.0')).toBe(true)
    expect(nodeSupported('23.0.0')).toBe(false)
    expect(nodeSupported('24.0.0')).toBe(true)
  })
})

describe('oh-my-dsh routing', () => {
  it('parses provider/model while preserving slashes in model ids', () => {
    expect(parseRouteSelection('openrouter/anthropic/claude-sonnet-4', 'high')).toEqual({
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet-4',
      effort: 'high',
    })
  })

  it('expands role shortcuts into foreground delegation', () => {
    const prompt = expandRoleShortcut('/review inspect the auth diff')
    expect(prompt).toContain('reviewer tool')
    expect(prompt).toContain('run_in_background=false')
    expect(prompt).toContain('inspect the auth diff')
    expect(expandRoleShortcut('/review')).toBeUndefined()
  })

  it('persists routes and keeps ambient overrides higher priority', () => {
    const home = mkdtempSync(join(tmpdir(), 'oh-my-dsh-'))
    try {
      const stored: NodeJS.ProcessEnv = { DSH_HOME: home }
      persistRoute(stored, 'worker', { provider: 'openrouter', model: 'anthropic/claude-sonnet-4', effort: 'high' })

      const fresh: NodeJS.ProcessEnv = { DSH_HOME: home }
      applyPersistedRoutes(fresh)
      expect(getRoute(fresh, 'worker')).toEqual({
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4',
        effort: 'high',
      })

      const ambient: NodeJS.ProcessEnv = {
        DSH_HOME: home,
        OMDSH_WORKER_PROVIDER: 'manual',
        OMDSH_WORKER_MODEL: 'manual-model',
      }
      applyPersistedRoutes(ambient)
      expect(getRoute(ambient, 'worker')).toEqual({ provider: 'manual', model: 'manual-model' })

      persistRoute(stored, 'worker')
      expect(readPersistedRoutes(stored)).toEqual({})
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('sets and clears role routes', () => {
    const env: NodeJS.ProcessEnv = {}
    setRoute(env, 'reviewer', { provider: 'openrouter', model: 'openai/gpt-5', effort: 'high' })
    expect(getRoute(env, 'reviewer')).toEqual({
      provider: 'openrouter',
      model: 'openai/gpt-5',
      effort: 'high',
    })
    expect(formatRoutes(env).find(line => line.startsWith('reviewer'))).toContain('openrouter/openai/gpt-5')
    setRoute(env, 'reviewer')
    expect(getRoute(env, 'reviewer')).toBeUndefined()
    expect(formatRoutes(env).find(line => line.startsWith('reviewer'))).toContain('inherit parent model')
  })
})

describe('oh-my-dsh profile overlays', () => {
  const readPatch = (name: string): unknown => yaml.load(
    readFileSync(resolve(import.meta.dirname, 'oh-my-dsh', name), 'utf8'),
    { schema: entryListSchema },
  )

  it('parses both overlays with the production entry-list schema', () => {
    expect(Array.isArray(readPatch('web.patch.yml'))).toBe(true)
    expect(Array.isArray(readPatch('headless.patch.yml'))).toBe(true)
  })

  it('declares the custom Web preset and all role tools', () => {
    const patch = readPatch('web.patch.yml')
    expect(Array.isArray(patch)).toBe(true)
    if (!Array.isArray(patch)) return
    const inserted = patch.flatMap(row => {
      if (typeof row !== 'object' || row === null || !('insert' in row) || !Array.isArray(row.insert)) return []
      return row.insert
    })
    const preset = inserted.find(row =>
      typeof row === 'object' && row !== null && 'id' in row && row.id === 'preset-oh-my-dsh')
    expect(preset).toBeDefined()
    if (typeof preset !== 'object' || preset === null || !('config' in preset)
      || typeof preset.config !== 'object' || preset.config === null || !('plugins' in preset.config)
      || !Array.isArray(preset.config.plugins)) return
    const delegation = preset.config.plugins.find(row =>
      typeof row === 'object' && row !== null && 'id' in row && row.id === 'delegation')
    expect(delegation).toBeDefined()
    if (typeof delegation !== 'object' || delegation === null || !('config' in delegation)
      || !Array.isArray(delegation.config)) return
    const ids = delegation.config.flatMap(row =>
      typeof row === 'object' && row !== null && 'id' in row && typeof row.id === 'string' ? [row.id] : [])
    expect(ids).toEqual(expect.arrayContaining([
      'oh-my-scout',
      'oh-my-worker',
      'oh-my-reviewer',
      'oh-my-architect',
    ]))
  })
})
