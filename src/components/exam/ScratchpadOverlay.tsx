import { Eraser, Pencil, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type DrawingTool = 'pen' | 'eraser'

const PEN_COLORS = ['#4f46e5', '#dc2626', '#0f766e'] as const

interface ScratchpadOverlayProps {
  open: boolean
  onClose: () => void
  resetKey?: string
}

interface Point {
  x: number
  y: number
}

function devicePixelRatio(): number {
  return Math.max(1, window.devicePixelRatio || 1)
}

export function ScratchpadOverlay({ open, onClose, resetKey }: ScratchpadOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [colourIndex, setColourIndex] = useState(0)

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = devicePixelRatio()
    const previous = document.createElement('canvas')
    previous.width = canvas.width
    previous.height = canvas.height
    if (canvas.width > 0 && canvas.height > 0) {
      previous.getContext('2d')?.drawImage(canvas, 0, 0)
    }
    const width = Math.floor(window.innerWidth * dpr)
    const height = Math.floor(window.innerHeight * dpr)
    canvas.width = width
    canvas.height = height
    canvas.style.width = `${window.innerWidth}px`
    canvas.style.height = `${window.innerHeight}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (previous.width > 0 && previous.height > 0) {
      ctx.drawImage(previous, 0, 0, width, height)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    window.addEventListener('orientationchange', resizeCanvas)
    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('orientationchange', resizeCanvas)
    }
  }, [open, resizeCanvas])

  useEffect(() => {
    if (open) {
      clearCanvas()
    }
  }, [open, resetKey, clearCanvas])

  const pointFromEvent = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current
    const dpr = devicePixelRatio()
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * dpr,
      y: (event.clientY - rect.top) * dpr,
    }
  }, [])

  const strokeSegment = useCallback(
    (from: Point, to: Point, pointerType: string, pressure: number, activeTool: DrawingTool, colour: string) => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const dpr = devicePixelRatio()
      ctx.globalCompositeOperation = activeTool === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = colour
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (activeTool === 'eraser') {
        ctx.lineWidth = 28 * dpr
      } else if (pointerType === 'pen' && pressure > 0) {
        ctx.lineWidth = (1.8 + pressure * 3.2) * dpr
      } else {
        ctx.lineWidth = 3.5 * dpr
      }
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.stroke()
    },
    [],
  )

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.setPointerCapture(event.pointerId)
      drawingRef.current = true
      const point = pointFromEvent(event)
      lastPointRef.current = point
      strokeSegment(
        point,
        { x: point.x + 0.01, y: point.y + 0.01 },
        event.pointerType,
        event.pressure,
        tool,
        PEN_COLORS[colourIndex],
      )
    },
    [pointFromEvent, strokeSegment, tool, colourIndex],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      event.preventDefault()
      const point = pointFromEvent(event)
      const last = lastPointRef.current ?? point
      strokeSegment(last, point, event.pointerType, event.pressure, tool, PEN_COLORS[colourIndex])
      lastPointRef.current = point
    },
    [pointFromEvent, strokeSegment, tool, colourIndex],
  )

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPointRef.current = null
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
  }, [])

  if (!open) return null

  const toolButtonClass = (active: boolean) =>
    `grid h-12 w-12 place-items-center rounded-xl border-2 transition ${
      active
        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`

  return (
    <div className="fixed inset-0 z-[60]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none cursor-crosshair"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={toolButtonClass(tool === 'pen')}
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
          >
            <Pencil className="h-6 w-6" aria-hidden="true" />
          </button>
          {PEN_COLORS.map((colour, index) => (
            <button
              key={colour}
              type="button"
              onClick={() => {
                setTool('pen')
                setColourIndex(index)
              }}
              aria-label={`Pen colour ${index + 1}`}
              className={`h-9 w-9 rounded-full border-4 transition ${
                tool === 'pen' && colourIndex === index
                  ? 'border-slate-800 scale-110'
                  : 'border-slate-200'
              }`}
              style={{ backgroundColor: colour }}
            />
          ))}
          <span className="mx-1 h-8 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={toolButtonClass(tool === 'eraser')}
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
          >
            <Eraser className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={clearCanvas}
            className={toolButtonClass(false)}
            aria-label="Clear all drawings"
          >
            <Trash2 className="h-6 w-6" aria-hidden="true" />
          </button>
          <span className="mx-1 h-8 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700"
            aria-label="Close scratchpad"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
