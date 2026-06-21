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

// ─── updateCategory ──────────────────────────────────────────────────────────

describe('gradesService — updateCategory', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.updateCategory('u1', 'sub1', 'cat1', { name: 'X' }).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('actualiza sin validar pesos cuando no se cambia weight', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.updateCategory.mockResolvedValue({ id: 'cat1', name: 'Updated' })
    const result = await gradesService.updateCategory('u1', 'sub1', 'cat1', { name: 'Updated' })
    expect(gradesRepository.updateCategory).toHaveBeenCalledWith('cat1', { name: 'Updated' })
    expect(result).toEqual({ id: 'cat1', name: 'Updated' })
  })

  it('lanza 400 cuando el nuevo peso superaría el 100%', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getCategoryById.mockResolvedValue({ id: 'cat1', parent_category_id: null })
    gradesRepository.getSumWeightsCategories.mockResolvedValue(0.9)
    const err = await gradesService
      .updateCategory('u1', 'sub1', 'cat1', { weight: 0.3 }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

// ─── updateEvaluation ─────────────────────────────────────────────────────────

describe('gradesService — updateEvaluation', () => {
  it('lanza 403 cuando el usuario no es dueño', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)
    const err = await gradesService.updateEvaluation('u1', 'sub1', 'ev1', {}).catch(e => e)
    expect(err.statusCode).toBe(403)
  })

  it('actualiza sin validar pesos cuando no se cambia grade ni weight', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.updateEvaluation.mockResolvedValue({ id: 'ev1', name: 'Control' })
    const result = await gradesService.updateEvaluation('u1', 'sub1', 'ev1', { name: 'Control' })
    expect(result).toEqual({ id: 'ev1', name: 'Control' })
  })

  it('lanza 400 cuando el peso actualizado superaría el 100%', async () => {
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getEvaluationById.mockResolvedValue({ id: 'ev1', category_id: 'cat1' })
    gradesRepository.getSumWeightsEvaluations.mockResolvedValue(0.9)
    const err = await gradesService
      .updateEvaluation('u1', 'sub1', 'ev1', { weight: 0.3 }).catch(e => e)
    expect(err.statusCode).toBe(400)
  })
})

// ─── getAllPerformance / getCurrentPerformance ─────────────────────────────────

describe('gradesService — getAllPerformance', () => {
  it('retorna [] cuando el estudiante no tiene materias', async () => {
    // Arrange — supabase retorna lista vacía
    const mockChain = {
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    const { default: supabase } = await import('../../config/supabase.js')
    supabase.from.mockReturnValue(mockChain)
    // Act
    const result = await gradesService.getAllPerformance('u1')
    // Assert
    expect(result).toEqual([])
  })
})

describe('gradesService — getCurrentPerformance', () => {
  it('filtra por status cursando y retorna []', async () => {
    const mockChain = {
      then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    const { default: supabase } = await import('../../config/supabase.js')
    supabase.from.mockReturnValue(mockChain)
    const result = await gradesService.getCurrentPerformance('u1')
    expect(result).toEqual([])
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

  it('excluye evaluaciones con grade null del cálculo real y proyectado', () => {
    // Arrange — evaluación con grade null
    const node = {
      evaluations: [
        { grade: null, weight: '0.5', is_simulation: false },
        { grade: '6.0', weight: '0.5', is_simulation: false },
      ],
      subcategories: []
    }
    // Act
    const result = gradesService._calculateNodeAverage(node)
    // Assert — solo la segunda (6.0 * 0.5 / 0.5) = 6
    expect(result.real_average).toBeCloseTo(6.0)
    expect(result.projected_average).toBeCloseTo(6.0)
  })

  it('incorpora subcategorías en el cálculo (rama real_weight_total > 0)', () => {
    // Arrange — subcategoría con evaluación real
    const sub = {
      evaluations: [{ grade: '4.0', weight: '1.0', is_simulation: false }],
      subcategories: [],
      weight: '0.5'
    }
    const node = { evaluations: [], subcategories: [sub] }
    // Act
    const result = gradesService._calculateNodeAverage(node)
    // Assert — el promedio del nodo incorpora la subcategoría
    expect(result.real_average).toBeCloseTo(4.0)
    expect(result.projected_average).toBeCloseTo(4.0)
  })

  it('subcategoría sin calificaciones no suma al real (projected_weight_total > 0 === false)', () => {
    // Arrange — subcategoría con evaluación de grade null (sin peso real)
    const sub = {
      evaluations: [{ grade: null, weight: '1.0', is_simulation: false }],
      subcategories: [],
      weight: '0.5'
    }
    const node = { evaluations: [], subcategories: [sub] }
    // Act
    const result = gradesService._calculateNodeAverage(node)
    // Assert — real_weight_total = 0, projected_weight_total = 0 → promedio = 0
    expect(result.real_average).toBe(0)
    expect(result.projected_average).toBe(0)
  })
})

// ─── _buildAndCalculateTree con subcategorías ─────────────────────────────────

describe('gradesService — _buildAndCalculateTree', () => {
  it('anida categorías hijas dentro de su categoría padre', () => {
    // Arrange
    const categories = [
      { id: 'root1', subject_id: 'sub1', parent_category_id: null,    weight: 1.0 },
      { id: 'child1', subject_id: 'sub1', parent_category_id: 'root1', weight: 0.5 },
    ]
    const evaluations = [
      { category_id: 'child1', grade: '5.0', weight: '1.0', is_simulation: false }
    ]
    // Act
    const tree = gradesService._buildAndCalculateTree(categories, evaluations)
    // Assert — solo un nodo raíz con una subcategoría
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('root1')
    expect(tree[0].subcategories).toHaveLength(1)
    expect(tree[0].subcategories[0].id).toBe('child1')
  })
})

// ─── _getPerformanceByFilter — catch block y success path ────────────────────

describe('gradesService — _getPerformanceByFilter (catch block interno)', () => {
  it('incluye la materia con summary null cuando getSubjectPerformance lanza', async () => {
    // Arrange — supabase retorna una materia; ownership falla → 403 → catch
    const mockChain = {
      then: (resolve) => Promise.resolve({
        data: [{ subject_id: 's99', status: 'cursando', subjects: { name: 'IA', code: 'CS99' } }],
        error: null
      }).then(resolve),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    const { default: supabase } = await import('../../config/supabase.js')
    supabase.from.mockReturnValue(mockChain)
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false) // → 403 throw

    // Act
    const result = await gradesService.getAllPerformance('u1')

    // Assert — la materia se incluye con summary: null (catch path)
    expect(result).toHaveLength(1)
    expect(result[0].subject_code).toBe('CS99')
    expect(result[0].summary).toBeNull()
  })

  it('incluye la materia con performance cuando getSubjectPerformance tiene éxito', async () => {
    // Arrange — supabase retorna una materia; ownership ok → categorías vacías → estructura vacía
    const subjectData = [{ subject_id: 'sub1', status: 'cursando', subjects: { name: 'Cálculo', code: 'MAT101' } }]
    const mockChain = {
      then: (resolve) => Promise.resolve({ data: subjectData, error: null }).then(resolve),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    const { default: supabase } = await import('../../config/supabase.js')
    supabase.from.mockReturnValue(mockChain)
    gradesRepository.checkSubjectOwnership.mockResolvedValue(true)
    gradesRepository.getCategoriesBySubject.mockResolvedValue([])
    gradesRepository.getEvaluationsByCategoryIds.mockResolvedValue([])

    // Act
    const result = await gradesService.getCurrentPerformance('u1')

    // Assert — éxito: la materia tiene structure vacía y summary real_average=0
    expect(result).toHaveLength(1)
    expect(result[0].subject_code).toBe('MAT101')
    expect(result[0].summary.real_average).toBe(0)
  })

  it('usa null cuando subjects es null (optional chaining ?.name)', async () => {
    // Arrange — subjects: null → ss.subjects?.name = undefined → || null
    const subjectData = [{ subject_id: 'sub99', status: 'aprobado', subjects: null }]
    const mockChain = {
      then: (resolve) => Promise.resolve({ data: subjectData, error: null }).then(resolve),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    const { default: supabase } = await import('../../config/supabase.js')
    supabase.from.mockReturnValue(mockChain)
    // checkSubjectOwnership retorna false → catch → summary: null
    gradesRepository.checkSubjectOwnership.mockResolvedValue(false)

    // Act
    const result = await gradesService.getAllPerformance('u1')

    // Assert — el catch path incluye subject_name: null y subject_code: null
    expect(result[0].subject_name).toBeNull()
    expect(result[0].subject_code).toBeNull()
  })
})

// ─── _calculateNodeAverage con isArray=true ───────────────────────────────────

describe('gradesService — _calculateNodeAverage (llamada con array)', () => {
  it('calcula el promedio cuando se pasa un array de subcategorías', () => {
    // Arrange — array de sub-nodos (isArray=true path)
    const subs = [
      {
        evaluations: [{ grade: '6.0', weight: '1.0', is_simulation: false }],
        subcategories: [],
        weight: '1.0',
        real_average: 0, projected_average: 0, real_weight_total: 0, projected_weight_total: 0
      }
    ]
    // Act
    const result = gradesService._calculateNodeAverage(subs)
    // Assert — isArray branch: no muta el array, pero retorna los promedios
    expect(result.real_average).toBeCloseTo(6.0)
  })

  it('usa 0 como peso cuando sub.weight no es parseable (branch || 0)', () => {
    // Arrange — subcategoría con weight undefined → parseFloat → NaN → || 0
    const sub = {
      evaluations: [{ grade: '5.0', weight: '1.0', is_simulation: false }],
      subcategories: [],
      weight: undefined
    }
    const node = { evaluations: [], subcategories: [sub] }
    // Act
    const result = gradesService._calculateNodeAverage(node)
    // Assert — sub.weight = 0 → no contribuye al promedio del nodo padre
    expect(result.real_average).toBe(0)
  })
})
