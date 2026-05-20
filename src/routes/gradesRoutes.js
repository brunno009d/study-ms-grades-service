const express = require('express');
const router = express.Router();
const gradesController = require('../controller/gradesController');
const aiContextController = require('../controller/aiContextController');
const requireAuth = require('../middleware/requireAuth');

// Aplica el middleware de autenticación a todas las rutas de este router
router.use(requireAuth);

// IA: Rendimiento de todas las materias o solo las actuales (solo lectura)
router.get('/ai-context/current', aiContextController.getCurrentContext);
router.get('/ai-context', aiContextController.getContext);

// Progreso académico para el Dashboard
router.get('/dashboard/current-progress', gradesController.getCurrentProgress);

// Ruta base para rendimiento
router.get('/performance/:subject_id', gradesController.getPerformance);

// Rutas de Categorías agrupadas por asignatura
router.post('/subjects/:subject_id/categories', gradesController.createCategory);
router.patch('/subjects/:subject_id/categories/:id', gradesController.updateCategory);
router.delete('/subjects/:subject_id/categories/:id', gradesController.deleteCategory);

// Rutas de Evaluaciones agrupadas por asignatura
router.post('/subjects/:subject_id/categories/:category_id/evaluations', gradesController.createEvaluation);
router.patch('/subjects/:subject_id/evaluations/:id', gradesController.updateEvaluation);
router.delete('/subjects/:subject_id/evaluations/:id', gradesController.deleteEvaluation);

module.exports = router;
