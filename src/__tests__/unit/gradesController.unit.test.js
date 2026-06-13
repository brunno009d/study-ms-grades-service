import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../service/gradesService.js', () => ({
  default: {
    getSubjectPerformance: vi.fn(),
    createCategory: vi.fn(),
    createEvaluation: vi.fn(),
    updateEvaluation: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    deleteEvaluation: vi.fn(),
    getCurrentPerformance: vi.fn(),
  }
}))

import gradesService from '../../service/gradesService.js'
import controller from '../../controller/gradesController.js'

const mockRes = () => {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.send = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── getPerformance ──────────────────────────────────────────────────────────

describe('gradesController — getPerformance', () => {
  it('responde 200 con el rendimiento de la asignatura', async () => {
    // Arrange
    const performance = { subject_id: 's1', summary: {}, structure: [] }
    gradesService.getSubjectPerformance.mockResolvedValue(performance)
    const req = { userId: 'u1', params: { subject_id: 's1' } }
    const res = mockRes()
    // Act
    await controller.getPerformance(req, res)
    // Assert
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(performance)
  })

  it('responde 403 cuando el service lanza error con statusCode 403', async () => {
    const err = new Error('No autorizado')
    err.statusCode = 403
    gradesService.getSubjectPerformance.mockRejectedValue(err)
    const req = { userId: 'u1', params: { subject_id: 's1' } }
    const res = mockRes()
    await controller.getPerformance(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('responde 500 cuando el error no tiene statusCode', async () => {
    gradesService.getSubjectPerformance.mockRejectedValue(new Error('DB fail'))
    const res = mockRes()
    await controller.getPerformance({ userId: 'u1', params: { subject_id: 's1' } }, res)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})

// ─── createCategory ──────────────────────────────────────────────────────────

describe('gradesController — createCategory', () => {
  it('responde 400 cuando faltan name o weight', async () => {
    const req = { userId: 'u1', params: { subject_id: 's1' }, body: { name: 'Controles' } }
    const res = mockRes()
    await controller.createCategory(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/name.*weight/i) }))
  })

  it('responde 201 con la categoría creada', async () => {
    gradesService.createCategory.mockResolvedValue({ id: 'cat1', name: 'Controles' })
    const req = {
      userId: 'u1',
      params: { subject_id: 's1' },
      body: { name: 'Controles', weight: 0.3 }
    }
    const res = mockRes()
    await controller.createCategory(req, res)
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('responde 400 cuando el service lanza error de peso (statusCode 400)', async () => {
    const err = new Error('La suma de las ponderaciones superaría el 100%')
    err.statusCode = 400
    gradesService.createCategory.mockRejectedValue(err)
    const req = {
      userId: 'u1',
      params: { subject_id: 's1' },
      body: { name: 'Tareas', weight: 0.9 }
    }
    const res = mockRes()
    await controller.createCategory(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })
})

// ─── createEvaluation ────────────────────────────────────────────────────────

describe('gradesController — createEvaluation', () => {
  it('responde 400 cuando faltan name, grade o weight', async () => {
    const req = {
      userId: 'u1',
      params: { subject_id: 's1', category_id: 'cat1' },
      body: { name: 'Control 1' } // sin grade ni weight
    }
    const res = mockRes()
    await controller.createEvaluation(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('responde 201 inyectando category_id desde params', async () => {
    // Arrange
    gradesService.createEvaluation.mockResolvedValue({ id: 'ev1', name: 'Control 1' })
    const req = {
      userId: 'u1',
      params: { subject_id: 's1', category_id: '42' },
      body: { name: 'Control 1', grade: 5.5, weight: 0.3 }
    }
    const res = mockRes()
    // Act
    await controller.createEvaluation(req, res)
    // Assert
    expect(res.status).toHaveBeenCalledWith(201)
    expect(gradesService.createEvaluation).toHaveBeenCalledWith(
      'u1', 's1',
      expect.objectContaining({ category_id: 42 })
    )
  })
})

// ─── deleteCategory ──────────────────────────────────────────────────────────

describe('gradesController — deleteCategory', () => {
  it('responde 204 al eliminar exitosamente', async () => {
    gradesService.deleteCategory.mockResolvedValue(undefined)
    const req = { userId: 'u1', params: { subject_id: 's1', id: 'cat1' } }
    const res = mockRes()
    await controller.deleteCategory(req, res)
    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.send).toHaveBeenCalled()
  })

  it('responde 403 cuando el service lanza error de autorización', async () => {
    const err = new Error('No autorizado')
    err.statusCode = 403
    gradesService.deleteCategory.mockRejectedValue(err)
    const req = { userId: 'u1', params: { subject_id: 's1', id: 'cat1' } }
    const res = mockRes()
    await controller.deleteCategory(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

// ─── deleteEvaluation ────────────────────────────────────────────────────────

describe('gradesController — deleteEvaluation', () => {
  it('responde 204 al eliminar exitosamente', async () => {
    gradesService.deleteEvaluation.mockResolvedValue(undefined)
    const req = { userId: 'u1', params: { subject_id: 's1', id: 'ev1' } }
    const res = mockRes()
    await controller.deleteEvaluation(req, res)
    expect(res.status).toHaveBeenCalledWith(204)
  })
})

// ─── getCurrentProgress ──────────────────────────────────────────────────────

describe('gradesController — getCurrentProgress', () => {
  it('responde 200 con el progreso mapeado para el frontend', async () => {
    // Arrange
    gradesService.getCurrentPerformance.mockResolvedValue([
      { subject_code: 'MAT101', subject_name: 'Cálculo', summary: { real_average: 5.5 } },
      { subject_code: 'FIS101', subject_name: 'Física', summary: null }
    ])
    const req = { userId: 'u1' }
    const res = mockRes()
    // Act
    await controller.getCurrentProgress(req, res)
    // Assert
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([
      { subject_code: 'MAT101', subject_name: 'Cálculo', average: 5.5 },
      { subject_code: 'FIS101', subject_name: 'Física', average: 1.0 }
    ])
  })
})
