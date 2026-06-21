import { describe, it, expect, vi, beforeEach } from 'vitest'
import errorHandler from '../../middleware/errorHandler.js'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const makeRes = () => {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

const makeReq = (method = 'GET', path = '/test') => ({ method, path })

describe('errorHandler middleware', () => {
  it('responde 400 con validation_error cuando err.name es ValidationError', () => {
    // Arrange
    const err = new Error('campo requerido')
    err.name = 'ValidationError'
    const req = makeReq()
    const res = makeRes()
    // Act
    errorHandler(err, req, res, vi.fn())
    // Assert
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'validation_error' }))
  })

  it('responde 500 con internal_error para errores genéricos', () => {
    // Arrange
    const err = new Error('DB fail')
    const req = makeReq()
    const res = makeRes()
    // Act
    errorHandler(err, req, res, vi.fn())
    // Assert
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'internal_error' }))
  })

  it('usa err.status cuando está definido', () => {
    // Arrange
    const err = new Error('Not found')
    err.status = 404
    const req = makeReq()
    const res = makeRes()
    // Act
    errorHandler(err, req, res, vi.fn())
    // Assert
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('usa "Error interno del servidor" cuando el error no tiene mensaje', () => {
    // Arrange — err.message = '' (falsy) → fallback al texto por defecto
    const err = new Error()
    const req = makeReq()
    const res = makeRes()
    // Act
    errorHandler(err, req, res, vi.fn())
    // Assert
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Error interno del servidor' })
    )
  })
})
