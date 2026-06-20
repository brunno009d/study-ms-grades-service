import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../app.js'

describe('Smoke — Grades Service arranca', () => {
  it('GET /health responde 200', async () => {
    // Arrange — ninguno

    // Act
    const res = await request(app).get('/health')

    // Assert
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('grades-service')
  })
})
