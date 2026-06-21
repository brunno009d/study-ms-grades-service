import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

import gradesRepository from '../../repository/gradesRepository.js'

const mockChain = (finalValue) => {
  const chain = {
    then: (resolve, reject) => Promise.resolve(finalValue).then(resolve, reject),
  }
  ;['select', 'update', 'insert', 'delete', 'eq', 'in', 'is', 'order', 'gte', 'lte'].forEach(
    (m) => { chain[m] = vi.fn().mockReturnValue(chain) }
  )
  chain.single      = vi.fn().mockResolvedValue(finalValue)
  chain.maybeSingle = vi.fn().mockResolvedValue(finalValue)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ─── getCategoriesBySubject ────────────────────────────────────────────────

describe('gradesRepository — getCategoriesBySubject', () => {
  it('retorna las categorías del ramo', async () => {
    // Arrange
    const fakeCategories = [{ id: 1, name: 'Controles', weight: 30 }]
    mockSupabase.from.mockReturnValue(mockChain({ data: fakeCategories, error: null }))

    // Act
    const result = await gradesRepository.getCategoriesBySubject(10)

    // Assert
    expect(result).toEqual(fakeCategories)
    expect(mockSupabase.from).toHaveBeenCalledWith('evaluation_categories')
  })

  it('retorna arreglo vacío cuando data es null', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: null }))

    // Act
    const result = await gradesRepository.getCategoriesBySubject(10)

    // Assert
    expect(result).toEqual([])
  })
})

// ─── getEvaluationsByCategoryIds ──────────────────────────────────────────

describe('gradesRepository — getEvaluationsByCategoryIds', () => {
  it('retorna arreglo vacío sin consultar BD cuando no hay IDs', async () => {
    // Arrange — short circuit cuando el arreglo está vacío

    // Act
    const result = await gradesRepository.getEvaluationsByCategoryIds([])

    // Assert
    expect(result).toEqual([])
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('retorna evaluaciones cuando hay IDs válidos', async () => {
    // Arrange
    const fakeEvals = [{ id: 1, name: 'Control 1', weight: 15 }]
    mockSupabase.from.mockReturnValue(mockChain({ data: fakeEvals, error: null }))

    // Act
    const result = await gradesRepository.getEvaluationsByCategoryIds([1, 2])

    // Assert
    expect(result).toEqual(fakeEvals)
  })
})

// ─── createCategory ────────────────────────────────────────────────────────

describe('gradesRepository — createCategory', () => {
  it('retorna la categoría creada', async () => {
    // Arrange
    const newCategory = { subject_id: 10, name: 'Exámenes', weight: 40 }
    const created = { id: 2, ...newCategory }
    mockSupabase.from.mockReturnValue(mockChain({ data: created, error: null }))

    // Act
    const result = await gradesRepository.createCategory(newCategory)

    // Assert
    expect(result).toEqual(created)
  })
})

// ─── deleteEvaluation ──────────────────────────────────────────────────────

describe('gradesRepository — deleteEvaluation', () => {
  it('retorna true al eliminar exitosamente', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ error: null }))

    // Act
    const result = await gradesRepository.deleteEvaluation(1)

    // Assert
    expect(result).toBe(true)
  })

  it('lanza el error cuando falla la eliminación', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ error: new Error('No se puede eliminar') }))

    // Act & Assert
    await expect(gradesRepository.deleteEvaluation(1)).rejects.toThrow('No se puede eliminar')
  })
})

// ─── getSumWeightsCategories ───────────────────────────────────────────────

describe('gradesRepository — getSumWeightsCategories', () => {
  it('suma los pesos correctamente', async () => {
    // Arrange
    const fakeCategories = [
      { id: 1, weight: '30' },
      { id: 2, weight: '20' },
    ]
    mockSupabase.from.mockReturnValue(mockChain({ data: fakeCategories, error: null }))

    // Act
    const result = await gradesRepository.getSumWeightsCategories(10)

    // Assert
    expect(result).toBe(50)
  })

  it('excluye la categoría indicada del total', async () => {
    // Arrange
    const fakeCategories = [
      { id: 1, weight: '30' },
      { id: 2, weight: '20' },
    ]
    mockSupabase.from.mockReturnValue(mockChain({ data: fakeCategories, error: null }))

    // Act — excluir categoría con id=1
    const result = await gradesRepository.getSumWeightsCategories(10, null, 1)

    // Assert — solo suma el id=2
    expect(result).toBe(20)
  })
})

// ─── checkSubjectOwnership ────────────────────────────────────────────────

describe('gradesRepository — checkSubjectOwnership', () => {
  it('retorna true cuando el ramo pertenece al estudiante', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: { id: 1 }, error: null }))

    // Act
    const result = await gradesRepository.checkSubjectOwnership('u1', 10)

    // Assert
    expect(result).toBe(true)
  })

  it('retorna false cuando el ramo no pertenece al estudiante', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: null }))

    // Act
    const result = await gradesRepository.checkSubjectOwnership('u1', 10)

    // Assert
    expect(result).toBe(false)
  })

  it('retorna false (sin lanzar) cuando Supabase falla', async () => {
    // Arrange — checkSubjectOwnership captura errores y retorna false
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('Error BD') }))

    // Act
    const result = await gradesRepository.checkSubjectOwnership('u1', 10)

    // Assert
    expect(result).toBe(false)
  })
})
