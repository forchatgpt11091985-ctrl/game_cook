/**
 * Home.tsx — страница-хост игры. React владеет только DOM-оболочкой
 * (canvas + оверлей для HUD); вся игровая логика живёт в src/game/.
 */

import { useEffect, useRef } from 'react'
import { startGame, stopGame } from '@/game/boot'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!canvas || !overlay) return
    startGame(canvas, overlay)
    return () => stopGame()
  }, [])

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div id="ui-overlay" ref={overlayRef} />
    </div>
  )
}
