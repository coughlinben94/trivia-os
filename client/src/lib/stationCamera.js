// Renderer-neutral station camera (Halloween forest spec §2.1). Owns the machine RingAmbient
// used to inline: current station, the busy lock, the pending-turn queue, and walk completion.
// Pure JS, no timers: the RENDERER owns time. startWalk() returns a cancel function and calls
// done() when its walk ends (space: its SURGE_MS+60 timer; forest: its walk.durMs timer; or
// synchronously, as the reduced-motion branch does). Each walk gets a token; a done() from any
// walk that is no longer current is ignored, so a stale timer can never release a later walk's lock.
//
// renderer = {
//   startWalk(from, to, dir, done) -> cancel?   begin one step; call done() when finished
//   snap(from, to)                              instant move (jumpTo); must leave nothing in flight
//   cut(from, to, done) -> cancel?              'retarget' only: covered cut to a new station
// }
// queuePolicy 'drain'   (space, present behavior): a turn() while busy is queued as one step and
//                        drained in order, one per completed walk.
// queuePolicy 'retarget' (forest): a turn() while busy cancels the running walk and cuts straight
//                        to station+dir; advances during a cut retarget it again. Nothing queues.
export function createStationCamera({ panes, renderer, queuePolicy = 'drain', initialStation = 0 }) {
  if (queuePolicy === 'retarget' && typeof renderer.cut !== 'function') {
    throw new Error("stationCamera: queuePolicy 'retarget' needs renderer.cut()")
  }
  const mod = (n) => ((n % panes) + panes) % panes
  let station = mod(initialStation)
  let busy = false
  let queue = []
  let cancelWalk = null
  let token = null

  function begin(run) {
    const mine = {}
    token = mine
    cancelWalk = null
    const done = () => {
      if (token !== mine) return // stale: the walk was cancelled or superseded
      token = null
      cancelWalk = null
      busy = false
      if (queue.length > 0) turn(queue.shift())
    }
    const cancel = run(done)
    // done() may already have fired synchronously; only keep cancel for a walk still running
    if (token === mine) cancelWalk = cancel || null
  }

  function stop() {
    if (cancelWalk) cancelWalk()
    cancelWalk = null
    token = null
  }

  function turn(dir = 1) {
    if (busy) {
      if (queuePolicy === 'drain') { queue.push(dir); return }
      stop() // retarget: abandon the running walk/cut, aim at the latest request
      const from = station
      station = mod(station + dir)
      begin((done) => renderer.cut(from, station, done))
      return
    }
    busy = true
    const from = station
    station = mod(station + dir)
    begin((done) => renderer.startWalk(from, station, dir, done))
  }

  // Authoritative: cancels the running walk and the queue, snaps, clears busy.
  function jumpTo(target) {
    stop()
    busy = false
    queue = []
    const from = station
    station = mod(Math.trunc(target))
    renderer.snap(from, station)
  }

  // Unmount: cancel anything in flight without moving.
  function dispose() { stop(); busy = false; queue = [] }

  return { turn, jumpTo, dispose, get station() { return station }, get busy() { return busy } }
}
