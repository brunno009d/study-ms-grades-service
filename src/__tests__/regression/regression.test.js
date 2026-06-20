import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

const mockSb = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}))

vi.mock('../../config/supabase.js', () => ({ default: mockSb }))

import app from '../../app.js'

const TOKEN = 'Bearer test-token'
const USER_ID = 'test-user-id'
const SUBJECT_ID = '7'

// Helper: simula checkSubjectOwnership → select.eq.eq.maybeSingle
function makeOwnershipMock(owned = true) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: owned ? { id: 1 } : null, error: null,
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
  mockSb.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
})

describe('Regresión — bugs corregidos en grades-service', () => {

  it('[BUG-001] createCategory con pesos acumulados > 1.0 retorna 400 sin insertar en Supabase', async () => {
    // Bug: el service no verificaba el acumulado de pesos antes de insertar;
    // era posible tener categorías cuya suma de pesos superaba 100%.
    // Fix: getSumWeightsCategories + validación (sum + newWeight > 1) antes del insert.
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              // peso existente ya en 0.9
              is: vi.fn().mockResolvedValue({ data: [{ id: 1, weight: 0.9 }], error: null }),
            }),
          }),
        }
      }
    })

    const res = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Extra', weight: 0.2 })  // 0.9 + 0.2 = 1.1 → supera límite

    expect(res.status).toBe(400)
    // from() fue llamado para ownership y sum check, NUNCA para insert
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).toHaveBeenCalledWith('evaluation_categories')
    expect(mockSb.from).toHaveBeenCalledTimes(2)
  })

  it('[BUG-002] createEvaluation sin "grade" retorna 400 sin tocar Supabase', async () => {
    // Bug: el controller no validaba la presencia de grade, weight y name;
    // el service insertaba undefined en la columna grade, rompiendo los cálculos de promedio.
    // Fix: validación de campos requeridos en el controller antes de llamar al service.
    const res = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories/3/evaluations`)
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba 1' })  // falta grade y weight

    expect(res.status).toBe(400)
    expect(mockSb.from).not.toHaveBeenCalled()
  })

  it('[BUG-003] createCategory en ramo ajeno retorna 403 sin tocar evaluation_categories', async () => {
    // Bug: la verificación de ownership se hacía después de la consulta de pesos,
    // exponiendo información sobre categorías de otros estudiantes.
    // Fix: checkSubjectOwnership es el primer paso del service.
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(false)  // no es dueño
    })

    const res = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Tareas', weight: 0.3 })

    expect(res.status).toBe(403)
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).not.toHaveBeenCalledWith('evaluation_categories')
  })

  it('[BUG-004] createCategory sin el campo "weight" retorna 400 sin tocar Supabase', async () => {
    // Bug: weight undefined pasaba la validación del service y se insertaba null en la BD,
    // haciendo que los cálculos de promedio ponderado devolvieran NaN.
    // Fix: validación de campos requeridos (name y weight) en el controller.
    const res = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Tareas' })  // falta weight

    expect(res.status).toBe(400)
    expect(mockSb.from).not.toHaveBeenCalled()
  })

})
