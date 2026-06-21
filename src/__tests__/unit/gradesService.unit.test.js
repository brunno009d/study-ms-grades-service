import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../repository/gradesRepository.js', () => ({
  default: {
    checkSubjectOwnership: vi.fn(),
    getCategoriesBySubject: vi.fn(),
    getEvaluationsByCategoryIds: vi.fn(),
    getSumWeightsCategories: vi.fn(),
    getSumWeightsEvaluations: vi.fn(),
    createCategory: vi.fn(),
    createEvaluation: vi.fn(),
    getEvaluationById: vi.fn(),
    updateEvaluation: vi.fn(),
    getCategoryById: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    deleteEvaluation: vi.fn(),
  }
}))

// Stub mínimo de supabase para los métodos de contexto IA (no testeados aquí)
vi.mock('../../config/supabase.js', () => ({
  default: { from: vi.fn() }
}))

import gradesRepository from '../../repository/gradesRepository.js'
import gradesService from '../../service/gradesService.js'

beforeEach(() => vi.clearAllMocks())

// ─── _validateGradeAndWeight ─────────────────────────────────────────────────

describe('gradesService — _validateGradeAndWeight', () => {
  it('lanza 400 cuando la nota es menor a 1.0', () => {
    expect(() => gradesService._validateGradeAndWeight(0.5, undefined))
      .toThrow(/1\.0 y 7\.0/)
  })

  it('lanza 400 cuando la nota es mayor a 7.0', () => {
    expect(() => gradesService._validateGradeAndWeight(7.1, undefined))
      .toThrow(/1\.0 y 7\.0/)
  })

  it('lanza 400 cuando la nota no es número', () => {
    expect(() => gradesService._validateGradeAndWeight('abc', undefined))
      .toThrow(/1\.0 y 7\.0/)
  })

  it('lanza 400 cuando el peso es 0', () => {
    expect(() => gradesService._validateGradeAndWeight(undefined, 0))
      .toThrow(/ponderación/)
  })

  it('lanza 400 cuando el peso es mayor a 1.0', () => {
    expect(() => gradesService._validateGradeAndWeight(undefined, 1.1))
      .toThrow(/ponderación/)
  })

  it('no lanza cuando la nota es 4.0 y el peso 0.5', () => {
    expect(() => gradesService._validateGradeAndWeight(4.0, 0.5)).not.toThrow()
  })

  it('no lanza cuando solo se pasa nota válida', () => {
    expect(() => gradesService._validateGradeAndWeight(7.0, undefined)).not.toThrow()
  })
})

// ─── getSubjectPerformance ───────────────────────────────────────────────────

describe('gradesService — getSubjectPerformance', () => {
  it('lanza 403 cuando el usuario no es dueño de la asignatura', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    // Act
    const err = await gradesService.getSubjectPerformance('u1', 'sub1').catch(e => e)
    // Assert
    expect(err.statusCode).toBe(403)
  })

  it('retorna estructura vacía cuando la asignatura no tiene categorías', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getCategoriesBySubject.mockResolvedValue([])
    // Act
    const result = await gradesService.getSubjectPerformance('u1', 'sub1')
    // Assert
    expect(result.summary.real_average).toBe(0)
    expect(result.structure).toEqual([])
  })

  it('calcula promedio real con una evaluación sin simulación', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getCategoriesBySubject.mockResolvedValue([
      { id: 'cat1', subject_id: 'sub1', parent_category_id: null, weight: 1.0 }
    ])
    gradesRepository.getEvaluationsByCategoryIds.mockResolvedValue([
      { category_id: 'cat1', grade: '5.0', weight: '1.0', is_simulation: false }
    ])
    // Act
    const result = await gradesService.getSubjectPerformance('u1', 'sub1')
    // Assert
    expect(result.summary.real_average).toBe(5)
    expect(result.summary.is_passing_projected).toBe(true)
  })
})

// ─── createCategory ──────────────────────────────────────────────────────────

describe('gradesService — createCategory', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.createCategory('u1', 'sub1', { weight: 0.5 }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('lanza 400 cuando la suma de pesos superaría el 100%', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getSumWeightsCategories.mockResolvedValue(0.8)
    // Act — intenta agregar weight 0.3 → total 1.1
    const err = await gradesService
      .createCategory('u1', 'sub1', { weight: 0.3, parent_category_id: null })
      .catch(e => e)
    // Assert
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/100%/)
  })

  it('crea la categoría cuando el peso es válido', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getSumWeightsCategories.mockResolvedValue(0.5)
    gradesRepository.createCategory.mockResolvedValue({ id: 'cat1', subject_id: 'sub1', weight: 0.3 })
    // Act
    const result = await gradesService.createCategory('u1', 'sub1', { weight: 0.3, parent_category_id: null })
    // Assert
    expect(gradesRepository.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ subject_id: 'sub1', weight: 0.3 })
    )
    expect(result.id).toBe('cat1')
  })
})

// ─── createEvaluation ────────────────────────────────────────────────────────

describe('gradesService — createEvaluation', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.createEvaluation('u1', 'sub1', { grade: 5, weight: 0.5 }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('lanza 400 cuando la nota está fuera de rango', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    const err = await gradesService.createEvaluation('u1', 'sub1', { grade: 0.5, weight: 0.3, category_id: 'cat1' }).catch(e => e)
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/nota/)
  })

  it('lanza 400 cuando la suma de pesos superaría el 100%', async () => {
    // Arrange
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getSumWeightsEvaluations.mockResolvedValue(0.9)
    // Act
    const err = await gradesService
      .createEvaluation('u1', 'sub1', { grade: 5, weight: 0.2, category_id: 'cat1' })
      .catch(e => e)
    // Assert
    expect(err.statusCode).toBe(400)
    expect(err.message).toMatch(/100%/)
  })
})

// ─── deleteCategory ──────────────────────────────────────────────────────────

describe('gradesService — deleteCategory', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.deleteCategory('u1', 'sub1', 'cat1').catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('llama al repository cuando el usuario es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.deleteCategory.mockResolvedValue(undefined)
    await gradesService.deleteCategory('u1', 'sub1', 'cat1')
    expect(gradesRepository.deleteCategory).toHaveBeenCalledWith('cat1')
  })
})

// ─── deleteEvaluation ────────────────────────────────────────────────────────

describe('gradesService — deleteEvaluation', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.deleteEvaluation('u1', 'sub1', 'ev1').catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('llama al repository cuando el usuario es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.deleteEvaluation.mockResolvedValue(undefined)
    await gradesService.deleteEvaluation('u1', 'sub1', 'ev1')
    expect(gradesRepository.deleteEvaluation).toHaveBeenCalledWith('ev1')
  })
})

// ─── _calculateNodeAverage (pure logic) ─────────────────────────────────────

describe('gradesService — _calculateNodeAverage', () => {
  it('retorna 0 cuando no hay evaluaciones ni subcategorías', () => {
    const node = { evaluations: [], subcategories: [] }
    const result = gradesService._calculateNodeAverage(node)
    expect(result.real_average).toBe(0)
    expect(result.projected_average).toBe(0)
  })

  it('calcula el promedio real excluyendo simulaciones', () => {
    // Arrange — una evaluación real (5.0, 0.5) y una simulación (7.0, 0.5)
    const node = {
      evaluations: [
        { grade: '5.0', weight: '0.5', is_simulation: false },
        { grade: '7.0', weight: '0.5', is_simulation: true },
      ],
      subcategories: []
    }
    // Act
    const result = gradesService._calculateNodeAverage(node)
    // Assert — real solo considera la primera: 5*0.5 / 0.5 = 5
    expect(result.real_average).toBeCloseTo(5.0)
    // proyectado considera ambas: (5*0.5 + 7*0.5) / 1.0 = 6
    expect(result.projected_average).toBeCloseTo(6.0)
  })
})
