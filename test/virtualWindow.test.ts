import { describe, it, expect } from 'vitest'
import { computeWindow } from '../src/shared/virtualWindow'

describe('computeWindow (v0.8.1 virtualization)', () => {
  it('renders from the top with overscan clamped to 0', () => {
    const w = computeWindow(0, 40, 400, 1000, 8)
    expect(w.start).toBe(0)
    expect(w.padTop).toBe(0)
    // ceil(400/40)=10 visible + 16 overscan = 26 rows
    expect(w.end).toBe(26)
    expect(w.padBottom).toBe((1000 - 26) * 40)
  })

  it('windows correctly when scrolled into the middle', () => {
    const w = computeWindow(4000, 40, 400, 1000, 8)
    // floor(4000/40)=100, minus overscan 8 => start 92
    expect(w.start).toBe(92)
    expect(w.padTop).toBe(92 * 40)
    expect(w.end).toBe(Math.min(1000, 92 + 26))
    expect(w.padTop + (w.end - w.start) * 40 + w.padBottom).toBe(1000 * 40) // geometry preserved
  })

  it('clamps end to total near the bottom', () => {
    const w = computeWindow(40 * 1000, 40, 400, 1000, 8)
    expect(w.end).toBe(1000)
    expect(w.padBottom).toBe(0)
  })

  it('handles an empty list', () => {
    const w = computeWindow(0, 40, 400, 0, 8)
    expect(w.start).toBe(0)
    expect(w.end).toBe(0)
    expect(w.padTop).toBe(0)
    expect(w.padBottom).toBe(0)
  })

  it('guards against a zero row height', () => {
    expect(() => computeWindow(100, 0, 400, 10, 8)).not.toThrow()
  })
})
