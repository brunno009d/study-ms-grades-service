import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// ─── Mock Supabase — única dependencia externa ────────────────────────────────
// Solo se mockea el cliente de Supabase. Todo el código real de
// controller → service → repository se ejecuta sin cambios.
const mockSb = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}))

vi.mock('../../config/supabase.js', () => ({ default: mockSb }))

import app from '../../app.js'

const TOKEN = 'Bearer test-token'
const USER_ID = 'test-user-id'

// ─── Helper reutilizable ──────────────────────────────────────────────────────

// Simula checkSubjectOwnership: select('id').eq().eq().maybeSingle()
function makeOwnershipMock(owned = true) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: owned ? { id: 1 } : null,
    error: null,
  })
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle }),
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSb.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } }, error: null,
  })
})

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth — middleware', () => {
  it('401 — sin header de autorización: ningún repository se ejecuta', async () => {
    const res = await request(app).get('/performance/7')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error', 'unauthorized')
    expect(mockSb.from).not.toHaveBeenCalled()
  })

  it('401 — token inválido: Supabase auth rechaza, nada más se ejecuta', async () => {
    mockSb.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Token inválido') })
    const res = await request(app).get('/performance/7').set('Authorization', TOKEN)
    expect(res.status).toBe(401)
    expect(mockSb.from).not.toHaveBeenCalled()
  })
})

// ─── GET /performance/:subject_id ─────────────────────────────────────────────

describe('GET /performance/:subject_id', () => {
  it('200 — con evaluaciones: controller → service → 3 repositories → Supabase', async () => {
    // Arrange
    const categories = [
      { id: 1, subject_id: '7', name: 'Pruebas', weight: 1.0, parent_category_id: null },
    ]
    const evaluations = [
      { id: 10, category_id: 1, grade: 5.0, weight: 1.0, is_simulation: false },
    ]

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: categories, error: null }),
            }),
          }),
        }
      }
      if (table === 'evaluation') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: evaluations, error: null }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).get('/performance/7').set('Authorization', TOKEN)

    // Assert — service calculó el promedio real con los datos de Supabase
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ subject_id: '7' })
    expect(res.body.summary.real_average).toBe(5.0)
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation')
  })

  it('200 — sin categorías: service devuelve estructura vacía sin consultar evaluaciones', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).get('/performance/7').set('Authorization', TOKEN)

    // Assert — sin categorías no debe consultar la tabla de evaluaciones
    expect(res.status).toBe(200)
    expect(res.body.summary.real_average).toBe(0)
    expect(res.body.structure).toHaveLength(0)
    expect(mockSb.from).not.toHaveBeenCalledWith('evaluation')
  })

  it('403 — usuario no es dueño: service lanza error antes del repository de categorías', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(false)
    })

    // Act
    const res = await request(app).get('/performance/7').set('Authorization', TOKEN)

    // Assert
    expect(res.status).toBe(403)
    expect(mockSb.from).not.toHaveBeenCalledWith('evaluation_categories')
  })
})

// ─── POST /subjects/:subject_id/categories ────────────────────────────────────

describe('POST /subjects/:subject_id/categories', () => {
  it('400 — controller rechaza body sin campos obligatorios antes de llamar al service', async () => {
    // Act: falta name
    const res = await request(app)
      .post('/subjects/7/categories')
      .set('Authorization', TOKEN)
      .send({ weight: 0.3 })

    expect(res.status).toBe(400)
    expect(mockSb.from).not.toHaveBeenCalled()
  })

  it('201 — ownership + peso disponible: service persiste la categoría en Supabase', async () => {
    // Arrange: owned, sin categorías existentes (sum=0), insert exitoso
    const created = { id: 5, name: 'Tareas', weight: 0.3, subject_id: '7' }
    let evalCatCallCount = 0

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        evalCatCallCount++
        if (evalCatCallCount === 1) {
          // getSumWeightsCategories: select.eq.is → array de pesos existentes
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        // createCategory: insert.select.single
        const single = vi.fn().mockResolvedValue({ data: created, error: null })
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        }
      }
    })

    // Act
    const res = await request(app)
      .post('/subjects/7/categories')
      .set('Authorization', TOKEN)
      .send({ name: 'Tareas', weight: 0.3 })

    // Assert — los 3 pasos del service llegaron a Supabase
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Tareas', weight: 0.3 })
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
  })

  it('400 — service rechaza cuando el peso supera el 100% con las categorías existentes', async () => {
    // Arrange: owned, peso existente 0.8, intento agregar 0.3 → 1.1 > 1.0
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [{ id: 1, weight: 0.8 }], error: null }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app)
      .post('/subjects/7/categories')
      .set('Authorization', TOKEN)
      .send({ name: 'Tarea', weight: 0.3 })

    expect(res.status).toBe(400)
  })
})

// ─── PATCH /subjects/:subject_id/categories/:id ───────────────────────────────

describe('PATCH /subjects/:subject_id/categories/:id', () => {
  it('200 — update sin cambio de peso: service valida ownership y llama update en Supabase', async () => {
    // Arrange: solo actualiza name, sin peso → omite la validación de suma de pesos
    const updated = { id: 3, name: 'Exámenes Parciales', weight: 0.5 }
    const single = vi.fn().mockResolvedValue({ data: updated, error: null })

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app)
      .patch('/subjects/7/categories/3')
      .set('Authorization', TOKEN)
      .send({ name: 'Exámenes Parciales' })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Exámenes Parciales' })
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
    expect(single).toHaveBeenCalled()
  })
})

// ─── DELETE /subjects/:subject_id/categories/:id ──────────────────────────────

describe('DELETE /subjects/:subject_id/categories/:id', () => {
  it('204 — service valida ownership y repository elimina en Supabase', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).delete('/subjects/7/categories/3').set('Authorization', TOKEN)

    // Assert
    expect(res.status).toBe(204)
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
  })

  it('403 — usuario no es dueño: delete no llega al repository de categorías', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(false)
    })

    // Act
    const res = await request(app).delete('/subjects/7/categories/3').set('Authorization', TOKEN)

    // Assert
    expect(res.status).toBe(403)
    expect(mockSb.from).not.toHaveBeenCalledWith('evaluation_categories')
  })
})

// ─── POST /subjects/:subject_id/categories/:category_id/evaluations ───────────

describe('POST /subjects/:subject_id/categories/:category_id/evaluations', () => {
  it('400 — controller rechaza body sin campos obligatorios antes de llamar al service', async () => {
    // Act: falta grade y weight
    const res = await request(app)
      .post('/subjects/7/categories/3/evaluations')
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba 1' })

    expect(res.status).toBe(400)
    expect(mockSb.from).not.toHaveBeenCalled()
  })

  it('201 — flujo completo: ownership + peso disponible + insert en Supabase', async () => {
    // Arrange
    const created = { id: 10, name: 'Prueba 1', grade: 6.0, weight: 0.5, category_id: 3 }
    let evalCallCount = 0

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation') {
        evalCallCount++
        if (evalCallCount === 1) {
          // getSumWeightsEvaluations: select.eq → array de pesos existentes
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
        // createEvaluation: insert.select.single
        const single = vi.fn().mockResolvedValue({ data: created, error: null })
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        }
      }
    })

    // Act
    const res = await request(app)
      .post('/subjects/7/categories/3/evaluations')
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba 1', grade: 6.0, weight: 0.5, is_simulation: false })

    // Assert — controller convirtió category_id a int: parseInt('3') = 3
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ name: 'Prueba 1', grade: 6.0 })
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation')
  })
})

// ─── PATCH /subjects/:subject_id/evaluations/:id ─────────────────────────────

describe('PATCH /subjects/:subject_id/evaluations/:id', () => {
  it('200 — update sin cambio de nota ni peso: service valida ownership y actualiza en Supabase', async () => {
    // Arrange: solo actualiza name → omite validaciones de grade y weight
    const updated = { id: 10, name: 'Prueba Final', grade: 6.0, weight: 0.5 }
    const single = vi.fn().mockResolvedValue({ data: updated, error: null })

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({ single }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app)
      .patch('/subjects/7/evaluations/10')
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba Final' })

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Prueba Final' })
    expect(single).toHaveBeenCalled()
  })
})

// ─── DELETE /subjects/:subject_id/evaluations/:id ────────────────────────────

describe('DELETE /subjects/:subject_id/evaluations/:id', () => {
  it('204 — service valida ownership y repository elimina la evaluación de Supabase', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation') {
        return {
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).delete('/subjects/7/evaluations/10').set('Authorization', TOKEN)

    // Assert
    expect(res.status).toBe(204)
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation')
  })
})

// ─── GET /dashboard/current-progress ─────────────────────────────────────────

describe('GET /dashboard/current-progress', () => {
  it('200 — service consulta student_subjects y calcula rendimiento por ramo cursando', async () => {
    // Arrange: 1 ramo cursando, sin categorías (promedio = 0)
    // from('student_subjects') se llama 2 veces:
    //   1ª: _getPerformanceByFilter → .select().eq().eq() → array
    //   2ª: checkSubjectOwnership   → .select().eq().eq().maybeSingle()
    let ssCallCount = 0

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') {
        ssCallCount++
        if (ssCallCount === 1) {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{
                    subject_id: 7,
                    status: 'cursando',
                    subjects: { name: 'Cálculo', code: 'MAT101' },
                  }],
                  error: null,
                }),
              }),
            }),
          }
        }
        return makeOwnershipMock(true)
      }
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).get('/dashboard/current-progress').set('Authorization', TOKEN)

    // Assert — controller mapea a {subject_code, subject_name, average}
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({
      subject_code: 'MAT101',
      subject_name: 'Cálculo',
      average: 0,
    })
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
  })

  it('200 — sin materias cursando: service devuelve [] y el controller responde array vacío', async () => {
    // Arrange
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }
      }
    })

    // Act
    const res = await request(app).get('/dashboard/current-progress').set('Authorization', TOKEN)

    // Assert
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
