const gradesService = require('../service/gradesService');

class GradesController {
    async getPerformance(req, res) {
        try {
            const { subject_id } = req.params;
            const userId = req.userId;

            const performance = await gradesService.getSubjectPerformance(userId, subject_id);
            res.status(200).json(performance);
        } catch (error) {
            console.error('Error in getPerformance:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async createCategory(req, res) {
        try {
            const { subject_id } = req.params;
            const categoryData = req.body;
            const userId = req.userId;

            // Validar campos requeridos
            if (!categoryData.name || categoryData.weight === undefined) {
                return res.status(400).json({ message: 'Campos requeridos faltantes: name y weight' });
            }

            const newCategory = await gradesService.createCategory(userId, subject_id, categoryData);
            res.status(201).json(newCategory);
        } catch (error) {
            console.error('Error in createCategory:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async createEvaluation(req, res) {
        try {
            const { subject_id, category_id } = req.params;
            const userId = req.userId;

            // Validar campos requeridos
            if (!req.body.name || req.body.grade === undefined || req.body.weight === undefined) {
                return res.status(400).json({ message: 'Campos requeridos faltantes: name, grade y weight' });
            }

            // Combinamos los datos del body con el ID de la categoría de la ruta
            const evaluationData = {
                ...req.body,
                category_id: parseInt(category_id)
            };

            const newEvaluation = await gradesService.createEvaluation(userId, subject_id, evaluationData);
            res.status(201).json(newEvaluation);
        } catch (error) {
            console.error('Error in createEvaluation:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async updateEvaluation(req, res) {
        try {
            const { subject_id, id } = req.params;
            const updateData = req.body;
            const userId = req.userId;

            const updatedEvaluation = await gradesService.updateEvaluation(userId, subject_id, id, updateData);
            res.status(200).json(updatedEvaluation);
        } catch (error) {
            console.error('Error in updateEvaluation:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async updateCategory(req, res) {
        try {
            const { subject_id, id } = req.params;
            const updateData = req.body;
            const userId = req.userId;

            const updatedCategory = await gradesService.updateCategory(userId, subject_id, id, updateData);
            res.status(200).json(updatedCategory);
        } catch (error) {
            console.error('Error in updateCategory:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async deleteCategory(req, res) {
        try {
            const { subject_id, id } = req.params;
            const userId = req.userId;

            await gradesService.deleteCategory(userId, subject_id, id);
            res.status(204).send();
        } catch (error) {
            console.error('Error in deleteCategory:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async deleteEvaluation(req, res) {
        try {
            const { subject_id, id } = req.params;
            const userId = req.userId;

            await gradesService.deleteEvaluation(userId, subject_id, id);
            res.status(204).send();
        } catch (error) {
            console.error('Error in deleteEvaluation:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }

    async getCurrentProgress(req, res) {
        try {
            const userId = req.userId;
            const currentPerformance = await gradesService.getCurrentPerformance(userId);

            // Mapear los datos a un formato simple y limpio para el gráfico del frontend
            const progressData = currentPerformance.map(subject => ({
                subject_code: subject.subject_code,
                subject_name: subject.subject_name,
                average: subject.summary ? subject.summary.real_average : 1.0
            }));

            res.status(200).json(progressData);
        } catch (error) {
            console.error('Error in getCurrentProgress:', error);
            res.status(error.statusCode || 500).json({ message: error.message || 'Internal Server Error' });
        }
    }
}

module.exports = new GradesController();
