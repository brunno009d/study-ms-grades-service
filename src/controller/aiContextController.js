import gradesService from '../service/gradesService.js'

// Endpoints para el contexto de la IA.

// Devuelve el rendimiento académico de TODAS las materias del estudiante
// (aprobadas, cursando, pendientes) con su árbol completo de calificaciones.
const getContext = async (req, res, next) => {
    try {
        const allPerformance = await gradesService.getAllPerformance(req.userId);
        res.status(200).json(allPerformance);
    } catch (error) {
        next(error);
    }
};

// Devuelve el rendimiento académico SOLO de las materias que el estudiante está cursando actualmente.
const getCurrentContext = async (req, res, next) => {
    try {
        const currentPerformance = await gradesService.getCurrentPerformance(req.userId);
        res.status(200).json(currentPerformance);
    } catch (error) {
        next(error);
    }
};

export { getContext, getCurrentContext }
