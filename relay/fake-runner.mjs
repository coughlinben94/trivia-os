// Test-only stand-in for local.mjs's runner: records every call, keeps a
// pretend volume, and hands back killable fake afplay children. Never runs
// a real program.
export function fakeRunner({ volume = 60, failWith = null } = {}) {
  const r = {
    volume, calls: [], children: [],
    async run(file, args) {
      r.calls.push([file, args])
      if (failWith) throw new Error(failWith)
      const script = args[1]
      if (script === 'output volume of (get volume settings)') return `${r.volume}\n`
      const m = /^set volume output volume (\d+)$/.exec(script)
      if (m) { r.volume = Number(m[1]); return '' }
      throw new Error(`unexpected script ${script}`)
    },
    spawn(file, args) {
      r.calls.push([file, args])
      const child = { file, args, killed: false, exits: [] }
      child.kill = () => { child.killed = true; child.exits.forEach(f => f()) }
      child.onExit = f => child.exits.push(f)
      r.children.push(child)
      return child
    },
  }
  return r
}
