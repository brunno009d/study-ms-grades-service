require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3002;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Curriculum Service corriendo en puerto ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});
