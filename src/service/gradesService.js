const gradesRepository = require('../repository/gradesRepository');

class GradesService {

    // Optiene el rendimiento academico del usuario en una asignatura
    async getSubjectPerformance(userId, subjectId) {
        // Validar que el usuario sea dueño de la asignatura
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado: La asignatura no pertenece a este usuario.');
            error.statusCode = 403;
            throw error;
        }

        // Extraer todas las categorias de un ramo
        const categories = await gradesRepository.getCategoriesBySubject(subjectId);
        // Si no hay categorías, devolvemos la estructura vacía
        if (categories.length === 0) {
            return {
                subject_id: subjectId,
                summary: { real_average: 0, projected_average: 0, real_weight: 0, projected_weight: 0, is_passing: false },
                structure: []
            };
        }

        const categoryIds = categories.map(c => c.id);

        // Optiene todas las evaluaciones de un ramo
        const evaluations = await gradesRepository.getEvaluationsByCategoryIds(categoryIds);

        // Construye el arbol de categorias y calcula el rendimiento
        const tree = this._buildAndCalculateTree(categories, evaluations);
        const summary = this._calculateNodeAverage(tree);

        return {
            subject_id: subjectId,
            summary: {
                // Promedio real
                real_average: parseFloat(summary.real_average.toFixed(2)),
                // Promedio proyectado con simulaciones
                projected_average: parseFloat(summary.projected_average.toFixed(2)),
                // Ponderacion real
                total_real_weight: parseFloat(summary.real_weight_total.toFixed(2)),
                // Ponderacion proyectada
                total_projected_weight: parseFloat(summary.projected_weight_total.toFixed(2)),
                // Estado proyectado
                is_passing_projected: summary.projected_average >= 4.0
            },
            structure: tree
        };
    }

    // Gestión de categorías y notas

    // Crear categoria
    async createCategory(userId, subjectId, categoryData) {
        // verificacion de que el usuario sea dueño de la asignatura
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        // Optiene el peso actual de las categorias
        const currentSum = await gradesRepository.getSumWeightsCategories(subjectId, categoryData.parent_category_id);
        // Validacion de pesos no sea mayor al 100%
        if (currentSum + parseFloat(categoryData.weight || 0) > 1.0) {
            const error = new Error('Validación fallida: La suma de las ponderaciones en este nivel superaría el 100%');
            error.statusCode = 400;
            throw error;
        }

        const newCategory = {
            ...categoryData,
            subject_id: subjectId
        };

        return await gradesRepository.createCategory(newCategory);
    }

    // Crear evaluacion
    async createEvaluation(userId, subjectId, evaluationData) {
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        this._validateGradeAndWeight(evaluationData.grade, evaluationData.weight);

        // Validación de pesos no sea mayor al 100%
        const currentSum = await gradesRepository.getSumWeightsEvaluations(evaluationData.category_id);
        if (currentSum + parseFloat(evaluationData.weight || 0) > 1.0) {
            const error = new Error('Validación fallida: La suma de las ponderaciones en esta categoría superaría el 100%');
            error.statusCode = 400;
            throw error;
        }

        return await gradesRepository.createEvaluation(evaluationData);
    }

    // Actualiza una evaluacion
    async updateEvaluation(userId, subjectId, evaluationId, updateData) {
        // verificacion de que el usuario sea dueño de la asignatura
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        // Validacion de notas y pesos
        if (updateData.grade !== undefined || updateData.weight !== undefined) {
            this._validateGradeAndWeight(
                updateData.grade,
                updateData.weight
            );
        }

        // Validación de pesos no sea mayor al 100%
        if (updateData.weight !== undefined) {
            const currentEval = await gradesRepository.getEvaluationById(evaluationId);
            const currentSum = await gradesRepository.getSumWeightsEvaluations(currentEval.category_id, evaluationId);
            if (currentSum + parseFloat(updateData.weight) > 1.0) {
                const error = new Error('Validación fallida: La suma de las ponderaciones en esta categoría superaría el 100%');
                error.statusCode = 400;
                throw error;
            }
        }

        return await gradesRepository.updateEvaluation(evaluationId, updateData);
    }

    // Actualiza una categoria
    async updateCategory(userId, subjectId, categoryId, updateData) {
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        if (updateData.weight !== undefined) {
            const currentCat = await gradesRepository.getCategoryById(categoryId);
            const parentId = updateData.parent_category_id !== undefined ? updateData.parent_category_id : currentCat.parent_category_id;

            const currentSum = await gradesRepository.getSumWeightsCategories(subjectId, parentId, categoryId);
            if (currentSum + parseFloat(updateData.weight) > 1.0) {
                const error = new Error('Validación fallida: La suma de las ponderaciones en este nivel superaría el 100%');
                error.statusCode = 400;
                throw error;
            }
        }

        return await gradesRepository.updateCategory(categoryId, updateData);
    }

    // Eliminar categoria
    async deleteCategory(userId, subjectId, categoryId) {
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        return await gradesRepository.deleteCategory(categoryId);
    }

    // Eliminar evaluacion
    async deleteEvaluation(userId, subjectId, evaluationId) {
        const isOwner = await gradesRepository.checkSubjectOwnership(userId, subjectId);
        if (!isOwner) {
            const error = new Error('No autorizado');
            error.statusCode = 403;
            throw error;
        }

        return await gradesRepository.deleteEvaluation(evaluationId);
    }

    // Funciones privadas para la logica

    // Validar notas y pesos
    _validateGradeAndWeight(grade, weight) {
        if (grade !== undefined) {
            const g = parseFloat(grade);
            if (isNaN(g) || g < 1.0 || g > 7.0) {
                const error = new Error('Validación fallida: La nota debe estar entre 1.0 y 7.0');
                error.statusCode = 400;
                throw error;
            }
        }
        if (weight !== undefined) {
            const w = parseFloat(weight);
            if (isNaN(w) || w <= 0 || w > 1.0) {
                const error = new Error('Validación fallida: La ponderación debe estar entre 0.01 y 1.0 (Ej: 0.25 para 25%)');
                error.statusCode = 400;
                throw error;
            }
        }
    }

    _buildAndCalculateTree(categories, evaluations) {
        const categoryMap = new Map();

        categories.forEach(cat => {
            categoryMap.set(cat.id, {
                ...cat,
                evaluations: [],
                subcategories: [],
                real_average: 0,
                projected_average: 0,
                real_weight_total: 0,
                projected_weight_total: 0
            });
        });

        evaluations.forEach(ev => {
            if (categoryMap.has(ev.category_id)) {
                categoryMap.get(ev.category_id).evaluations.push(ev);
            }
        });

        const rootNodes = [];

        categoryMap.forEach(cat => {
            if (cat.parent_category_id && categoryMap.has(cat.parent_category_id)) {
                categoryMap.get(cat.parent_category_id).subcategories.push(cat);
            } else {
                rootNodes.push(cat);
            }
        });

        rootNodes.forEach(root => this._calculateNodeAverage(root));

        return rootNodes;
    }

    // --- Métodos para el contexto de la IA (solo lectura) ---

    // Obtiene el rendimiento académico de TODAS las materias del estudiante.
    async getAllPerformance(userId) {
        return await this._getPerformanceByFilter(userId);
    }

    // Obtiene el rendimiento académico SOLO de las materias "cursando".
    async getCurrentPerformance(userId) {
        return await this._getPerformanceByFilter(userId, 'cursando');
    }

    // Método interno que obtiene rendimiento filtrado opcionalmente por status.
    async _getPerformanceByFilter(userId, statusFilter = null) {
        const supabase = require('../config/supabase');

        // Obtiene materias del estudiante con nombre y código
        let dbQuery = supabase
            .from('student_subjects')
            .select('subject_id, status, subjects(name, code)')
            .eq('student_id', userId);

        if (statusFilter) {
            dbQuery = dbQuery.eq('status', statusFilter);
        }

        const { data: studentSubjects, error } = await dbQuery;
        if (error) throw error;
        if (!studentSubjects || studentSubjects.length === 0) return [];

        const results = [];
        for (const ss of studentSubjects) {
            try {
                const performance = await this.getSubjectPerformance(userId, ss.subject_id);
                results.push({
                    subject_name: ss.subjects?.name || null,
                    subject_code: ss.subjects?.code || null,
                    status: ss.status,
                    ...performance
                });
            } catch (err) {
                // Si falla una materia, la incluimos con datos básicos
                results.push({
                    subject_id: ss.subject_id,
                    subject_name: ss.subjects?.name || null,
                    subject_code: ss.subjects?.code || null,
                    status: ss.status,
                    summary: null,
                    structure: []
                });
            }
        }

        return results;
    }

    _calculateNodeAverage(node) {
        const isArray = Array.isArray(node);
        const evaluations = isArray ? [] : (node.evaluations || []);
        const subcategories = isArray ? node : (node.subcategories || []);

        let realSum = 0, realWeight = 0;
        let projSum = 0, projWeight = 0;

        evaluations.forEach(ev => {
            const w = parseFloat(ev.weight) || 0;
            const g = parseFloat(ev.grade) || 0;

            if (!ev.is_simulation && ev.grade !== null && ev.grade !== undefined) {
                realSum += (g * w);
                realWeight += w;
            }

            if (ev.grade !== null && ev.grade !== undefined) {
                projSum += (g * w);
                projWeight += w;
            }
        });

        subcategories.forEach(sub => {
            const subCalc = this._calculateNodeAverage(sub);
            const subW = parseFloat(sub.weight) || 0;

            if (subCalc.real_weight_total > 0) {
                realSum += (subCalc.real_average * subW);
                realWeight += subW;
            }
            if (subCalc.projected_weight_total > 0) {
                projSum += (subCalc.projected_average * subW);
                projWeight += subW;
            }
        });

        const realAvg = realWeight > 0 ? (realSum / realWeight) : 0;
        const projAvg = projWeight > 0 ? (projSum / projWeight) : 0;

        if (!isArray) {
            node.real_average = parseFloat(realAvg.toFixed(2));
            node.projected_average = parseFloat(projAvg.toFixed(2));
            node.real_weight_total = parseFloat(realWeight.toFixed(2));
            node.projected_weight_total = parseFloat(projWeight.toFixed(2));
        }

        return {
            real_average: realAvg,
            projected_average: projAvg,
            real_weight_total: realWeight,
            projected_weight_total: projWeight
        };
    }
}

module.exports = new GradesService();