export const ROUTE_ROLES = ['main', 'scout', 'worker', 'reviewer', 'architect'] as const

export type RouteRole = typeof ROUTE_ROLES[number]

export interface RouteSelection {
  readonly provider: string
  readonly model: string
  readonly effort?: string
}

const PREFIX: Record<RouteRole, string> = {
  main: 'OMDSH_MAIN',
  scout: 'OMDSH_SCOUT',
  worker: 'OMDSH_WORKER',
  reviewer: 'OMDSH_REVIEWER',
  architect: 'OMDSH_ARCHITECT',
}

export function parseRouteRole(value: string): RouteRole | undefined {
  return ROUTE_ROLES.find(role => role === value)
}

export function parseRouteSelection(value: string, effort?: string): RouteSelection {
  const slash = value.indexOf('/')
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error('route must be <provider>/<model>')
  }
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

export function formatRoutes(env: NodeJS.ProcessEnv): string[] {
  return ROUTE_ROLES.map(role => {
    const route = getRoute(env, role)
    if (route === undefined && role === 'main') return `${role.padEnd(9)} deepseek-official/deepseek-flash (default)`
    return route === undefined
      ? `${role.padEnd(9)} inherit`
      : `${role.padEnd(9)} ${route.provider}/${route.model}${route.effort === undefined ? '' : ` [${route.effort}]`}`
  })
}
