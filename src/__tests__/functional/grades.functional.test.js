import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// ─── Mock Supabase — única dependencia externa ────────────────────────────────
const mockSb = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}))

vi.mock('../../config/supabase.js', () => ({ default: mockSb }))

import app from '../../app.js'

const TOKEN = 'Bearer test-token'
const USER_ID = 'test-user-id'

// ─── Helper: simula checkSubjectOwnership → .select('id').eq().eq().maybeSingle()
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
  mockSb.auth.getUser.mockResolvedValue({
    data: { user: { id: USER_ID } }, error: null,
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flujo 1: Crear categoría → crear evaluación → consultar rendimiento
// ─────────────────────────────────────────────────────────────────────────────

describe('T4 — Flujo: crear categoría → registrar evaluación → consultar rendimiento', () => {
  it('el estudiante arma su estructura de notas y consulta su promedio real', async () => {
    const SUBJECT_ID = '7'
    const CATEGORY = { id: 3, name: 'Pruebas', weight: 0.6, subject_id: SUBJECT_ID }
    const EVALUATION = { id: 10, name: 'Prueba 1', grade: 6.0, weight: 1.0, category_id: 3 }

    // ── Paso 1: Crear categoría ───────────────────────────────────────────────
    // Arrange: owned, sin categorías previas (sum pesos=0), insert exitoso
    let evalCatCallCount = 0
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        evalCatCallCount++
        if (evalCatCallCount === 1) {
          // getSumWeightsCategories → select.eq.is
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }
        }
        // createCategory → insert.select.single
        const single = vi.fn().mockResolvedValue({ data: CATEGORY, error: null })
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        }
      }
    })
    // Act
    const catRes = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Pruebas', weight: 0.6 })
    // Assert
    expect(catRes.status).toBe(201)
    expect(catRes.body).toMatchObject({ name: 'Pruebas', weight: 0.6 })

    // ── Paso 2: Registrar evaluación en la categoría recién creada ────────────
    // Arrange: owned, sin evaluaciones previas (sum pesos=0), insert exitoso
    let evalCallCount = 0
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation') {
        evalCallCount++
        if (evalCallCount === 1) {
          // getSumWeightsEvaluations → select.eq
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }
        }
        // createEvaluation → insert.select.single
        const single = vi.fn().mockResolvedValue({ data: EVALUATION, error: null })
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single }),
          }),
        }
      }
    })
    // Act
    const evalRes = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories/3/evaluations`)
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba 1', grade: 6.0, weight: 1.0, is_simulation: false })
    // Assert — controller convirtió category_id a int
    expect(evalRes.status).toBe(201)
    expect(evalRes.body).toMatchObject({ name: 'Prueba 1', grade: 6.0 })

    // ── Paso 3: Consultar rendimiento del ramo ────────────────────────────────
    // Arrange: owned, categoría con una evaluación → service calcula promedio
    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 3, subject_id: SUBJECT_ID, name: 'Pruebas', weight: 0.6, parent_category_id: null }],
                error: null,
              }),
            }),
          }),
        }
      }
      if (table === 'evaluation') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ id: 10, category_id: 3, grade: 6.0, weight: 1.0, is_simulation: false }],
                error: null,
              }),
            }),
          }),
        }
      }
    })
    // Act
    const perfRes = await request(app)
      .get(`/performance/${SUBJECT_ID}`)
      .set('Authorization', TOKEN)
    // Assert — service calculó el promedio real con los datos de Supabase
    expect(perfRes.status).toBe(200)
    expect(perfRes.body.subject_id).toBe(SUBJECT_ID)
    expect(perfRes.body.summary.real_average).toBe(6.0)
    expect(perfRes.body.structure).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Flujo 2: Validaciones de negocio en cascada
// ─────────────────────────────────────────────────────────────────────────────

describe('T4 — Flujo: validaciones de negocio bloquean operaciones inválidas', () => {
  it('el controller y el service rechazan entradas inválidas en cada capa', async () => {
    const SUBJECT_ID = '7'

    // ── Paso 1: Crear evaluación sin campos → controller rechaza (400) ─────────
    const missingFields = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories/3/evaluations`)
      .set('Authorization', TOKEN)
      .send({ name: 'Prueba' })        // falta grade y weight
    expect(missingFields.status).toBe(400)
    expect(mockSb.from).not.toHaveBeenCalled()

    // ── Paso 2: Crear categoría sin ser dueño → service rechaza (403) ─────────
    vi.clearAllMocks()
    mockSb.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(false)  // no es dueño
    })
    const notOwner = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Tareas', weight: 0.3 })
    expect(notOwner.status).toBe(403)
    // ownership check fue el único call a Supabase
    expect(mockSb.from).toHaveBeenCalledWith('student_subjects')
    expect(mockSb.from).not.toHaveBeenCalledWith('evaluation_categories')

    // ── Paso 3: Peso que supera 100% → service rechaza (400) ──────────────────
    vi.clearAllMocks()
    mockSb.auth.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    mockSb.from.mockImplementation((table) => {
      if (table === 'student_subjects') return makeOwnershipMock(true)
      if (table === 'evaluation_categories') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [{ id: 1, weight: 0.9 }], error: null }),
            }),
          }),
        }
      }
    })
    const overWeight = await request(app)
      .post(`/subjects/${SUBJECT_ID}/categories`)
      .set('Authorization', TOKEN)
      .send({ name: 'Otra categoría', weight: 0.2 })  // 0.9 + 0.2 > 1.0
    expect(overWeight.status).toBe(400)
  })
})
