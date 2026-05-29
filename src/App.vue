<script setup>
/**
 * 20×20 貪食蛇 — Vue 3 Composition API 入門範例
 * 重點：ref 狀態、定時器、鍵盤事件、簡單遊戲迴圈
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useGameAudio } from './useGameAudio.js'

const {
  sfxVolume,
  musicVolume,
  ensureContext: ensureAudio,
  playEat,
  playPoisonHurt,
  startBgm,
  stopBgm,
  dispose: disposeAudio,
} = useGameAudio()

const GRID = 20
const TICK_MS = 120
const OBSTACLE_INTERVAL_MS = 10000
const POISON_SHRINK = 2
const MIN_SNAKE_LEN = 3
const FOOD_COUNT = 3
const GOLDEN_FOOD_POINTS = 3
const NORMAL_FOOD_POINTS = 1

/** 電腦蛇強度：easy / normal / hard（預設普通） */
const AI_CONFIG = {
  easy: { moveInterval: 2, smartChance: 0.35 },
  normal: { moveInterval: 1, smartChance: 0.75 },
  hard: { moveInterval: 1, smartChance: 1 },
}

const DIFFICULTIES = [
  { id: 'easy', label: '簡單' },
  { id: 'normal', label: '普通' },
  { id: 'hard', label: '困難' },
]

/** 玩家蛇身：陣列前端是「頭」 */
const snake = ref([
  { x: 9, y: 10 },
  { x: 8, y: 10 },
  { x: 7, y: 10 },
])

/** 電腦蛇 */
const aiSnake = ref([
  { x: 10, y: 5 },
  { x: 11, y: 5 },
  { x: 12, y: 5 },
])

const dir = ref({ dx: 1, dy: 0 })
const nextDir = ref({ dx: 1, dy: 0 })
const aiDir = ref({ dx: -1, dy: 0 })

const foods = ref([])
const poison = ref({ x: 5, y: 10 })
const obstacles = ref([])
const score = ref(0)
const aiScore = ref(0)
const gameOver = ref(false)
const started = ref(false)
const enableAi = ref(true)
const aiDifficulty = ref('normal')
let timer = null
let obstacleTimer = null
let aiMoveCooldown = 0

const canChangeDifficulty = computed(() => !started.value || gameOver.value)

const aiDifficultyLabel = computed(
  () => DIFFICULTIES.find((d) => d.id === aiDifficulty.value)?.label ?? '普通',
)

const sfxVolumePercent = computed({
  get: () => Math.round(sfxVolume.value * 100),
  set: (v) => {
    sfxVolume.value = Math.min(100, Math.max(0, Number(v))) / 100
  },
})

const musicVolumePercent = computed({
  get: () => Math.round(musicVolume.value * 100),
  set: (v) => {
    musicVolume.value = Math.min(100, Math.max(0, Number(v))) / 100
    if (musicVolume.value <= 0) stopBgm()
    else if (started.value && !gameOver.value) startBgm()
  },
})

function onVolumeInput() {
  ensureAudio()
}

const cells = computed(() => {
  const list = []
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      list.push({ x, y })
    }
  }
  return list
})

function isHead(cell) {
  const h = snake.value[0]
  return h && h.x === cell.x && h.y === cell.y
}

function isBody(cell) {
  return snake.value.some((s, i) => i > 0 && s.x === cell.x && s.y === cell.y)
}

function isAiHead(cell) {
  if (!enableAi.value) return false
  const h = aiSnake.value[0]
  return h && h.x === cell.x && h.y === cell.y
}

function isAiBody(cell) {
  if (!enableAi.value) return false
  return aiSnake.value.some((s, i) => i > 0 && s.x === cell.x && s.y === cell.y)
}

function isNormalFood(cell) {
  return foods.value.some(
    (f) => f.kind === 'normal' && f.x === cell.x && f.y === cell.y,
  )
}

function isGoldenFood(cell) {
  return foods.value.some(
    (f) => f.kind === 'golden' && f.x === cell.x && f.y === cell.y,
  )
}

function isPoison(cell) {
  return poison.value.x === cell.x && poison.value.y === cell.y
}

function isObstacle(cell) {
  return obstacles.value.some((o) => o.x === cell.x && o.y === cell.y)
}

const headFaceClass = computed(() => directionFaceClass(dir.value))

const aiHeadFaceClass = computed(() => directionFaceClass(aiDir.value))

function directionFaceClass(d) {
  if (d.dx === 1) return 'face-right'
  if (d.dx === -1) return 'face-left'
  if (d.dy === -1) return 'face-up'
  return 'face-down'
}

function randomInt(max) {
  return Math.floor(Math.random() * max)
}

function posKey(p) {
  return `${p.x},${p.y}`
}

function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by)
}

function isOutOfBounds(x, y) {
  return x < 0 || x >= GRID || y < 0 || y >= GRID
}

function isObstacleAt(x, y) {
  return obstacles.value.some((o) => o.x === x && o.y === y)
}

function isPoisonAt(x, y) {
  return poison.value.x === x && poison.value.y === y
}

function isFoodAt(x, y) {
  return foods.value.some((f) => f.x === x && f.y === y)
}

function getFoodAt(x, y) {
  return foods.value.find((f) => f.x === x && f.y === y) ?? null
}

function foodScorePoints(kind) {
  return kind === 'golden' ? GOLDEN_FOOD_POINTS : NORMAL_FOOD_POINTS
}

function foodTargetDistance(head, food) {
  const d = manhattan(head.x, head.y, food.x, food.y)
  return food.kind === 'golden' ? d - 4 : d
}

function occupiesSnake(body, x, y, ignoreTail) {
  const last = body.length - 1
  return body.some((s, i) => {
    if (ignoreTail && i === last) return false
    return s.x === x && s.y === y
  })
}

function blockedCells() {
  const set = new Set()
  snake.value.forEach((s) => set.add(posKey(s)))
  if (enableAi.value) {
    aiSnake.value.forEach((s) => set.add(posKey(s)))
  }
  foods.value.forEach((f) => set.add(posKey(f)))
  set.add(posKey(poison.value))
  obstacles.value.forEach((o) => set.add(posKey(o)))
  return set
}

function randomEmptyCell(exclude = blockedCells()) {
  let x = 0
  let y = 0
  let guard = 0
  do {
    x = randomInt(GRID)
    y = randomInt(GRID)
    guard++
  } while (exclude.has(`${x},${y}`) && guard < 800)
  if (exclude.has(`${x},${y}`)) return null
  return { x, y }
}

/** 僅在空位生成一顆指定類型的食物（不影響場上其他食物） */
function spawnOneFood(kind) {
  const cell = randomEmptyCell()
  if (cell) foods.value = [...foods.value, { ...cell, kind }]
}

/** 開局時初始化全部食物 */
function initFoods() {
  foods.value = []
  for (let i = 0; i < FOOD_COUNT; i++) {
    spawnOneFood('normal')
  }
  spawnOneFood('golden')
}

function spawnPoison() {
  const cell = randomEmptyCell()
  if (cell) poison.value = cell
}

function addObstacle() {
  const cell = randomEmptyCell()
  if (cell) obstacles.value = [...obstacles.value, cell]
}

function respawnAi() {
  for (let t = 0; t < 80; t++) {
    const head = randomEmptyCell()
    if (!head) return
    const candidate = [
      head,
      { x: head.x - 1, y: head.y },
      { x: head.x - 2, y: head.y },
    ]
    if (
      candidate.every(
        (p) =>
          !isOutOfBounds(p.x, p.y) &&
          !isObstacleAt(p.x, p.y) &&
          !isPoisonAt(p.x, p.y) &&
          !occupiesSnake(snake.value, p.x, p.y, false) &&
          !isFoodAt(p.x, p.y),
      )
    ) {
      aiSnake.value = candidate
      aiDir.value = { dx: 1, dy: 0 }
      return
    }
  }
  aiSnake.value = [
    { x: 10, y: 2 },
    { x: 11, y: 2 },
    { x: 12, y: 2 },
  ]
  aiDir.value = { dx: -1, dy: 0 }
}

function resetGame() {
  snake.value = [
    { x: 9, y: 10 },
    { x: 8, y: 10 },
    { x: 7, y: 10 },
  ]
  aiSnake.value = [
    { x: 10, y: 5 },
    { x: 11, y: 5 },
    { x: 12, y: 5 },
  ]
  dir.value = { dx: 1, dy: 0 }
  nextDir.value = { dx: 1, dy: 0 }
  aiDir.value = { dx: -1, dy: 0 }
  score.value = 0
  aiScore.value = 0
  gameOver.value = false
  obstacles.value = []
  foods.value = []
  aiMoveCooldown = 0
  initFoods()
  spawnPoison()
  addObstacle()
}

function setDifficulty(level) {
  if (!canChangeDifficulty.value || !enableAi.value) return
  aiDifficulty.value = level
}

function setEnableAi(on) {
  if (!canChangeDifficulty.value) return
  enableAi.value = on
}

function shouldAiMoveThisTick() {
  const interval = AI_CONFIG[aiDifficulty.value].moveInterval
  aiMoveCooldown += 1
  if (aiMoveCooldown >= interval) {
    aiMoveCooldown = 0
    return true
  }
  return false
}

function canSnakeEnter(body, otherBody, x, y, willGrow) {
  if (isOutOfBounds(x, y) || isObstacleAt(x, y)) return false
  if (occupiesSnake(otherBody, x, y, false)) return false
  if (occupiesSnake(body, x, y, !willGrow)) return false
  return true
}

function chooseAiDirection() {
  const head = aiSnake.value[0]
  const target = foods.value.reduce((best, f) => {
    const d = foodTargetDistance(head, f)
    if (!best || d < best.dist) return { food: f, dist: d }
    return best
  }, null)?.food

  const cur = aiDir.value
  const options = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ].filter((d) => !(d.dx === -cur.dx && d.dy === -cur.dy))

  const valid = options.filter((d) => {
    const nx = head.x + d.dx
    const ny = head.y + d.dy
    const willGrow = isFoodAt(nx, ny)
    return canSnakeEnter(aiSnake.value, snake.value, nx, ny, willGrow)
  })

  if (valid.length === 0) return cur

  const { smartChance } = AI_CONFIG[aiDifficulty.value]
  if (Math.random() > smartChance) {
    return valid[randomInt(valid.length)]
  }

  if (!target) return valid[randomInt(valid.length)]

  valid.sort((a, b) => {
    const da = manhattan(head.x + a.dx, head.y + a.dy, target.x, target.y)
    const db = manhattan(head.x + b.dx, head.y + b.dy, target.x, target.y)
    return da - db
  })

  const bestDist = manhattan(head.x + valid[0].dx, head.y + valid[0].dy, target.x, target.y)
  const tied = valid.filter(
    (d) => manhattan(head.x + d.dx, head.y + d.dy, target.x, target.y) === bestDist,
  )
  return tied[randomInt(tied.length)]
}

function moveSnake(body, direction, isPlayer) {
  const head = body[0]
  const nx = head.x + direction.dx
  const ny = head.y + direction.dy

  if (isOutOfBounds(nx, ny) || isObstacleAt(nx, ny)) {
    return { ok: false, reason: 'wall' }
  }

  const other = isPlayer
    ? enableAi.value
      ? aiSnake.value
      : []
    : snake.value
  if (other.length > 0 && occupiesSnake(other, nx, ny, false)) {
    return { ok: false, reason: 'snake' }
  }

  const eaten = getFoodAt(nx, ny)
  const eatingFood = eaten != null
  const eatingPoison = isPoisonAt(nx, ny)
  const willGrow = eatingFood

  if (occupiesSnake(body, nx, ny, !willGrow)) {
    return { ok: false, reason: 'self' }
  }

  const nextBody = [{ x: nx, y: ny }, ...body]

  if (eatingFood) {
    const points = foodScorePoints(eaten.kind)
    foods.value = foods.value.filter((f) => !(f.x === nx && f.y === ny))
    spawnOneFood(eaten.kind)
    if (isPlayer) {
      score.value += points
      playEat(eaten.kind)
    } else {
      aiScore.value += points
    }
  } else if (eatingPoison) {
    nextBody.pop()
    for (let i = 0; i < POISON_SHRINK && nextBody.length > MIN_SNAKE_LEN; i++) {
      nextBody.pop()
    }
    if (isPlayer) playPoisonHurt()
    spawnPoison()
  } else {
    nextBody.pop()
  }

  return { ok: true, body: nextBody, newHead: { x: nx, y: ny } }
}

function stopLoop() {
  if (timer != null) {
    clearInterval(timer)
    timer = null
  }
}

function stopObstacleLoop() {
  if (obstacleTimer != null) {
    clearInterval(obstacleTimer)
    obstacleTimer = null
  }
}

function stopAllLoops() {
  stopLoop()
  stopObstacleLoop()
}

function tick() {
  if (!started.value || gameOver.value) return

  const nd = nextDir.value
  const cur = dir.value
  if (!(nd.dx === -cur.dx && nd.dy === -cur.dy)) {
    dir.value = { ...nd }
  }

  const playerResult = moveSnake(snake.value, dir.value, true)
  if (!playerResult.ok) {
    gameOver.value = true
    stopAllLoops()
    stopBgm()
    return
  }
  snake.value = playerResult.body

  if (!enableAi.value) return

  if (!shouldAiMoveThisTick()) return

  aiDir.value = chooseAiDirection()

  const aiResult = moveSnake(aiSnake.value, aiDir.value, false)
  if (!aiResult.ok) {
    respawnAi()
    return
  }
  aiSnake.value = aiResult.body

  const ph = playerResult.newHead
  const ah = aiResult.newHead
  if (ph.x === ah.x && ph.y === ah.y) {
    gameOver.value = true
    stopAllLoops()
    stopBgm()
  }
}

function startLoop() {
  stopLoop()
  timer = setInterval(tick, TICK_MS)
}

function startObstacleLoop() {
  stopObstacleLoop()
  obstacleTimer = setInterval(() => {
    if (!started.value || gameOver.value) return
    addObstacle()
  }, OBSTACLE_INTERVAL_MS)
}

function start() {
  ensureAudio()
  started.value = true
  resetGame()
  startLoop()
  startObstacleLoop()
  startBgm()
}

function restart() {
  ensureAudio()
  resetGame()
  startLoop()
  startObstacleLoop()
  startBgm()
}

function setDirection(dx, dy) {
  nextDir.value = { dx, dy }
}

function onKeydown(e) {
  if (e.key === ' ') {
    e.preventDefault()
    if (!started.value) {
      start()
    } else if (gameOver.value) {
      restart()
    }
    return
  }
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
      e.preventDefault()
      setDirection(0, -1)
      break
    case 'ArrowDown':
    case 's':
      e.preventDefault()
      setDirection(0, 1)
      break
    case 'ArrowLeft':
    case 'a':
      e.preventDefault()
      setDirection(-1, 0)
      break
    case 'ArrowRight':
    case 'd':
      e.preventDefault()
      setDirection(1, 0)
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  stopAllLoops()
  disposeAudio()
})
</script>

<template>
  <div class="page">
    <header class="header">
      <h1 class="title">貪食蛇</h1>
      <p class="subtitle">紅食 +1、金食 +3；橘色電腦蛇會搶食；紫毒縮短、灰牆障礙</p>
    </header>

    <section class="panel">
      <div class="stats">
        <span>玩家：<strong>{{ score }}</strong></span>
        <span v-if="enableAi">電腦：<strong>{{ aiScore }}</strong></span>
        <span>食物：<strong>{{ foods.length }}</strong></span>
        <span>障礙：<strong>{{ obstacles.length }}</strong></span>
        <span v-if="started && !gameOver" class="badge muted">進行中</span>
        <span v-else-if="gameOver" class="badge danger">遊戲結束</span>
        <span v-else class="badge muted">尚未開始</span>
        <span v-if="enableAi" class="badge">強度：{{ aiDifficultyLabel }}</span>
      </div>

      <div class="difficulty">
        <span class="difficulty-label">電腦玩家</span>
        <div class="difficulty-btns">
          <button
            type="button"
            class="btn diff"
            :class="{ active: enableAi }"
            :disabled="!canChangeDifficulty"
            @click="setEnableAi(true)"
          >
            有
          </button>
          <button
            type="button"
            class="btn diff"
            :class="{ active: !enableAi }"
            :disabled="!canChangeDifficulty"
            @click="setEnableAi(false)"
          >
            無
          </button>
        </div>
      </div>

      <div class="difficulty">
        <span class="difficulty-label">電腦強度</span>
        <div class="difficulty-btns">
          <button
            v-for="d in DIFFICULTIES"
            :key="d.id"
            type="button"
            class="btn diff"
            :class="{ active: aiDifficulty === d.id }"
            :disabled="!canChangeDifficulty || !enableAi"
            @click="setDifficulty(d.id)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>

      <div class="audio-controls">
        <label class="volume-row">
          <span class="volume-label">音效音量</span>
          <input
            v-model.number="sfxVolumePercent"
            type="range"
            min="0"
            max="100"
            class="volume-slider"
            @input="onVolumeInput"
          />
          <span class="volume-value">{{ sfxVolumePercent }}%</span>
        </label>
        <label class="volume-row">
          <span class="volume-label">背景音樂</span>
          <input
            v-model.number="musicVolumePercent"
            type="range"
            min="0"
            max="100"
            class="volume-slider"
            @input="onVolumeInput"
          />
          <span class="volume-value">{{ musicVolumePercent }}%</span>
        </label>
      </div>

      <div class="actions">
        <button v-if="!started" type="button" class="btn primary" @click="start">
          開始遊戲（空白鍵）
        </button>
        <button v-else type="button" class="btn primary" @click="restart">
          {{ gameOver ? '重新開始（空白鍵）' : '重新開始' }}
        </button>
      </div>
    </section>

    <div
      class="board"
      :class="{ dim: gameOver }"
      role="application"
      aria-label="貪食蛇遊戲區域，共二十乘二十格"
    >
      <div
        v-for="(cell, i) in cells"
        :key="i"
        class="cell"
        :class="{
          head: isHead(cell),
          body: isBody(cell),
          'ai-head': isAiHead(cell),
          'ai-body': isAiBody(cell),
          food: isNormalFood(cell),
          'golden-food': isGoldenFood(cell),
          poison: isPoison(cell),
          obstacle: isObstacle(cell),
        }"
      >
        <div
          v-if="isHead(cell)"
          class="head-eyes"
          :class="headFaceClass"
          aria-hidden="true"
        >
          <span class="snake-eye"><span class="pupil" /></span>
          <span class="snake-eye"><span class="pupil" /></span>
        </div>
        <div
          v-if="isAiHead(cell)"
          class="head-eyes"
          :class="aiHeadFaceClass"
          aria-hidden="true"
        >
          <span class="snake-eye"><span class="pupil" /></span>
          <span class="snake-eye"><span class="pupil" /></span>
        </div>
      </div>
    </div>

    <footer class="help">
      <div class="help-block">
        <strong>操作：</strong>
        <ul class="help-list">
          <li>按下空白鍵開始遊戲或重新開始</li>
          <li>方向鍵或 WASD 移動</li>
          <li>進行中無法切換電腦玩家與強度</li>
          <li>開始遊戲後會播放背景音樂</li>
          <li>玩家吃到食物或毒藥有音效，可用滑桿調整音量</li>
        </ul>
      </div>
      <div class="help-block">
        <strong>規則：</strong>
        <ul class="help-list">
          <li>場上 {{ FOOD_COUNT }} 顆紅色食物各 +1 分，另有 1 顆金色食物 +3 分</li>
          <li>可選擇是否有電腦玩家搶食</li>
          <li>有電腦時，撞到電腦蛇或與其頭相撞會結束</li>
          <li>紫色毒藥會縮短身體</li>
          <li>灰色障礙每 {{ OBSTACLE_INTERVAL_MS / 1000 }} 秒增加一個</li>
        </ul>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 48px;
  font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 20px;
}

.title {
  margin: 0 0 8px;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.95rem;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.difficulty {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.difficulty-label {
  font-size: 0.9rem;
  color: #64748b;
}

.difficulty-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.audio-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.volume-row {
  display: grid;
  grid-template-columns: 5.5rem 1fr 2.5rem;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
  color: #475569;
}

.volume-label {
  white-space: nowrap;
}

.volume-slider {
  width: 100%;
  accent-color: #22c55e;
  cursor: pointer;
}

.volume-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  font-size: 0.85rem;
}

.btn.diff {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.btn.diff.active {
  border-color: #ea580c;
  background: #fff7ed;
  color: #c2410c;
  font-weight: 600;
}

.btn.diff:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
  font-size: 1rem;
}

.badge {
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
}

.badge.muted {
  background: #f1f5f9;
  color: #64748b;
}

.badge.danger {
  background: #fee2e2;
  color: #b91c1c;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.btn {
  cursor: pointer;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.btn:hover {
  background: #f8fafc;
}

.btn.primary {
  border-color: #22c55e;
  background: #22c55e;
  color: #fff;
}

.btn.primary:hover {
  filter: brightness(1.05);
}

.board {
  display: grid;
  grid-template-columns: repeat(20, 1fr);
  grid-template-rows: repeat(20, 1fr);
  width: min(96vw, 600px);
  aspect-ratio: 1;
  margin: 0 auto;
  gap: 2px;
  padding: 8px;
  border-radius: 12px;
  background: #0f172a;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.25);
  transition: opacity 0.2s ease;
}

.board.dim {
  opacity: 0.55;
}

.cell {
  border-radius: 4px;
  background: #1e293b;
}

.cell.body {
  background: linear-gradient(145deg, #4ade80, #16a34a);
}

.cell.head,
.cell.ai-head {
  position: relative;
  overflow: hidden;
}

.cell.head {
  background: linear-gradient(145deg, #86efac, #22c55e);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
}

.cell.ai-head {
  background: linear-gradient(145deg, #fdba74, #ea580c);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}

.cell.ai-body {
  background: linear-gradient(145deg, #fb923c, #c2410c);
}

.head-eyes {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12%;
  padding: 18%;
  box-sizing: border-box;
  pointer-events: none;
}

.snake-eye {
  position: relative;
  flex: 1 1 0;
  height: 55%;
  max-height: 14px;
  min-width: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    inset 0 -1px 2px rgba(0, 0, 0, 0.12),
    0 1px 1px rgba(255, 255, 255, 0.4);
}

.pupil {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 44%;
  height: 44%;
  border-radius: 50%;
  background: #0f172a;
  transform: translate(-50%, -50%);
  transition: transform 0.08s ease-out;
}

/* 瞳孔略朝移動方向偏，看起來像在「看路」 */
.head-eyes.face-right .pupil {
  transform: translate(-25%, -50%);
}

.head-eyes.face-left .pupil {
  transform: translate(-75%, -50%);
}

.head-eyes.face-up .pupil {
  transform: translate(-50%, -78%);
}

.head-eyes.face-down .pupil {
  transform: translate(-50%, -22%);
}

/* 直行時兩眼略往內側排，橫行時維持左右並排 */
.head-eyes.face-up,
.head-eyes.face-down {
  flex-direction: row;
  padding-left: 22%;
  padding-right: 22%;
}

.cell.food {
  background: radial-gradient(circle at 30% 30%, #fca5a5, #dc2626);
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.7);
}

.cell.golden-food {
  background: radial-gradient(circle at 30% 30%, #fde68a, #d97706);
  box-shadow: 0 0 10px rgba(251, 191, 36, 0.9);
}

.cell.poison {
  background: radial-gradient(circle at 30% 30%, #d8b4fe, #7c3aed);
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.75);
}

.cell.obstacle {
  background: linear-gradient(145deg, #64748b, #334155);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
}

.help {
  margin-top: 20px;
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.55;
}

.help-block {
  margin: 0 0 12px;
}

.help-block:last-child {
  margin-bottom: 0;
}

.help-block strong {
  display: block;
  margin-bottom: 4px;
}

.help-list {
  margin: 0;
  padding-left: 1.25rem;
}

.help-list li {
  margin-bottom: 4px;
}

.help-list li:last-child {
  margin-bottom: 0;
}
</style>
