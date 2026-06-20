import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

// SUPABASE_URL: URL de la base de datos
const supabaseUrl = process.env.SUPABASE_URL;
// SUPABASE_SERVICE_ROLE: Clave de servicio para acceder a la base de datos
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase