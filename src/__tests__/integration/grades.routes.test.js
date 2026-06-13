import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

// ─── Mock supabase (requireAuth) ──────────────────────────────────────────────
const mockSb = vi.hoisted(() => ({ auth: { getUser: vi.fn() } }))
vi.mock('../../config/supabase.js', () => ({ default: mockSb }))

// ─── Mock servicio ────────────────────────────────────────────────────────────
vi.mock('../../service/gradesService.js', () => ({
  default: {
    getSubjectPerformance:  vi.fn(),
    createCategory:         vi.fn(),
    updateCategory:         vi.fn(),
    deleteCategory:         vi.fn(),
    createEvaluation:       vi.fn(),
    updateEvaluation:       vi.fn(),
    deleteEvaluation:       vi.fn(),
    getCurrentPerformance:  vi.fn(),   // nombre real del método en el controller
  }
}))

import gradesService from '../../service/gradesService.js'
import app from '../../app.js'

const AUTH = { Authorization: 'Bearer test-token' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockSb.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null })
})

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth — rutas protegidas', () => {
  it('retorna 401 sin header de autorización', async () => {
    const res = await request(app).get('/performance/1')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error', 'unauthorized')
  })

  it('retorna 401 con token inválido', async () => {
    mockSb.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Token inválido') })
    const res = await request(app).get('/performance/1').set(AUTH)
    expect(res.status).toBe(401)
  })
})

// ─── GET /performance/:subject_id ─────────────────────────────────────────────

describe('GET /performance/:subject_id', () => {
  it('retorna 200 con el rendimiento del ramo', async () => {
    // Arrange
    gradesService.getSubjectPerformance.mockResolvedValue({ subject_id: 7, average: 5.5, categories: [] })
    // Act
    const res = await request(app).get('/performance/7').set(AUTH)
    // Assert — subject_id llega como string desde los params (sin parseInt en el controller)
    expect(res.status).toBe(200)
    expect(gradesService.getSubjectPerformance).toHaveBeenCalledWith('test-user-id', '7')
  })

  it('retorna 403 cuando el ramo no pertenece al usuario', async () => {
    const err = new Error('No autorizado')
    err.statusCode = 403
    gradesService.getSubjectPerformance.mockRejectedValue(err)
    const res = await request(app).get('/performance/7').set(AUTH)
    expect(res.status).toBe(403)
  })
})

// ─── POST /subjects/:subject_id/categories ────────────────────────────────────

describe('POST /subjects/:subject_id/categories', () => {
  it('retorna 400 cuando faltan campos obligatorios', async () => {
    const res = await request(app)
      .post('/subjects/7/categories')
      .set(AUTH)
      .send({ weight: 0.3 })                  // falta name
    expect(res.status).toBe(400)
  })

  it('retorna 201 al crear la categoría correctamente', async () => {
    // Arrange
    gradesService.createCategory.mockResolvedValue({ id: 1, name: 'Tareas', weight: 0.3 })
    // Act
    const res = await request(app)
      .post('/subjects/7/categories')
      .set(AUTH)
      .send({ name: 'Tareas', weight: 0.3 })
    // Assert — el controller pasa el body completo como tercer arg, subject_id como string
    expect(res.status).toBe(201)
    expect(gradesService.createCategory).toHaveBeenCalledWith(
      'test-user-id', '7', expect.objectContaining({ name: 'Tareas', weight: 0.3 })
    )
  })
})

// ─── DELETE /subjects/:subject_id/categories/:id ──────────────────────────────

describe('DELETE /subjects/:subject_id/categories/:id', () => {
  it('retorna 204 al eliminar correctamente', async () => {
    gradesService.deleteCategory.mockResolvedValue({ deleted: true })
    const res = await request(app).delete('/subjects/7/categories/3').set(AUTH)
    // Los params siempre son strings cuando no hay parseInt en el controller
    expect(res.status).toBe(204)
    expect(gradesService.deleteCategory).toHaveBeenCalledWith('test-user-id', '7', '3')
  })
})

// ─── POST /subjects/:subject_id/categories/:category_id/evaluations ───────────

describe('POST /subjects/:subject_id/categories/:category_id/evaluations', () => {
  it('retorna 400 cuando faltan campos obligatorios', async () => {
    const res = await request(app)
      .post('/subjects/7/categories/3/evaluations')
      .set(AUTH)
      .send({ name: 'Prueba 1' })              // falta grade y weight
    expect(res.status).toBe(400)
  })

  it('retorna 201 al registrar la evaluación', async () => {
    gradesService.createEvaluation.mockResolvedValue({ id: 10, name: 'Prueba 1', grade: 6.0 })
    const res = await request(app)
      .post('/subjects/7/categories/3/evaluations')
      .set(AUTH)
      .send({ name: 'Prueba 1', grade: 6.0, weight: 0.5, is_simulation: false })
    // subject_id llega como string; category_id se convierte a int dentro del body
    expect(res.status).toBe(201)
    expect(gradesService.createEvaluation).toHaveBeenCalledWith(
      'test-user-id', '7', expect.objectContaining({ name: 'Prueba 1', category_id: 3 })
    )
  })
})

// ─── GET /dashboard/current-progress ─────────────────────────────────────────

describe('GET /dashboard/current-progress', () => {
  it('retorna 200 con el progreso actual del estudiante', async () => {
    // El controller llama getCurrentPerformance y mapea los campos
    gradesService.getCurrentPerformance.mockResolvedValue([
      { subject_code: 'MAT101', subject_name: 'Cálculo', summary: { real_average: 5.5 } }
    ])
    const res = await request(app).get('/dashboard/current-progress').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ subject_code: 'MAT101', average: 5.5 })
  })
})
