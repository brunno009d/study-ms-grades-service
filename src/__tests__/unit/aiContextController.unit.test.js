import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../service/gradesService.js', () => ({
  default: {
    getAllPerformance:     vi.fn(),
    getCurrentPerformance: vi.fn(),
  }
}))

import gradesService from '../../service/gradesService.js'
import { getContext, getCurrentContext } from '../../controller/aiContextController.js'

const makeRes = () => {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json   = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => vi.clearAllMocks())

// ─── getContext ────────────────────────────────────────────────────────────────

describe('aiContextController — getContext', () => {
  it('200 — retorna el rendimiento de todas las materias', async () => {
    // Arrange
    const performance = [{ subject_id: 's1', summary: { real_average: 5.5 } }]
    gradesService.getAllPerformance.mockResolvedValue(performance)
    const req = { userId: 'u1' }
    const res = makeRes()
    // Act
    await getContext(req, res, vi.fn())
    // Assert
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(performance)
    expect(gradesService.getAllPerformance).toHaveBeenCalledWith('u1')
  })

  it('delega a next en error inesperado', async () => {
    // Arrange
    const err = new Error('DB fail')
    gradesService.getAllPerformance.mockRejectedValue(err)
    const next = vi.fn()
    // Act
    await getContext({ userId: 'u1' }, makeRes(), next)
    // Assert
    expect(next).toHaveBeenCalledWith(err)
  })
})

// ─── getCurrentContext ─────────────────────────────────────────────────────────

describe('aiContextController — getCurrentContext', () => {
  it('200 — retorna el rendimiento de las materias actuales', async () => {
    // Arrange
    const current = [{ subject_id: 's2', summary: { real_average: 6.0 } }]
    gradesService.getCurrentPerformance.mockResolvedValue(current)
    const req = { userId: 'u1' }
    const res = makeRes()
    // Act
    await getCurrentContext(req, res, vi.fn())
    // Assert
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(current)
    expect(gradesService.getCurrentPerformance).toHaveBeenCalledWith('u1')
  })

  it('delega a next en error inesperado', async () => {
    // Arrange
    const err = new Error('DB fail')
    gradesService.getCurrentPerformance.mockRejectedValue(err)
    const next = vi.fn()
    // Act
    await getCurrentContext({ userId: 'u1' }, makeRes(), next)
    // Assert
    expect(next).toHaveBeenCalledWith(err)
  })
})
