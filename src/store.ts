
import { create } from 'zustand'

export type Vec2 = { x: number; y: number }

export type Arena = {
  shape: 'circle' | 'rect'
  radius: number
  size: number
}

export type EntityType = 'boss' | 'player' | 'item' | 'marker'

export type MotionPoint = { x: number; y: number; atMs: number }

export type Motion =
  | { kind: 'none' }
  | { kind: 'path'; points: MotionPoint[]; loop?: boolean; alignRotation?: boolean }

type BaseEntity = {
  id: string
  type: EntityType
  position: Vec2
  zIndex: number
  motion?: Motion
}

export type BossEntity = BaseEntity & { type: 'boss' }
export type PlayerEntity = BaseEntity & { type: 'player' }
export type ItemEntity = BaseEntity & { type: 'item' }
export type MarkerEntity = BaseEntity & { type: 'marker'; text: string }

export type Entity = BossEntity | PlayerEntity | ItemEntity | MarkerEntity

export type AoEShape =
  | 'circle'
  | 'semicircle'
  | 'sector'
  | 'rect'
  | 'line'
  | 'ring'

type AoECircleParams = { radius: number }
type AoESemiCircleParams = { radius: number }
type AoESectorParams = { radius: number; angle: number }
type AoERectParams = { width: number; height: number }
type AoELineParams = { length: number; width: number }
type AoERingParams = { innerRadius: number; outerRadius: number }

export type AoETiming = {
  startAtMs: number
  delayMs: number
  durationMs: number
}

type AoEBase = {
  id: string
  type: 'aoe'
  position: Vec2
  rotation: number
  timing: AoETiming
  zIndex: number
  sourceActionId?: string
}

export type AoE =
  | (AoEBase & { shape: 'circle'; shapeParams: AoECircleParams })
  | (AoEBase & { shape: 'semicircle'; shapeParams: AoESemiCircleParams })
  | (AoEBase & { shape: 'sector'; shapeParams: AoESectorParams })
  | (AoEBase & { shape: 'rect'; shapeParams: AoERectParams })
  | (AoEBase & { shape: 'line'; shapeParams: AoELineParams })
  | (AoEBase & { shape: 'ring'; shapeParams: AoERingParams })

export type BossActionPayload = {
  shape: AoEShape
  positionMode: 'position' | 'offset'
  position?: Vec2
  offset?: Vec2
  rotation: number
  shapeParams:
    | AoECircleParams
    | AoESemiCircleParams
    | AoESectorParams
    | AoERectParams
    | AoELineParams
    | AoERingParams
  delayMs: number
  durationMs: number
}

export type BossAction = {
  id: string
  atMs: number
  type: 'spawnAoE'
  payload: BossActionPayload
  executed: boolean
}

type Selection =
  | { kind: 'entity'; id: string }
  | { kind: 'aoe'; id: string }
  | null

type Placement =
  | { mode: 'entity'; entityType: EntityType }
  | { mode: 'aoe'; shape: AoEShape }
  | null

export type ToolMode = 'select' | 'path'

export type SceneExport = {
  arena: Arena
  entities: Entity[]
  aoes: AoE[]
  actions: BossAction[]
  timelineDurationMs: number
}

let idCounter = 0
const createId = () => {
  idCounter += 1
  return `id_${Date.now()}_${idCounter}`
}

const getDefaultShapeParams = (shape: AoEShape) => {
  switch (shape) {
    case 'circle':
      return { radius: 120 }
    case 'semicircle':
      return { radius: 150 }
    case 'sector':
      return { radius: 200, angle: 90 }
    case 'rect':
      return { width: 180, height: 80 }
    case 'line':
      return { length: 240, width: 30 }
    case 'ring':
      return { innerRadius: 60, outerRadius: 140 }
    default:
      return { radius: 120 }
  }
}

const createAoE = (shape: AoEShape, position: Vec2): AoE => {
  const timing: AoETiming = {
    startAtMs: 0,
    delayMs: 0,
    durationMs: 4000,
  }
  return {
    id: createId(),
    type: 'aoe',
    shape,
    shapeParams: getDefaultShapeParams(shape) as AoE['shapeParams'],
    position,
    rotation: 0,
    timing,
    zIndex: 1,
  } as AoE
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const findBoss = (entities: Entity[]) =>
  entities.find((entity) => entity.type === 'boss')

const spawnAoEFromAction = (action: BossAction, entities: Entity[]): AoE => {
  const boss = findBoss(entities)
  const payload = action.payload
  const basePosition: Vec2 =
    payload.positionMode === 'position'
      ? payload.position ?? { x: 0, y: 0 }
      : {
          x: (boss?.position.x ?? 0) + (payload.offset?.x ?? 0),
          y: (boss?.position.y ?? 0) + (payload.offset?.y ?? 0),
        }
  return {
    id: createId(),
    type: 'aoe',
    shape: payload.shape,
    shapeParams: payload.shapeParams as AoE['shapeParams'],
    position: basePosition,
    rotation: payload.rotation,
    timing: {
      startAtMs: action.atMs,
      delayMs: payload.delayMs,
      durationMs: payload.durationMs,
    },
    zIndex: 1,
    sourceActionId: action.id,
  } as AoE
}
const defaultArena: Arena = {
  shape: 'circle',
  radius: 320,
  size: 520,
}

const defaultEntities: Entity[] = [
  {
    id: createId(),
    type: 'boss',
    position: { x: 0, y: 0 },
    zIndex: 2,
    motion: { kind: 'none' },
  },
  {
    id: createId(),
    type: 'player',
    position: { x: -120, y: 80 },
    zIndex: 1,
    motion: { kind: 'none' },
  },
  {
    id: createId(),
    type: 'player',
    position: { x: 140, y: -60 },
    zIndex: 1,
    motion: { kind: 'none' },
  },
]

const defaultActions: BossAction[] = [
  {
    id: createId(),
    atMs: 2000,
    type: 'spawnAoE',
    executed: false,
    payload: {
      shape: 'circle',
      positionMode: 'offset',
      offset: { x: 120, y: 0 },
      rotation: 0,
      shapeParams: { radius: 120 },
      delayMs: 0,
      durationMs: 3000,
    },
  },
  {
    id: createId(),
    atMs: 6000,
    type: 'spawnAoE',
    executed: false,
    payload: {
      shape: 'sector',
      positionMode: 'offset',
      offset: { x: 0, y: 0 },
      rotation: 45,
      shapeParams: { radius: 200, angle: 90 },
      delayMs: 500,
      durationMs: 4000,
    },
  },
]

type StoreState = {
  arena: Arena
  entities: Entity[]
  aoes: AoE[]
  actions: BossAction[]
  selection: Selection
  placement: Placement
  toolMode: ToolMode
  simulationTimeMs: number
  timelineDurationMs: number
  playing: boolean
  setPlacement: (placement: Placement) => void
  clearPlacement: () => void
  setToolMode: (mode: ToolMode) => void
  addEntityAt: (type: EntityType, position: Vec2) => void
  addAoeAt: (shape: AoEShape, position: Vec2) => void
  selectEntity: (id: string) => void
  selectAoe: (id: string) => void
  clearSelection: () => void
  updateEntity: (id: string, patch: Partial<Entity>) => void
  updateAoe: (id: string, patch: Partial<AoE>) => void
  updateArena: (patch: Partial<Arena>) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  setSimulationTimeMs: (value: number | ((prev: number) => number)) => void
  resetSimulation: () => void
  play: () => void
  pause: () => void
  addAction: () => void
  updateAction: (id: string, patch: Partial<BossAction>) => void
  removeAction: (id: string) => void
  exportScene: () => SceneExport
  importScene: (raw: string) => void
}

const processActions = (
  timeMs: number,
  state: { actions: BossAction[]; aoes: AoE[]; entities: Entity[] },
) => {
  let nextActions = state.actions
  let nextAoes = state.aoes
  let didChange = false

  for (const action of state.actions) {
    if (!action.executed && timeMs >= action.atMs) {
      const spawned = spawnAoEFromAction(action, state.entities)
      nextAoes = [...nextAoes, spawned]
      nextActions = nextActions.map((item) =>
        item.id === action.id ? { ...item, executed: true } : item,
      )
      didChange = true
    }
  }

  return didChange
    ? { actions: nextActions, aoes: nextAoes }
    : { actions: state.actions, aoes: state.aoes }
}

export const useStore = create<StoreState>((set, get) => ({
  arena: defaultArena,
  entities: defaultEntities,
  aoes: [],
  actions: defaultActions,
  selection: null,
  placement: null,
  toolMode: 'select',
  simulationTimeMs: 0,
  timelineDurationMs: 120000,
  playing: false,
  setPlacement: (placement) => set({ placement }),
  clearPlacement: () => set({ placement: null }),
  setToolMode: (mode) => set({ toolMode: mode }),
  addEntityAt: (type, position) =>
    set((state) => {
      const zIndex = Math.max(0, ...state.entities.map((item) => item.zIndex)) + 1
      const base: BaseEntity = {
        id: createId(),
        type,
        position,
        zIndex,
        motion: { kind: 'none' },
      }
      const entity: Entity =
        type === 'marker'
          ? { ...base, type: 'marker', text: '1' }
          : (base as Entity)
      return {
        entities: [...state.entities, entity],
        selection: { kind: 'entity', id: entity.id },
      }
    }),
  addAoeAt: (shape, position) =>
    set((state) => {
      const zIndex = Math.max(0, ...state.aoes.map((item) => item.zIndex)) + 1
      const aoe = createAoE(shape, position)
      aoe.timing.startAtMs = state.simulationTimeMs
      aoe.zIndex = zIndex
      return {
        aoes: [...state.aoes, aoe],
        selection: { kind: 'aoe', id: aoe.id },
      }
    }),
  selectEntity: (id) =>
    set((state) => {
      const maxZ = Math.max(0, ...state.entities.map((item) => item.zIndex)) + 1
      return {
        entities: state.entities.map((item) =>
          item.id === id ? { ...item, zIndex: maxZ } : item,
        ),
        selection: { kind: 'entity', id },
      }
    }),
  selectAoe: (id) =>
    set((state) => {
      const maxZ = Math.max(0, ...state.aoes.map((item) => item.zIndex)) + 1
      return {
        aoes: state.aoes.map((item) =>
          item.id === id ? { ...item, zIndex: maxZ } : item,
        ),
        selection: { kind: 'aoe', id },
      }
    }),
  clearSelection: () => set({ selection: null }),
  updateEntity: (id, patch) =>
    set((state) => ({
      entities: state.entities.map((item) =>
        item.id === id ? ({ ...item, ...patch } as Entity) : item,
      ),
    })),
  updateAoe: (id, patch) =>
    set((state) => ({
      aoes: state.aoes.map((item) =>
        item.id === id ? ({ ...item, ...patch } as AoE) : item,
      ),
    })),
  updateArena: (patch) => set((state) => ({ arena: { ...state.arena, ...patch } })),
  deleteSelected: () =>
    set((state) => {
      if (!state.selection) return state
      if (state.selection.kind === 'entity') {
        return {
          entities: state.entities.filter(
            (item) => item.id !== state.selection?.id,
          ),
          selection: null,
        }
      }
      if (state.selection.kind === 'aoe') {
        return {
          aoes: state.aoes.filter((item) => item.id !== state.selection?.id),
          selection: null,
        }
      }
      return state
    }),
  duplicateSelected: () =>
    set((state) => {
      if (!state.selection) return state
      if (state.selection.kind === 'entity') {
        const target = state.entities.find(
          (item) => item.id === state.selection?.id,
        )
        if (!target) return state
        const copy: Entity = {
          ...target,
          id: createId(),
          position: { x: target.position.x + 20, y: target.position.y + 20 },
          zIndex: Math.max(0, ...state.entities.map((item) => item.zIndex)) + 1,
        }
        return {
          entities: [...state.entities, copy],
          selection: { kind: 'entity', id: copy.id },
        }
      }
      if (state.selection.kind === 'aoe') {
        const target = state.aoes.find(
          (item) => item.id === state.selection?.id,
        )
        if (!target) return state
        const copy: AoE = {
          ...target,
          id: createId(),
          position: { x: target.position.x + 20, y: target.position.y + 20 },
          zIndex: Math.max(0, ...state.aoes.map((item) => item.zIndex)) + 1,
        }
        return {
          aoes: [...state.aoes, copy],
          selection: { kind: 'aoe', id: copy.id },
        }
      }
      return state
    }),
  setSimulationTimeMs: (value) =>
    set((state) => {
      const next = typeof value === 'function' ? value(state.simulationTimeMs) : value
      const clamped = clamp(next, 0, state.timelineDurationMs)
      let actions = state.actions
      let aoes = state.aoes
      if (clamped < state.simulationTimeMs) {
        actions = state.actions.map((item) => ({ ...item, executed: false }))
        aoes = state.aoes.filter((item) => !item.sourceActionId)
      }
      const processed = processActions(clamped, {
        actions,
        aoes,
        entities: state.entities,
      })
      return {
        actions: processed.actions,
        aoes: processed.aoes,
        simulationTimeMs: clamped,
      }
    }),
  resetSimulation: () =>
    set((state) => ({
      simulationTimeMs: 0,
      playing: false,
      aoes: state.aoes.filter((item) => !item.sourceActionId),
      actions: state.actions.map((item) => ({ ...item, executed: false })),
    })),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  addAction: () =>
    set((state) => ({
      actions: [
        ...state.actions,
        {
          id: createId(),
          atMs: Math.round(state.simulationTimeMs + 2000),
          type: 'spawnAoE',
          executed: false,
          payload: {
            shape: 'circle',
            positionMode: 'offset',
            offset: { x: 0, y: 0 },
            rotation: 0,
            shapeParams: { radius: 120 },
            delayMs: 0,
            durationMs: 3000,
          },
        },
      ],
    })),
  updateAction: (id, patch) =>
    set((state) => ({
      actions: state.actions.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  removeAction: (id) =>
    set((state) => ({
      actions: state.actions.filter((item) => item.id !== id),
      aoes: state.aoes.filter((item) => item.sourceActionId !== id),
    })),
  exportScene: () => {
    const state = get()
    return {
      arena: state.arena,
      entities: state.entities,
      aoes: state.aoes.filter((item) => !item.sourceActionId),
      actions: state.actions.map((item) => ({ ...item, executed: false })),
      timelineDurationMs: state.timelineDurationMs,
    }
  },
  importScene: (raw) => {
    try {
      const data = JSON.parse(raw) as SceneExport
      const normalizedEntities =
        data.entities?.map((entity) => ({
          ...entity,
          motion: entity.motion ?? { kind: 'none' },
        })) ?? defaultEntities
      set({
        arena: data.arena ?? defaultArena,
        entities: normalizedEntities,
        aoes: (data.aoes ?? []).filter((item) => !item.sourceActionId),
        actions: (data.actions ?? []).map((item) => ({
          ...item,
          executed: false,
        })),
        timelineDurationMs: data.timelineDurationMs ?? 120000,
        selection: null,
        placement: null,
        simulationTimeMs: 0,
        playing: false,
      })
    } catch (error) {
      console.error('Invalid scene JSON', error)
    }
  },
}))
