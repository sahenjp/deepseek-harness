import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const ROUTE_ROLES = ['scout', 'worker', 'reviewer', 'architect'] as const

export type RouteRole = typeof ROUTE_ROLES[number]

export interface RouteSelection {
  readonly provider: string
  readonly model: string
  readonly effort?: string
}

interface RouteDocument {
  readonly version: 1
  readonly routes: Partial<Record<RouteRole, RouteSelection>>
}

const PREFIX: Record<RouteRole, string> = {
  scout: 'OMDSH_SCOUT',
  worker: 'OMDSH_WORKER',
  reviewer: 'OMDSH_REVIEWER',
  architect: 'OMDSH_ARCHITECT',
}

const ROLE_COMMANDS: Readonly<Record<string, RouteRole>> = {
  scout: 'scout',
  worker: 'worker',
  review: 'reviewer',
  reviewer: 'reviewer',
  architect: 'architect',
}

export function parseRouteRole(value: string): RouteRole | undefined {
  return ROUTE_ROLES.find(role => role === value)
}

export function parseRouteSelection(value: string, effort?: string): RouteSelection {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) throw new Error('route must be <provider>/<model>')
  const provider = value.slice(0, slash).trim()
  const model = value.slice(slash + 1).trim()
  if (provider === '' || model === '') throw new Error('route must be <provider>/<model>')
  return { provider, model, ...(effort === undefined || effort === '' ? {} : { effort }) }
}

export function setRoute(env: NodeJS.ProcessEnv, role: RouteRole, selection?: RouteSelection): void {
  const prefix = PREFIX[role]
  if (selection === undefined) {
    delete env[`${prefix}_PROVIDER`]
    delete env[`${prefix}_MODEL`]
    delete env[`${prefix}_EFFORT`]
    return
  }
  env[`${prefix}_PROVIDER`] = selection.provider
  env[`${prefix}_MODEL`] = selection.model
  if (selection.effort === undefined) delete env[`${prefix}_EFFORT`]
  else env[`${prefix}_EFFORT`] = selection.effort
}

export function getRoute(env: NodeJS.ProcessEnv, role: RouteRole): RouteSelection | undefined {
  const prefix = PREFIX[role]
  const provider = env[`${prefix}_PROVIDER`]
  const model = env[`${prefix}_MODEL`]
  if (provider === undefined || model === undefined) return undefined
  const effort = env[`${prefix}_EFFORT`]
  return { provider, model, ...(effort === undefined ? {} : { effort }) }
}

export function routeConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const dshHome = env.DSH_HOME === undefined || env.DSH_HOME.trim() === ''
    ? join(homedir(), '.dsh')
    : env.DSH_HOME
  return join(dshHome, 'oh-my-dsh', 'routes.json')
}

function routeSelection(value: unknown): RouteSelection | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const provider = 'provider' in value && typeof value.provider === 'string' ? value.provider.trim() : ''
  const model = 'model' in value && typeof value.model === 'string' ? value.model.trim() : ''
  const effort = 'effort' in value && typeof value.effort === 'string' ? value.effort.trim() : undefined
  if (provider === '' || model === '') return undefined
  return { provider, model, ...(effort === undefined || effort === '' ? {} : { effort }) }
}

export function readPersistedRoutes(env: NodeJS.ProcessEnv = process.env): Partial<Record<RouteRole, RouteSelection>> {
  const path = routeConfigPath(env)
  if (!existsSync(path)) return {}
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || !('version' in value) || value.version !== 1 || !('routes' in value)
    || typeof value.routes !== 'object' || value.routes === null || Array.isArray(value.routes)) {
    throw new Error(`invalid route config: ${path}`)
  }
  const routes: Partial<Record<RouteRole, RouteSelection>> = {}
  for (const role of ROUTE_ROLES) {
    const raw = role in value.routes ? (value.routes as Record<string, unknown>)[role] : undefined
    if (raw === undefined) continue
    const selection = routeSelection(raw)
    if (selection === undefined) throw new Error(`invalid ${role} route in ${path}`)
    routes[role] = selection
  }
  return routes
}

export function applyPersistedRoutes(env: NodeJS.ProcessEnv = process.env): void {
  const routes = readPersistedRoutes(env)
  for (const role of ROUTE_ROLES) {
    const prefix = PREFIX[role]
    if (env[`${prefix}_PROVIDER`] !== undefined || env[`${prefix}_MODEL`] !== undefined) continue
    const selection = routes[role]
    if (selection !== undefined) setRoute(env, role, selection)
  }
}

export function persistRoute(
  env: NodeJS.ProcessEnv,
  role: RouteRole,
  selection?: RouteSelection,
): void {
  const path = routeConfigPath(env)
  const routes = readPersistedRoutes(env)
  if (selection === undefined) delete routes[role]
  else routes[role] = selection
  const document: RouteDocument = { version: 1, routes }
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
  setRoute(env, role, selection)
}

export function formatRoutes(env: NodeJS.ProcessEnv): string[] {
  return ROUTE_ROLES.map(role => {
    const route = getRoute(env, role)
    return route === undefined
      ? `${role.padEnd(9)} inherit parent model`
      : `${role.padEnd(9)} ${route.provider}/${route.model}${route.effort === undefined ? '' : ` [${route.effort}]`}`
  })
}

export function expandRoleShortcut(input: string): string | undefined {
  const match = /^\/(scout|worker|review|reviewer|architect)\s+([\s\S]+)$/.exec(input.trim())
  if (match === null) return undefined
  const role = ROLE_COMMANDS[match[1] ?? '']
  const task = match[2]?.trim()
  if (role === undefined || task === undefined || task === '') return undefined
  return [
    `Immediately delegate the following task using the ${role} tool.`,
    'Set run_in_background=false so this turn waits for the specialist result.',
    'Use the specialist result directly; do not repeat the same work unless verification is needed.',
    '',
    task,
  ].join('\n')
}
