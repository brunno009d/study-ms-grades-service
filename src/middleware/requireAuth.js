const supabase = require('../config/supabase');

const requireAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // Verificar que el header exista
    if (!authHeader) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Falta el header de autorización'
        });
    }

    // Extraer el token (formato "Bearer <token>")
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Formato de token inválido. Use: Bearer <token>'
        });
    }

    const token = parts[1];

    try {
        // Verificar el token directamente con Supabase (soporta ES256 y HS256)
        const { data, error } = await supabase.auth.getUser(token);

        if (error) {
            return res.status(401).json({
                error: 'invalid_token',
                message: error.message
            });
        }

        // Guardar el userId para los controladores
        req.userId = data.user.id;

        next();
    } catch (error) {
        return res.status(401).json({
            error: 'invalid_token',
            message: 'Token inválido'
        });
    }
};

module.exports = requireAuth;