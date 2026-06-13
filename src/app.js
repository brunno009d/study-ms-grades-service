import express from 'express'
import cors from 'cors'
import gradesRoutes from './routes/gradesRoutes.js'
import errorHandler from './middleware/errorHandler.js'

const app = express();

// Middleware global
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'grades-service',
        timestamp: new Date().toISOString()
    });
});

// Rutas grades
app.use('/', gradesRoutes);

// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({
        error: 'not_found',
        message: `Ruta ${req.method} ${req.path} no encontrada en ps-ms-grades-service`
    });
});

// Manejo de errores global
app.use(errorHandler);

export default app
