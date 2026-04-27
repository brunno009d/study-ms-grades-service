const supabase = require('../config/supabase');

class GradesRepository {
    // obtiene todas las categorias de un ramo
    async getCategoriesBySubject(subjectId) {
        const { data, error } = await supabase
            .from('evaluation_categories')
            .select('*')
            .eq('subject_id', subjectId)
            .order('id', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    // obtiene todas las evaluaciones de una categoria
    async getEvaluationsByCategoryIds(categoryIds) {
        if (!categoryIds || categoryIds.length === 0) return [];
        const { data, error } = await supabase
            .from('evaluation')
            .select('*')
            .in('category_id', categoryIds)
            .order('id', { ascending: true });

        if (error) throw error;
        return data || [];
    }

    // crea una categoria
    async createCategory(categoryData) {
        const { data, error } = await supabase
            .from('evaluation_categories')
            .insert([categoryData])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // crea una evaluacion
    async createEvaluation(evaluationData) {
        const { data, error } = await supabase
            .from('evaluation')
            .insert([evaluationData])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // actualiza una evaluacion
    async updateEvaluation(id, updateData) {
        const { data, error } = await supabase
            .from('evaluation')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // elimina una evaluacion
    async deleteEvaluation(id) {
        const { error } = await supabase
            .from('evaluation')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return true;
    }

    // obtiene una evaluacion por id
    async getEvaluationById(id) {
        const { data, error } = await supabase
            .from('evaluation')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    // obtiene el peso actual de las categorias
    async getSumWeightsCategories(subjectId, parentCategoryId = null, excludeCategoryId = null) {
        let query = supabase
            .from('evaluation_categories')
            .select('weight, id')
            .eq('subject_id', subjectId);

        if (parentCategoryId) {
            query = query.eq('parent_category_id', parentCategoryId);
        } else {
            query = query.is('parent_category_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data.reduce((sum, item) => {
            if (excludeCategoryId && item.id === parseInt(excludeCategoryId)) return sum;
            return sum + (parseFloat(item.weight) || 0);
        }, 0);
    }

    async getCategoryById(id) {
        const { data, error } = await supabase
            .from('evaluation_categories')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    async updateCategory(id, updateData) {
        const { data, error } = await supabase
            .from('evaluation_categories')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteCategory(id) {
        const { error } = await supabase
            .from('evaluation_categories')
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }

    // obtiene el peso actual de las evaluaciones
    async getSumWeightsEvaluations(categoryId, excludeEvaluationId = null) {
        const { data, error } = await supabase
            .from('evaluation')
            .select('weight, id')
            .eq('category_id', categoryId);

        if (error) throw error;

        return data.reduce((sum, item) => {
            // exlucye la evaluacion que se esta actualizando
            if (excludeEvaluationId && item.id === excludeEvaluationId) return sum;
            return sum + (parseFloat(item.weight) || 0);
        }, 0);
    }

    // Verificar si la asignatura pertenece al estudiante (debe estar en student_subjects)
    async checkSubjectOwnership(studentId, subjectId) {
        const { data, error } = await supabase
            .from('student_subjects')
            .select('id')
            .eq('student_id', studentId)
            .eq('subject_id', subjectId)
            .maybeSingle();

        if (error) {
            console.error('Error in checkSubjectOwnership:', error);
            return false;
        }

        return !!data;
    }
}

module.exports = new GradesRepository();