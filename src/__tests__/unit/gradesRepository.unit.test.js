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

// ─── getSumWeightsCategories — rama parentCategoryId ─────────────────────

describe('gradesRepository — getSumWeightsCategories (con parentCategoryId)', () => {
  it('filtra por parent_category_id cuando se pasa como argumento', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: [{ id: 3, weight: '50' }], error: null }))
    // Act
    const result = await gradesRepository.getSumWeightsCategories(10, 2)
    // Assert — no lanza y retorna la suma
    expect(result).toBe(50)
  })
})

// ─── getCategoryById ──────────────────────────────────────────────────────

describe('gradesRepository — getCategoryById', () => {
  it('retorna la categoría cuando existe', async () => {
    // Arrange
    const cat = { id: 1, name: 'Pruebas', weight: 0.5 }
    mockSupabase.from.mockReturnValue(mockChain({ data: cat, error: null }))
    // Act
    const result = await gradesRepository.getCategoryById(1)
    // Assert
    expect(result).toEqual(cat)
    expect(mockSupabase.from).toHaveBeenCalledWith('evaluation_categories')
  })

  it('retorna null cuando no existe', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: null }))
    // Act
    const result = await gradesRepository.getCategoryById(999)
    // Assert
    expect(result).toBeNull()
  })
})

// ─── updateCategory ───────────────────────────────────────────────────────

describe('gradesRepository — updateCategory', () => {
  it('retorna la categoría actualizada', async () => {
    // Arrange
    const updated = { id: 1, name: 'Pruebas Actualizadas', weight: 0.6 }
    mockSupabase.from.mockReturnValue(mockChain({ data: updated, error: null }))
    // Act
    const result = await gradesRepository.updateCategory(1, { name: 'Pruebas Actualizadas' })
    // Assert
    expect(result).toEqual(updated)
  })

  it('lanza error cuando falla la actualización', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('update failed') }))
    // Act & Assert
    await expect(gradesRepository.updateCategory(1, {})).rejects.toThrow('update failed')
  })
})

// ─── deleteCategory ───────────────────────────────────────────────────────

describe('gradesRepository — deleteCategory', () => {
  it('retorna true al eliminar exitosamente', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ error: null }))
    // Act
    const result = await gradesRepository.deleteCategory(1)
    // Assert
    expect(result).toBe(true)
  })

  it('lanza error cuando falla la eliminación', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ error: new Error('delete failed') }))
    // Act & Assert
    await expect(gradesRepository.deleteCategory(1)).rejects.toThrow('delete failed')
  })
})

// ─── getSumWeightsEvaluations ─────────────────────────────────────────────

describe('gradesRepository — getSumWeightsEvaluations', () => {
  it('suma todos los pesos cuando no hay exclusión', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: [{ id: 1, weight: '0.5' }, { id: 2, weight: '0.3' }], error: null }))
    // Act
    const result = await gradesRepository.getSumWeightsEvaluations(1)
    // Assert
    expect(result).toBeCloseTo(0.8)
  })

  it('excluye la evaluación indicada del total', async () => {
    // Arrange
    mockSupabase.from.mockReturnValue(mockChain({ data: [{ id: 1, weight: '0.5' }, { id: 2, weight: '0.3' }], error: null }))
    // Act — excluir evaluación con id=1
    const result = await gradesRepository.getSumWeightsEvaluations(1, 1)
    // Assert — solo suma el id=2
    expect(result).toBeCloseTo(0.3)
  })
})

// ─── getEvaluationById ───────────────────────────────────────────────────────

describe('gradesRepository — getEvaluationById', () => {
  it('retorna la evaluación cuando existe', async () => {
    const ev = { id: 1, name: 'Control 1', weight: '0.3' }
    mockSupabase.from.mockReturnValue(mockChain({ data: ev, error: null }))
    const result = await gradesRepository.getEvaluationById(1)
    expect(result).toEqual(ev)
    expect(mockSupabase.from).toHaveBeenCalledWith('evaluation')
  })

  it('lanza error cuando falla la consulta', async () => {
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('not found') }))
    await expect(gradesRepository.getEvaluationById(999)).rejects.toThrow('not found')
  })
})

// ─── getSumWeightsCategories — weight falsy branch ───────────────────────────

describe('gradesRepository — getSumWeightsCategories (peso falsy)', () => {
  it('usa 0 cuando el peso de la categoría no es parseable', async () => {
    // Arrange — weight undefined → parseFloat(undefined) = NaN → || 0
    mockSupabase.from.mockReturnValue(mockChain({ data: [{ id: 5, weight: undefined }], error: null }))
    const result = await gradesRepository.getSumWeightsCategories(10)
    expect(result).toBe(0)
  })

  it('lanza error cuando Supabase falla en getSumWeightsCategories', async () => {
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('DB fail') }))
    await expect(gradesRepository.getSumWeightsCategories(10)).rejects.toThrow('DB fail')
  })
})

// ─── getSumWeightsEvaluations — branches adicionales ─────────────────────────

describe('gradesRepository — getSumWeightsEvaluations (branches extra)', () => {
  it('usa 0 cuando el peso de la evaluación no es parseable', async () => {
    // Arrange — weight undefined → parseFloat(undefined) = NaN → || 0
    mockSupabase.from.mockReturnValue(mockChain({ data: [{ id: 1, weight: undefined }], error: null }))
    const result = await gradesRepository.getSumWeightsEvaluations(1)
    expect(result).toBe(0)
  })

  it('lanza error cuando Supabase falla en getSumWeightsEvaluations', async () => {
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('DB error') }))
    await expect(gradesRepository.getSumWeightsEvaluations(1)).rejects.toThrow('DB error')
  })
})

// ─── getCategoryById — error path ────────────────────────────────────────────

describe('gradesRepository — getCategoryById (error)', () => {
  it('lanza error cuando Supabase falla', async () => {
    mockSupabase.from.mockReturnValue(mockChain({ data: null, error: new Error('DB error') }))
    await expect(gradesRepository.getCategoryById(1)).rejects.toThrow('DB error')
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
