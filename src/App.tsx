
import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Group, Rect, Circle, Arc, Ring, Text, Line } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import './App.css'
import { useStore } from './store'
import type {
  AoE,
  AoEShape,
  BossAction,
  EntityType,
  Motion,
  MotionPoint,
  Vec2,
} from './store'

const DEFAULT_AOE_COLORS = {
  fill: 'rgba(230, 76, 60, 0.25)',
  stroke: 'rgba(230, 76, 60, 0.8)',
}

const DEFAULT_ENTITY_COLORS: Record<EntityType, string> = {
  boss: '#f39c12',
  player: '#3498db',
  item: '#7f8c8d',
  marker: '#9b59b6',
}

const HANDLE_COLORS = {
  fill: '#ffffff',
  stroke: '#1f2a35',
}

const PATH_COLORS = {
  stroke: '#16a085',
  point: '#1abc9c',
  selected: '#f39c12',
}

const TOOLBOX_ENTITIES: { label: string; type: EntityType }[] = [
  { label: 'Boss', type: 'boss' },
  { label: 'Player', type: 'player' },
  { label: 'Item', type: 'item' },
  { label: 'Marker', type: 'marker' },
]

const TOOLBOX_AOES: { label: string; shape: AoEShape }[] = [
  { label: 'Circle', shape: 'circle' },
  { label: 'Semicircle', shape: 'semicircle' },
  { label: 'Sector', shape: 'sector' },
  { label: 'Rect', shape: 'rect' },
  { label: 'Line', shape: 'line' },
  { label: 'Ring', shape: 'ring' },
]

const getActionShapeParams = (shape: AoEShape) => {
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const parseNumber = (value: string, fallback = 0) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

const toRad = (value: number) => (value * Math.PI) / 180
const toDeg = (value: number) => (value * 180) / Math.PI

const isAoEVisible = (aoe: AoE, timeMs: number) => {
  const start = aoe.timing.startAtMs + aoe.timing.delayMs
  const end = start + aoe.timing.durationMs
  return timeMs >= start && timeMs <= end
}

const normalizeMotion = (motion?: Motion): Motion => {
  if (!motion) return { kind: 'none' }
  if (motion.kind !== 'path') return { kind: 'none' }
  return {
    kind: 'path',
    points: [...motion.points].sort((a, b) => a.atMs - b.atMs),
    loop: motion.loop ?? false,
    alignRotation: motion.alignRotation ?? false,
  }
}

const getMotionPosition = (
  motion: Motion,
  fallback: Vec2,
  timeMs: number,
) => {
  if (motion.kind !== 'path' || motion.points.length === 0) {
    return fallback
  }
  const points = [...motion.points].sort((a, b) => a.atMs - b.atMs)
  const first = points[0]
  const last = points[points.length - 1]
  const duration = last.atMs - first.atMs
  let t = timeMs
  if (t <= first.atMs) return { x: first.x, y: first.y }
  if (t >= last.atMs) {
    if (motion.loop && duration > 0) {
      const wrapped = ((t - first.atMs) % duration) + first.atMs
      t = wrapped
    } else {
      return { x: last.x, y: last.y }
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if (t >= a.atMs && t <= b.atMs) {
      const span = b.atMs - a.atMs
      const ratio = span <= 0 ? 0 : (t - a.atMs) / span
      return {
        x: a.x + (b.x - a.x) * ratio,
        y: a.y + (b.y - a.y) * ratio,
      }
    }
  }
  return fallback
}

const updateMotionPoint = (
  points: MotionPoint[],
  index: number,
  patch: Partial<MotionPoint>,
) => {
  const next = points.map((point, idx) =>
    idx === index ? { ...point, ...patch } : point,
  )
  return next.sort((a, b) => a.atMs - b.atMs)
}

const useStageSize = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 600, height: 400 })

  useEffect(() => {
    if (!ref.current) return
    const element = ref.current
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, size }
}

function App() {
  const arena = useStore((state) => state.arena)
  const entities = useStore((state) => state.entities)
  const aoes = useStore((state) => state.aoes)
  const actions = useStore((state) => state.actions)
  const selection = useStore((state) => state.selection)
  const placement = useStore((state) => state.placement)
  const toolMode = useStore((state) => state.toolMode)
  const simulationTimeMs = useStore((state) => state.simulationTimeMs)
  const timelineDurationMs = useStore((state) => state.timelineDurationMs)
  const playing = useStore((state) => state.playing)
  const setPlacement = useStore((state) => state.setPlacement)
  const clearPlacement = useStore((state) => state.clearPlacement)
  const setToolMode = useStore((state) => state.setToolMode)
  const addEntityAt = useStore((state) => state.addEntityAt)
  const addAoeAt = useStore((state) => state.addAoeAt)
  const selectEntity = useStore((state) => state.selectEntity)
  const selectAoe = useStore((state) => state.selectAoe)
  const clearSelection = useStore((state) => state.clearSelection)
  const updateEntity = useStore((state) => state.updateEntity)
  const updateAoe = useStore((state) => state.updateAoe)
  const updateArena = useStore((state) => state.updateArena)
  const deleteSelected = useStore((state) => state.deleteSelected)
  const duplicateSelected = useStore((state) => state.duplicateSelected)
  const setSimulationTimeMs = useStore((state) => state.setSimulationTimeMs)
  const resetSimulation = useStore((state) => state.resetSimulation)
  const play = useStore((state) => state.play)
  const pause = useStore((state) => state.pause)
  const updateAction = useStore((state) => state.updateAction)
  const addAction = useStore((state) => state.addAction)
  const removeAction = useStore((state) => state.removeAction)
  const importScene = useStore((state) => state.importScene)

  const { ref, size } = useStageSize()
  const center = useMemo(
    () => ({ x: size.width / 2, y: size.height / 2 }),
    [size.width, size.height],
  )
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState<
    number | null
  >(null)

  const selectedEntity = useMemo(
    () =>
      selection?.kind === 'entity'
        ? entities.find((item) => item.id === selection.id)
        : null,
    [selection, entities],
  )

  const selectedEntityMotion = useMemo(
    () => normalizeMotion(selectedEntity?.motion),
    [selectedEntity],
  )

  const selectedAoE = useMemo(
    () =>
      selection?.kind === 'aoe'
        ? aoes.find((item) => item.id === selection.id)
        : null,
    [selection, aoes],
  )

  const selectedMotionPoints = useMemo(
    () =>
      selectedEntityMotion.kind === 'path' ? selectedEntityMotion.points : [],
    [selectedEntityMotion],
  )

  const selectedPathLinePoints = useMemo(
    () => selectedMotionPoints.flatMap((point) => [point.x, point.y]),
    [selectedMotionPoints],
  )

  const visibleAoes = useMemo(
    () => aoes.filter((aoe) => isAoEVisible(aoe, simulationTimeMs)),
    [aoes, simulationTimeMs],
  )

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        deleteSelected()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
      }
      if (event.key.toLowerCase() === 'v') {
        setToolMode('select')
      }
      if (event.key.toLowerCase() === 'p') {
        setToolMode('path')
      }
      if (event.key === 'Escape') {
        clearPlacement()
        clearSelection()
        setSelectedKeyframeIndex(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    deleteSelected,
    duplicateSelected,
    setToolMode,
    clearPlacement,
    clearSelection,
  ])

  useEffect(() => {
    if (!playing) return
    let frameId = 0
    let last = performance.now()
    const tick = (now: number) => {
      const delta = now - last
      last = now
      setSimulationTimeMs((prev) =>
        clamp(prev + delta, 0, timelineDurationMs),
      )
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [playing, setSimulationTimeMs, timelineDurationMs])

  const handleStageClick = (evt: KonvaEventObject<MouseEvent>) => {
    const stage = evt.target.getStage()
    if (!stage) return
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const worldPosition: Vec2 = {
      x: pointer.x - center.x,
      y: pointer.y - center.y,
    }
    if (placement?.mode === 'entity') {
      addEntityAt(placement.entityType, worldPosition)
      return
    }
    if (placement?.mode === 'aoe') {
      addAoeAt(placement.shape, worldPosition)
      return
    }
    if (evt.target === stage) {
      setSelectedKeyframeIndex(null)
      clearSelection()
    }
  }

  const handleSelectEntity = (id: string) => {
    setSelectedKeyframeIndex(null)
    selectEntity(id)
  }

  const handleSelectAoe = (id: string) => {
    setSelectedKeyframeIndex(null)
    selectAoe(id)
  }

  const resolveLocalPoint = (
    evt: KonvaEventObject<DragEvent | MouseEvent>,
    aoe: AoE,
  ) => {
    const stage = evt.target.getStage()
    const pointer = stage?.getPointerPosition()
    if (!pointer) return null
    const dx = pointer.x - center.x - aoe.position.x
    const dy = pointer.y - center.y - aoe.position.y
    const angle = -toRad(aoe.rotation)
    return {
      x: dx * Math.cos(angle) - dy * Math.sin(angle),
      y: dx * Math.sin(angle) + dy * Math.cos(angle),
    }
  }

  const updateEntityMotion = (entityId: string, motion: Motion) => {
    updateEntity(entityId, { motion })
  }

  const applyEntityDrag = (entityId: string, position: Vec2) => {
    const entity = entities.find((item) => item.id === entityId)
    if (!entity) return
    const motion = normalizeMotion(entity.motion)
    if (playing) return
    if (toolMode === 'path' || motion.kind === 'path') {
      const thresholdMs = 250
      const points = motion.kind === 'path' ? [...motion.points] : []
      const existingIndex = points.findIndex(
        (point) => Math.abs(point.atMs - simulationTimeMs) <= thresholdMs,
      )
      if (existingIndex >= 0) {
        const nextPoints = updateMotionPoint(points, existingIndex, {
          x: position.x,
          y: position.y,
        })
        updateEntityMotion(entityId, {
          kind: 'path',
          points: nextPoints,
          loop: motion.kind === 'path' ? motion.loop : false,
          alignRotation: motion.kind === 'path' ? motion.alignRotation : false,
        })
        updateEntity(entityId, { position })
        return
      }
      const nextPoints = [...points, { x: position.x, y: position.y, atMs: simulationTimeMs }].sort(
        (a, b) => a.atMs - b.atMs,
      )
      updateEntityMotion(entityId, {
        kind: 'path',
        points: nextPoints,
        loop: motion.kind === 'path' ? motion.loop : false,
        alignRotation: motion.kind === 'path' ? motion.alignRotation : false,
      })
      updateEntity(entityId, { position })
      return
    }
    updateEntity(entityId, { position })
  }

  const addKeyframeAtTime = (entityId: string) => {
    const entity = entities.find((item) => item.id === entityId)
    if (!entity) return
    const motion = normalizeMotion(entity.motion)
    const currentPos = getMotionPosition(
      motion,
      entity.position,
      simulationTimeMs,
    )
    const points = motion.kind === 'path' ? [...motion.points] : []
    const nextPoints = [...points, { ...currentPos, atMs: simulationTimeMs }].sort(
      (a, b) => a.atMs - b.atMs,
    )
    updateEntityMotion(entityId, {
      kind: 'path',
      points: nextPoints,
      loop: motion.kind === 'path' ? motion.loop : false,
      alignRotation: motion.kind === 'path' ? motion.alignRotation : false,
    })
  }

  const exportScene = () => {
    const data = useStore.getState().exportScene()
    return JSON.stringify(data, null, 2)
  }

  return (
    <div className="app-shell">
      <aside className="panel toolbox">
        <h2>Toolbox</h2>
        <div className="tool-section">
          <h3>Mode</h3>
          <div className="tool-grid">
            <button
              className={toolMode === 'select' ? 'active' : ''}
              onClick={() => setToolMode('select')}
            >
              Select (V)
            </button>
            <button
              className={toolMode === 'path' ? 'active' : ''}
              onClick={() => setToolMode('path')}
            >
              Path Edit (P)
            </button>
          </div>
        </div>
        <div className="tool-section">
          <h3>Entities</h3>
          <div className="tool-grid">
            {TOOLBOX_ENTITIES.map((item) => (
              <button
                key={item.type}
                className={
                  placement?.mode === 'entity' &&
                  placement.entityType === item.type
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  placement?.mode === 'entity' &&
                  placement.entityType === item.type
                    ? clearPlacement()
                    : setPlacement({ mode: 'entity', entityType: item.type })
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tool-section">
          <h3>AoE</h3>
          <div className="tool-grid">
            {TOOLBOX_AOES.map((item) => (
              <button
                key={item.shape}
                className={
                  placement?.mode === 'aoe' && placement.shape === item.shape
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  placement?.mode === 'aoe' && placement.shape === item.shape
                    ? clearPlacement()
                    : setPlacement({ mode: 'aoe', shape: item.shape })
                }
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tool-hint">
          <p>Click canvas to place. V/P switch modes. Esc clears selection.</p>
        </div>
      </aside>

      <main className="canvas-panel">
        <div className="canvas-shell" ref={ref}>
          <Stage
            width={size.width}
            height={size.height}
            onMouseDown={handleStageClick}
          >
            <Layer>
              <Group x={center.x} y={center.y}>
                {arena.shape === 'circle' ? (
                  <Circle
                    radius={arena.radius}
                    stroke="#2c3e50"
                    strokeWidth={3}
                  />
                ) : (
                  <Rect
                    width={arena.size}
                    height={arena.size}
                    stroke="#2c3e50"
                    strokeWidth={3}
                    offsetX={arena.size / 2}
                    offsetY={arena.size / 2}
                  />
                )}
                {visibleAoes
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((aoe) => {
                    const commonProps = {
                      x: aoe.position.x,
                      y: aoe.position.y,
                      rotation: aoe.rotation,
                      fill: DEFAULT_AOE_COLORS.fill,
                      stroke: DEFAULT_AOE_COLORS.stroke,
                      strokeWidth: 2,
                      onClick: () => handleSelectAoe(aoe.id),
                      draggable: !playing,
                      onDragEnd: (event: KonvaEventObject<DragEvent>) => {
                        const pos = event.target.position()
                        updateAoe(aoe.id, {
                          position: { x: pos.x, y: pos.y },
                        })
                      },
                    }
                    switch (aoe.shape) {
                      case 'circle':
                        return (
                          <Circle
                            key={aoe.id}
                            radius={aoe.shapeParams.radius}
                            {...commonProps}
                          />
                        )
                      case 'semicircle':
                        return (
                          <Arc
                            key={aoe.id}
                            innerRadius={0}
                            outerRadius={aoe.shapeParams.radius}
                            angle={180}
                            {...commonProps}
                          />
                        )
                      case 'sector':
                        return (
                          <Arc
                            key={aoe.id}
                            innerRadius={0}
                            outerRadius={aoe.shapeParams.radius}
                            angle={aoe.shapeParams.angle}
                            {...commonProps}
                          />
                        )
                      case 'rect':
                        return (
                          <Rect
                            key={aoe.id}
                            width={aoe.shapeParams.width}
                            height={aoe.shapeParams.height}
                            offsetX={aoe.shapeParams.width / 2}
                            offsetY={aoe.shapeParams.height / 2}
                            {...commonProps}
                          />
                        )
                      case 'line':
                        return (
                          <Rect
                            key={aoe.id}
                            width={aoe.shapeParams.length}
                            height={aoe.shapeParams.width}
                            offsetX={aoe.shapeParams.length / 2}
                            offsetY={aoe.shapeParams.width / 2}
                            {...commonProps}
                          />
                        )
                      case 'ring':
                        return (
                          <Ring
                            key={aoe.id}
                            innerRadius={aoe.shapeParams.innerRadius}
                            outerRadius={aoe.shapeParams.outerRadius}
                            {...commonProps}
                          />
                        )
                      default:
                        return null
                    }
                  })}
                {selectedEntity &&
                selectedEntityMotion.kind === 'path' &&
                selectedMotionPoints.length > 0 ? (
                  <Group>
                    <Line
                      points={selectedPathLinePoints}
                      stroke={PATH_COLORS.stroke}
                      strokeWidth={2}
                      lineCap="round"
                      lineJoin="round"
                      dash={[6, 6]}
                    />
                    {selectedMotionPoints.map((point, index) => (
                      <Circle
                        key={`${selectedEntity.id}_pt_${index}`}
                        x={point.x}
                        y={point.y}
                        radius={6}
                        fill={
                          index === selectedKeyframeIndex
                            ? PATH_COLORS.selected
                            : PATH_COLORS.point
                        }
                        stroke="#0b3d2e"
                        strokeWidth={1}
                        draggable={!playing && toolMode === 'path'}
                        onMouseDown={(event) => {
                          event.cancelBubble = true
                          setSelectedKeyframeIndex(index)
                        }}
                        onDragMove={(event) => {
                          if (!selectedEntity) return
                          const pos = event.target.position()
                          const motion = normalizeMotion(selectedEntity.motion)
                          if (motion.kind !== 'path') return
                          const nextPoints = updateMotionPoint(
                            motion.points,
                            index,
                            { x: pos.x, y: pos.y },
                          )
                          updateEntityMotion(selectedEntity.id, {
                            kind: 'path',
                            points: nextPoints,
                            loop: motion.loop,
                            alignRotation: motion.alignRotation,
                          })
                        }}
                      />
                    ))}
                  </Group>
                ) : null}
                {entities
                  .slice()
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((entity) => {
                    const color = DEFAULT_ENTITY_COLORS[entity.type]
                    const motion = normalizeMotion(entity.motion)
                    const displayPosition = getMotionPosition(
                      motion,
                      entity.position,
                      simulationTimeMs,
                    )
                    const commonProps = {
                      x: displayPosition.x,
                      y: displayPosition.y,
                      fill: color,
                      stroke: '#1f2a35',
                      strokeWidth: 1,
                      draggable: !playing,
                      onClick: () => handleSelectEntity(entity.id),
                      onDragEnd: (event: KonvaEventObject<DragEvent>) => {
                        const pos = event.target.position()
                        applyEntityDrag(entity.id, { x: pos.x, y: pos.y })
                      },
                    }
                    if (entity.type === 'marker') {
                      return (
                        <Group key={entity.id} {...commonProps}>
                          <Rect width={32} height={32} offsetX={16} offsetY={16} />
                          <Text
                            text={entity.text}
                            fontSize={16}
                            fill="#fff"
                            align="center"
                            verticalAlign="middle"
                            offsetX={16}
                            offsetY={8}
                          />
                        </Group>
                      )
                    }
                    return (
                      <Circle
                        key={entity.id}
                        radius={entity.type === 'boss' ? 18 : 12}
                        {...commonProps}
                      />
                    )
                  })}
                {selectedAoE ? (
                  <Group
                    x={selectedAoE.position.x}
                    y={selectedAoE.position.y}
                    rotation={selectedAoE.rotation}
                  >
                    {selectedAoE.shape === 'circle' ? (
                      <Circle
                        x={selectedAoE.shapeParams.radius}
                        y={0}
                        radius={6}
                        fill={HANDLE_COLORS.fill}
                        stroke={HANDLE_COLORS.stroke}
                        strokeWidth={1}
                        draggable={!playing}
                        onMouseDown={(event) => {
                          event.cancelBubble = true
                        }}
                        onDragMove={(event) => {
                          if (!selectedAoE) return
                          const local = resolveLocalPoint(event, selectedAoE)
                          if (!local) return
                          const nextRadius = Math.max(10, Math.abs(local.x))
                          updateAoe(selectedAoE.id, {
                            shapeParams: {
                              ...selectedAoE.shapeParams,
                              radius: nextRadius,
                            },
                          })
                          event.target.position({ x: nextRadius, y: 0 })
                        }}
                      />
                    ) : null}
                    {selectedAoE.shape === 'semicircle' ? (
                      <>
                        <Circle
                          x={selectedAoE.shapeParams.radius}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextRadius = Math.max(10, Math.abs(local.x))
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                radius: nextRadius,
                              },
                            })
                            event.target.position({ x: nextRadius, y: 0 })
                          }}
                        />
                        <Circle
                          x={selectedAoE.shapeParams.radius + 30}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextRotation = toDeg(Math.atan2(local.y, local.x))
                            updateAoe(selectedAoE.id, { rotation: nextRotation })
                          }}
                        />
                      </>
                    ) : null}
                    {selectedAoE.shape === 'sector' ? (
                      <>
                        <Circle
                          x={selectedAoE.shapeParams.radius}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextRadius = Math.max(10, Math.abs(local.x))
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                radius: nextRadius,
                              },
                            })
                            event.target.position({ x: nextRadius, y: 0 })
                          }}
                        />
                        <Circle
                          x={
                            selectedAoE.shapeParams.radius *
                            Math.cos(toRad(selectedAoE.shapeParams.angle))
                          }
                          y={
                            selectedAoE.shapeParams.radius *
                            Math.sin(toRad(selectedAoE.shapeParams.angle))
                          }
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            let nextAngle = toDeg(Math.atan2(local.y, local.x))
                            if (nextAngle < 0) nextAngle += 360
                            nextAngle = clamp(nextAngle, 5, 355)
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                angle: nextAngle,
                              },
                            })
                          }}
                        />
                        <Circle
                          x={selectedAoE.shapeParams.radius + 30}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextRotation = toDeg(Math.atan2(local.y, local.x))
                            updateAoe(selectedAoE.id, { rotation: nextRotation })
                          }}
                        />
                      </>
                    ) : null}
                    {selectedAoE.shape === 'rect' ? (
                      <>
                        {[
                          {
                            x: selectedAoE.shapeParams.width / 2,
                            y: selectedAoE.shapeParams.height / 2,
                          },
                          {
                            x: selectedAoE.shapeParams.width / 2,
                            y: -selectedAoE.shapeParams.height / 2,
                          },
                          {
                            x: -selectedAoE.shapeParams.width / 2,
                            y: selectedAoE.shapeParams.height / 2,
                          },
                          {
                            x: -selectedAoE.shapeParams.width / 2,
                            y: -selectedAoE.shapeParams.height / 2,
                          },
                        ].map((handle, idx) => (
                          <Circle
                            key={`rect-handle-${idx}`}
                            x={handle.x}
                            y={handle.y}
                            radius={6}
                            fill={HANDLE_COLORS.fill}
                            stroke={HANDLE_COLORS.stroke}
                            strokeWidth={1}
                            draggable={!playing}
                            onMouseDown={(event) => {
                              event.cancelBubble = true
                            }}
                            onDragMove={(event) => {
                              const local = resolveLocalPoint(event, selectedAoE)
                              if (!local) return
                              const halfWidth = Math.max(10, Math.abs(local.x))
                              const halfHeight = Math.max(10, Math.abs(local.y))
                              let nextWidth = halfWidth * 2
                              let nextHeight = halfHeight * 2
                              if (event.evt.shiftKey) {
                                const currentHalfWidth =
                                  selectedAoE.shapeParams.width / 2
                                const currentHalfHeight =
                                  selectedAoE.shapeParams.height / 2
                                const scale = Math.max(
                                  halfWidth / currentHalfWidth,
                                  halfHeight / currentHalfHeight,
                                )
                                nextWidth = currentHalfWidth * 2 * scale
                                nextHeight = currentHalfHeight * 2 * scale
                              }
                              updateAoe(selectedAoE.id, {
                                shapeParams: {
                                  ...selectedAoE.shapeParams,
                                  width: nextWidth,
                                  height: nextHeight,
                                },
                              })
                            }}
                          />
                        ))}
                      </>
                    ) : null}
                    {selectedAoE.shape === 'line' ? (
                      <>
                        <Circle
                          x={selectedAoE.shapeParams.length / 2}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextLength = Math.max(20, Math.abs(local.x) * 2)
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                length: nextLength,
                              },
                            })
                          }}
                        />
                        <Circle
                          x={0}
                          y={selectedAoE.shapeParams.width / 2}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const nextWidth = Math.max(6, Math.abs(local.y) * 2)
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                width: nextWidth,
                              },
                            })
                          }}
                        />
                      </>
                    ) : null}
                    {selectedAoE.shape === 'ring' ? (
                      <>
                        <Circle
                          x={selectedAoE.shapeParams.innerRadius}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const currentInner = selectedAoE.shapeParams.innerRadius
                            const currentOuter = selectedAoE.shapeParams.outerRadius
                            const nextInner = clamp(Math.abs(local.x), 6, currentOuter - 6)
                            let nextOuter = currentOuter
                            if (event.evt.shiftKey && currentInner > 0) {
                              const scale = nextInner / currentInner
                              nextOuter = Math.max(nextInner + 6, currentOuter * scale)
                            }
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                innerRadius: nextInner,
                                outerRadius: nextOuter,
                              },
                            })
                          }}
                        />
                        <Circle
                          x={selectedAoE.shapeParams.outerRadius}
                          y={0}
                          radius={6}
                          fill={HANDLE_COLORS.fill}
                          stroke={HANDLE_COLORS.stroke}
                          strokeWidth={1}
                          draggable={!playing}
                          onMouseDown={(event) => {
                            event.cancelBubble = true
                          }}
                          onDragMove={(event) => {
                            const local = resolveLocalPoint(event, selectedAoE)
                            if (!local) return
                            const currentInner = selectedAoE.shapeParams.innerRadius
                            const currentOuter = selectedAoE.shapeParams.outerRadius
                            let nextOuter = Math.max(currentInner + 6, Math.abs(local.x))
                            let nextInner = currentInner
                            if (event.evt.shiftKey && currentOuter > 0) {
                              const scale = nextOuter / currentOuter
                              nextInner = Math.max(6, currentInner * scale)
                              nextOuter = Math.max(nextInner + 6, nextOuter)
                            }
                            updateAoe(selectedAoE.id, {
                              shapeParams: {
                                ...selectedAoE.shapeParams,
                                innerRadius: nextInner,
                                outerRadius: nextOuter,
                              },
                            })
                          }}
                        />
                      </>
                    ) : null}
                  </Group>
                ) : null}
              </Group>
            </Layer>
          </Stage>
        </div>
      </main>

      <aside className="panel inspector">
        <h2>Inspector</h2>
        <div className="panel-section">
          <h3>Arena</h3>
          <div className="field-row">
            <label>Shape</label>
            <select
              value={arena.shape}
              onChange={(event) =>
                updateArena({ shape: event.target.value as 'circle' | 'rect' })
              }
            >
              <option value="circle">Circle</option>
              <option value="rect">Rect</option>
            </select>
          </div>
          {arena.shape === 'circle' ? (
            <div className="field-row">
              <label>Radius</label>
              <input
                type="number"
                value={arena.radius}
                onChange={(event) =>
                  updateArena({
                    radius: Math.max(50, parseNumber(event.target.value, 200)),
                  })
                }
              />
            </div>
          ) : (
            <div className="field-row">
              <label>Size</label>
              <input
                type="number"
                value={arena.size}
                onChange={(event) =>
                  updateArena({
                    size: Math.max(100, parseNumber(event.target.value, 400)),
                  })
                }
              />
            </div>
          )}
        </div>

        <div className="panel-section">
          <h3>Selection</h3>
          {!selectedEntity && !selectedAoE ? (
            <p className="muted">No selection.</p>
          ) : null}
          {selectedEntity ? (
            <div className="selection-card">
              <h4>{selectedEntity.type.toUpperCase()}</h4>
              <div className="field-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedEntity.position.x}
                  onChange={(event) =>
                    updateEntity(selectedEntity.id, {
                      position: {
                        ...selectedEntity.position,
                        x: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedEntity.position.y}
                  onChange={(event) =>
                    updateEntity(selectedEntity.id, {
                      position: {
                        ...selectedEntity.position,
                        y: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              {selectedEntity.type === 'marker' ? (
                <div className="field-row">
                  <label>Text</label>
                  <input
                    value={selectedEntity.text}
                    onChange={(event) =>
                      updateEntity(selectedEntity.id, { text: event.target.value })
                    }
                  />
                </div>
              ) : null}
              <div className="panel-subsection">
                <h5>Movement</h5>
                <div className="field-row">
                  <label>Mode</label>
                  <select
                    value={selectedEntityMotion.kind}
                    onChange={(event) => {
                      const nextKind = event.target.value as Motion['kind']
                      if (nextKind === 'none') {
                        updateEntityMotion(selectedEntity.id, { kind: 'none' })
                        return
                      }
                      updateEntityMotion(selectedEntity.id, {
                        kind: 'path',
                        points: selectedMotionPoints,
                        loop:
                          selectedEntityMotion.kind === 'path'
                            ? selectedEntityMotion.loop
                            : false,
                        alignRotation:
                          selectedEntityMotion.kind === 'path'
                            ? selectedEntityMotion.alignRotation
                            : false,
                      })
                    }}
                  >
                    <option value="none">None</option>
                    <option value="path">Path</option>
                  </select>
                </div>
                {selectedEntityMotion.kind === 'path' ? (
                  <>
                    <div className="field-row">
                      <label>Loop</label>
                      <input
                        type="checkbox"
                        checked={selectedEntityMotion.loop ?? false}
                        onChange={(event) =>
                          updateEntityMotion(selectedEntity.id, {
                            ...selectedEntityMotion,
                            loop: event.target.checked,
                          })
                        }
                      />
                    </div>
                    <div className="keyframe-list">
                      {selectedMotionPoints.length === 0 ? (
                        <p className="muted">No keyframes yet.</p>
                      ) : null}
                      {selectedMotionPoints.map((point, index) => (
                        <div className="keyframe-row" key={`kf_${index}`}>
                          <input
                            type="number"
                            value={point.atMs}
                            onChange={(event) => {
                              const nextPoints = updateMotionPoint(
                                selectedMotionPoints,
                                index,
                                { atMs: parseNumber(event.target.value, 0) },
                              )
                              updateEntityMotion(selectedEntity.id, {
                                ...selectedEntityMotion,
                                points: nextPoints,
                              })
                              setSelectedKeyframeIndex(null)
                            }}
                          />
                          <input
                            type="number"
                            value={point.x}
                            onChange={(event) => {
                              const nextPoints = updateMotionPoint(
                                selectedMotionPoints,
                                index,
                                { x: parseNumber(event.target.value, 0) },
                              )
                              updateEntityMotion(selectedEntity.id, {
                                ...selectedEntityMotion,
                                points: nextPoints,
                              })
                            }}
                          />
                          <input
                            type="number"
                            value={point.y}
                            onChange={(event) => {
                              const nextPoints = updateMotionPoint(
                                selectedMotionPoints,
                                index,
                                { y: parseNumber(event.target.value, 0) },
                              )
                              updateEntityMotion(selectedEntity.id, {
                                ...selectedEntityMotion,
                                points: nextPoints,
                              })
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const nextPoints = selectedMotionPoints.filter(
                                (_, idx) => idx !== index,
                              )
                              updateEntityMotion(selectedEntity.id, {
                                ...selectedEntityMotion,
                                points: nextPoints,
                              })
                              setSelectedKeyframeIndex(null)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="add-row"
                      onClick={() => addKeyframeAtTime(selectedEntity.id)}
                    >
                      Add keyframe at current time
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          {selectedAoE ? (
            <div className="selection-card">
              <h4>{selectedAoE.shape.toUpperCase()} AoE</h4>
              <div className="field-row">
                <label>X</label>
                <input
                  type="number"
                  value={selectedAoE.position.x}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      position: {
                        ...selectedAoE.position,
                        x: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Y</label>
                <input
                  type="number"
                  value={selectedAoE.position.y}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      position: {
                        ...selectedAoE.position,
                        y: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Rotation</label>
                <input
                  type="number"
                  value={selectedAoE.rotation}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      rotation: parseNumber(event.target.value, 0),
                    })
                  }
                />
              </div>
              {selectedAoE.shape === 'circle' ? (
                <div className="field-row">
                  <label>Radius</label>
                  <input
                    type="number"
                    value={selectedAoE.shapeParams.radius}
                    onChange={(event) =>
                      updateAoe(selectedAoE.id, {
                        shapeParams: {
                          ...selectedAoE.shapeParams,
                          radius: parseNumber(event.target.value, 80),
                        },
                      })
                    }
                  />
                </div>
              ) : null}
              {selectedAoE.shape === 'semicircle' ? (
                <div className="field-row">
                  <label>Radius</label>
                  <input
                    type="number"
                    value={selectedAoE.shapeParams.radius}
                    onChange={(event) =>
                      updateAoe(selectedAoE.id, {
                        shapeParams: {
                          ...selectedAoE.shapeParams,
                          radius: parseNumber(event.target.value, 120),
                        },
                      })
                    }
                  />
                </div>
              ) : null}
              {selectedAoE.shape === 'sector' ? (
                <>
                  <div className="field-row">
                    <label>Radius</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.radius}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            radius: parseNumber(event.target.value, 180),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label>Angle</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.angle}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            angle: parseNumber(event.target.value, 90),
                          },
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedAoE.shape === 'rect' ? (
                <>
                  <div className="field-row">
                    <label>Width</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.width}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            width: parseNumber(event.target.value, 160),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label>Height</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.height}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            height: parseNumber(event.target.value, 60),
                          },
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedAoE.shape === 'line' ? (
                <>
                  <div className="field-row">
                    <label>Length</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.length}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            length: parseNumber(event.target.value, 240),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label>Width</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.width}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            width: parseNumber(event.target.value, 30),
                          },
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              {selectedAoE.shape === 'ring' ? (
                <>
                  <div className="field-row">
                    <label>Inner</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.innerRadius}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            innerRadius: parseNumber(event.target.value, 60),
                          },
                        })
                      }
                    />
                  </div>
                  <div className="field-row">
                    <label>Outer</label>
                    <input
                      type="number"
                      value={selectedAoE.shapeParams.outerRadius}
                      onChange={(event) =>
                        updateAoe(selectedAoE.id, {
                          shapeParams: {
                            ...selectedAoE.shapeParams,
                            outerRadius: parseNumber(event.target.value, 120),
                          },
                        })
                      }
                    />
                  </div>
                </>
              ) : null}
              <div className="field-row">
                <label>Start</label>
                <input
                  type="number"
                  value={selectedAoE.timing.startAtMs}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      timing: {
                        ...selectedAoE.timing,
                        startAtMs: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Delay</label>
                <input
                  type="number"
                  value={selectedAoE.timing.delayMs}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      timing: {
                        ...selectedAoE.timing,
                        delayMs: parseNumber(event.target.value, 0),
                      },
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Duration</label>
                <input
                  type="number"
                  value={selectedAoE.timing.durationMs}
                  onChange={(event) =>
                    updateAoe(selectedAoE.id, {
                      timing: {
                        ...selectedAoE.timing,
                        durationMs: parseNumber(event.target.value, 3000),
                      },
                    })
                  }
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel-section">
          <h3>Boss Actions</h3>
          <div className="actions-list">
            {actions.map((action) => (
              <BossActionRow
                key={action.id}
                action={action}
                onChange={updateAction}
                onRemove={removeAction}
              />
            ))}
          </div>
          <button className="add-row" onClick={() => addAction()}>
            Add Action
          </button>
        </div>

        <div className="panel-section">
          <h3>Import / Export</h3>
          <ImportExportPanel onImport={importScene} onExport={exportScene} />
        </div>
      </aside>

      <footer className="timeline-panel">
        <div className="timeline-controls">
          <button onClick={() => (playing ? pause() : play())}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={() => resetSimulation()}>Reset</button>
          <span className="time-readout">
            {Math.round(simulationTimeMs)} ms
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={timelineDurationMs}
          value={simulationTimeMs}
          onChange={(event) =>
            setSimulationTimeMs(parseNumber(event.target.value, 0))
          }
        />
      </footer>
    </div>
  )
}

function BossActionRow({
  action,
  onChange,
  onRemove,
}: {
  action: BossAction
  onChange: (id: string, patch: Partial<BossAction>) => void
  onRemove: (id: string) => void
}) {
  const payload = action.payload
  const radiusParams = payload.shapeParams as { radius: number }
  const sectorParams = payload.shapeParams as { radius: number; angle: number }
  const rectParams = payload.shapeParams as { width: number; height: number }
  const lineParams = payload.shapeParams as { length: number; width: number }
  const ringParams = payload.shapeParams as {
    innerRadius: number
    outerRadius: number
  }
  const updatePayload = (patch: Partial<BossAction['payload']>) => {
    onChange(action.id, {
      payload: { ...payload, ...patch },
    })
  }

  return (
    <div className="action-card">
      <div className="action-header">
        <strong>{action.type}</strong>
        <button onClick={() => onRemove(action.id)}>Remove</button>
      </div>
      <div className="field-row">
        <label>At (ms)</label>
        <input
          type="number"
          value={action.atMs}
          onChange={(event) =>
            onChange(action.id, { atMs: parseNumber(event.target.value, 0) })
          }
        />
      </div>
      <div className="field-row">
        <label>Shape</label>
        <select
          value={payload.shape}
          onChange={(event) =>
            updatePayload({
              shape: event.target.value as AoEShape,
              shapeParams: getActionShapeParams(
                event.target.value as AoEShape,
              ) as BossAction['payload']['shapeParams'],
            })
          }
        >
          <option value="circle">Circle</option>
          <option value="semicircle">Semicircle</option>
          <option value="sector">Sector</option>
          <option value="rect">Rect</option>
          <option value="line">Line</option>
          <option value="ring">Ring</option>
        </select>
      </div>
      <div className="field-row">
        <label>Mode</label>
        <select
          value={payload.positionMode}
          onChange={(event) =>
            updatePayload({
              positionMode: event.target.value as 'position' | 'offset',
            })
          }
        >
          <option value="position">Position</option>
          <option value="offset">Offset</option>
        </select>
      </div>
      {payload.positionMode === 'position' ? (
        <>
          <div className="field-row">
            <label>X</label>
            <input
              type="number"
              value={payload.position?.x ?? 0}
              onChange={(event) =>
                updatePayload({
                  position: {
                    x: parseNumber(event.target.value, 0),
                    y: payload.position?.y ?? 0,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Y</label>
            <input
              type="number"
              value={payload.position?.y ?? 0}
              onChange={(event) =>
                updatePayload({
                  position: {
                    x: payload.position?.x ?? 0,
                    y: parseNumber(event.target.value, 0),
                  },
                })
              }
            />
          </div>
        </>
      ) : (
        <>
          <div className="field-row">
            <label>Offset X</label>
            <input
              type="number"
              value={payload.offset?.x ?? 0}
              onChange={(event) =>
                updatePayload({
                  offset: {
                    x: parseNumber(event.target.value, 0),
                    y: payload.offset?.y ?? 0,
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Offset Y</label>
            <input
              type="number"
              value={payload.offset?.y ?? 0}
              onChange={(event) =>
                updatePayload({
                  offset: {
                    x: payload.offset?.x ?? 0,
                    y: parseNumber(event.target.value, 0),
                  },
                })
              }
            />
          </div>
        </>
      )}
      <div className="field-row">
        <label>Rotation</label>
        <input
          type="number"
          value={payload.rotation}
          onChange={(event) =>
            updatePayload({ rotation: parseNumber(event.target.value, 0) })
          }
        />
      </div>
      <div className="field-row">
        <label>Delay</label>
        <input
          type="number"
          value={payload.delayMs}
          onChange={(event) =>
            updatePayload({ delayMs: parseNumber(event.target.value, 0) })
          }
        />
      </div>
      <div className="field-row">
        <label>Duration</label>
        <input
          type="number"
          value={payload.durationMs}
          onChange={(event) =>
            updatePayload({ durationMs: parseNumber(event.target.value, 4000) })
          }
        />
      </div>
      {payload.shape === 'circle' || payload.shape === 'semicircle' ? (
        <div className="field-row">
          <label>Radius</label>
          <input
            type="number"
            value={radiusParams.radius}
            onChange={(event) =>
              updatePayload({
                shapeParams: {
                  ...payload.shapeParams,
                  radius: parseNumber(event.target.value, 120),
                },
              })
            }
          />
        </div>
      ) : null}
      {payload.shape === 'sector' ? (
        <>
          <div className="field-row">
            <label>Radius</label>
            <input
              type="number"
              value={sectorParams.radius}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    radius: parseNumber(event.target.value, 180),
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Angle</label>
            <input
              type="number"
              value={sectorParams.angle}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    angle: parseNumber(event.target.value, 90),
                  },
                })
              }
            />
          </div>
        </>
      ) : null}
      {payload.shape === 'rect' ? (
        <>
          <div className="field-row">
            <label>Width</label>
            <input
              type="number"
              value={rectParams.width}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    width: parseNumber(event.target.value, 160),
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Height</label>
            <input
              type="number"
              value={rectParams.height}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    height: parseNumber(event.target.value, 60),
                  },
                })
              }
            />
          </div>
        </>
      ) : null}
      {payload.shape === 'line' ? (
        <>
          <div className="field-row">
            <label>Length</label>
            <input
              type="number"
              value={lineParams.length}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    length: parseNumber(event.target.value, 260),
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Width</label>
            <input
              type="number"
              value={lineParams.width}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    width: parseNumber(event.target.value, 30),
                  },
                })
              }
            />
          </div>
        </>
      ) : null}
      {payload.shape === 'ring' ? (
        <>
          <div className="field-row">
            <label>Inner</label>
            <input
              type="number"
              value={ringParams.innerRadius}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    innerRadius: parseNumber(event.target.value, 60),
                  },
                })
              }
            />
          </div>
          <div className="field-row">
            <label>Outer</label>
            <input
              type="number"
              value={ringParams.outerRadius}
              onChange={(event) =>
                updatePayload({
                  shapeParams: {
                    ...payload.shapeParams,
                    outerRadius: parseNumber(event.target.value, 120),
                  },
                })
              }
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function ImportExportPanel({
  onExport,
  onImport,
}: {
  onExport: () => string
  onImport: (data: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div className="import-export">
      <textarea
        rows={6}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="button-row">
        <button onClick={() => setValue(onExport())}>Export</button>
        <button onClick={() => onImport(value)}>Import</button>
      </div>
    </div>
  )
}

export default App
