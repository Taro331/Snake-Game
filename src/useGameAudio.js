import { ref, watch } from 'vue'

/** 模組級單例，全遊戲共用同一套音訊 */
let ctx = null
let sfxGain = null
let musicGain = null
let bgmTimer = null
let bgmRunning = false
let bgmStep = 0

const sfxVolume = ref(0.75)
const musicVolume = ref(0.35)

/** 簡短循環旋律（Hz） */
const BGM_NOTES = [262, 330, 392, 523, 392, 330, 294, 349]

function applyGainLevels() {
  if (!sfxGain || !musicGain) return
  sfxGain.gain.value = sfxVolume.value
  musicGain.gain.value = musicVolume.value
}

watch([sfxVolume, musicVolume], applyGainLevels)

function ensureContext() {
  if (!ctx) {
    ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = 1
    master.connect(ctx.destination)

    sfxGain = ctx.createGain()
    musicGain = ctx.createGain()
    sfxGain.connect(master)
    musicGain.connect(master)
    applyGainLevels()
  }
  if (ctx.state === 'suspended') {
    ctx.resume()
  }
}

function playTone({ frequency, type, start, duration, peak }) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** 玩家吃到毒藥時播放（下降音，受傷感） */
function playPoisonHurt() {
  if (sfxVolume.value <= 0) return
  ensureContext()
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(320, t)
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.22)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
  osc.connect(g)
  g.connect(sfxGain)
  osc.start(t)
  osc.stop(t + 0.26)
  playTone({ frequency: 196, type: 'square', start: t + 0.06, duration: 0.1, peak: 0.14 })
}

/** 玩家吃到食物時播放 */
function playEat(kind) {
  if (sfxVolume.value <= 0) return
  ensureContext()
  const t = ctx.currentTime
  if (kind === 'golden') {
    playTone({ frequency: 523.25, type: 'square', start: t, duration: 0.07, peak: 0.22 })
    playTone({ frequency: 659.25, type: 'square', start: t + 0.07, duration: 0.07, peak: 0.2 })
    playTone({ frequency: 783.99, type: 'square', start: t + 0.14, duration: 0.1, peak: 0.18 })
  } else {
    playTone({ frequency: 440, type: 'square', start: t, duration: 0.05, peak: 0.2 })
    playTone({ frequency: 554.37, type: 'square', start: t + 0.05, duration: 0.08, peak: 0.16 })
  }
}

function playBgmNote() {
  if (!bgmRunning || musicVolume.value <= 0 || !ctx) return
  const freq = BGM_NOTES[bgmStep % BGM_NOTES.length]
  bgmStep += 1
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, t)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.03)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
  osc.connect(g)
  g.connect(musicGain)
  osc.start(t)
  osc.stop(t + 0.4)
}

function startBgm() {
  if (musicVolume.value <= 0) return
  ensureContext()
  if (bgmRunning) return
  bgmRunning = true
  bgmStep = 0
  playBgmNote()
  bgmTimer = setInterval(playBgmNote, 420)
}

function stopBgm() {
  bgmRunning = false
  if (bgmTimer != null) {
    clearInterval(bgmTimer)
    bgmTimer = null
  }
}

function dispose() {
  stopBgm()
  if (ctx) {
    ctx.close().catch(() => {})
    ctx = null
    sfxGain = null
    musicGain = null
  }
}

export function useGameAudio() {
  return {
    sfxVolume,
    musicVolume,
    ensureContext,
    playEat,
    playPoisonHurt,
    startBgm,
    stopBgm,
    dispose,
  }
}
