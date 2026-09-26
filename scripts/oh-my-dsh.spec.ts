import { describe, expect, it } from 'vitest'
import { buildOhMyDshInvocation, nodeSupported } from './oh-my-dsh.ts'

describe('oh-my-dsh launcher', () => {
  it('uses the Web profile and overlay by default', () => {
    const invocation = buildOhMyDshInvocation([])
    expect(invocation.args).toContain('web')
    expect(invocation.args.at(invocation.args.indexOf('--patch') + 1)).toMatch(/web\.patch\.yml$/)
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
