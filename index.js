import 'dotenv/config'
import app from './src/app.js'

const PORT = process.env.PORT || 3003;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Grades Service corriendo en puerto ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
