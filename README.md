# PopStudy - Grades Service (`ps-ms-grades-service`)

Este microservicio se encarga de la **gestión de calificaciones, ponderaciones, cálculo de promedios (reales y proyectados) e historial académico** de los estudiantes dentro de la plataforma PopStudy. Permite organizar las asignaturas de manera jerárquica mediante categorías de evaluación (ej: Certámenes, Tareas, Laboratorios) y calcular el rendimiento académico del estudiante en tiempo real.

Adicionalmente, expone endpoints específicos para que el asistente de Inteligencia Artificial (IA) obtenga el contexto académico detallado del estudiante de forma estructurada.

---

## 🚀 Tecnologías Utilizadas

- **Node.js** (v20+)
- **Express** (Framework web rápido y minimalista)
- **Supabase JS Client** (Integración con base de datos PostgreSQL en la nube y Auth)
- **Nodemon** (Entorno de desarrollo para reinicio automático)
- **Docker & Docker Compose** (Containerización)

---

## 📋 Arquitectura del Proyecto

El microservicio sigue un patrón clásico de **Controlador-Servicio-Repositorio**:

```
ps-ms-grades-service/
├── src/
│   ├── config/             # Configuración de clientes externos (Supabase client)
│   ├── controller/         # Manejo de peticiones HTTP y respuestas de la API
│   ├── middleware/         # Filtros y validaciones globales (Auth, Error Handling)
│   ├── repository/         # Consultas y persistencia directa en base de datos (Supabase)
│   ├── routes/             # Definición y mapeo de rutas de la API
│   └── service/            # Lógica de negocio y algoritmos de cálculo de notas
├── index.js                # Punto de entrada del microservicio
├── Dockerfile              # Configuración de Docker en múltiples etapas (Multi-stage build)
├── .dockerignore           # Archivos ignorados por Docker
├── .env                    # Variables de entorno locales
└── package.json            # Scripts de ejecución y dependencias del proyecto
```

---

## 🔧 Configuración del Entorno

Para ejecutar el microservicio localmente, crea un archivo `.env` en la raíz del proyecto (basándote en el siguiente formato):

```env
# --- CONFIGURACIÓN GENERAL ---
PORT=3003
NODE_ENV=development

# --- SUPABASE (Secrets) ---
# URL de tu instancia de Supabase
SUPABASE_URL=https://<tu-proyecto>.supabase.co
# Clave de Service Role de Supabase (¡MANTENER SECRETA!)
SUPABASE_SERVICE_ROLE=eyJhbGciOiJIUzI...
```


---

## 🛠️ Instalación y Ejecución

### Ejecución Local

1. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```

2. Inicia el servidor en modo desarrollo (usando `nodemon`):
   ```bash
   npm run dev
   ```

3. El servicio estará disponible en: `http://localhost:3003`

### Ejecución con Docker

Puedes compilar y ejecutar el servicio dentro de un contenedor Docker de la siguiente forma:

1. Compilar la imagen Docker:
   ```bash
   docker build -t ps-ms-grades-service .
   ```

2. Ejecutar el contenedor:
   ```bash
   docker run -p 3003:3003 --env-file .env ps-ms-grades-service
   ```

---

## 🧮 Algoritmo de Cálculo Académico

El servicio calcula recursivamente las calificaciones del estudiante utilizando una estructura de árbol. Admite categorías anidadas (ej. *Certámenes* que contiene *Certamen 1*, *Certamen 2*, etc.).

El algoritmo implementado en `gradesService.js` diferencia dos tipos de promedio:

### 1. Promedio Real (`real_average`)
- Solo toma en consideración aquellas evaluaciones cuyo campo `grade` no sea nulo y que **no sean simulaciones** (`is_simulation: false`).
- Permite al estudiante saber cuál es su promedio actual con las notas que ya le han entregado oficialmente.

### 2. Promedio Proyectado (`projected_average`)
- Toma en consideración **todas** las calificaciones registradas que no sean nulas, incluyendo aquellas marcadas como simulación (`is_simulation: true`).
- Permite al estudiante simular notas futuras y visualizar si logrará aprobar la asignatura con los escenarios planificados.

### ⚠️ Reglas de Validación
- Las notas (`grade`) deben estar en el rango de **1.0 a 7.0**.
- Las ponderaciones (`weight`) deben estar entre **0.01 y 1.0** (donde `0.25` representa el 25%).
- **Suma de Categorías**: La suma de las ponderaciones de las categorías del mismo nivel no puede superar el `1.0` (100%).
- **Suma de Evaluaciones**: La suma de las ponderaciones de las evaluaciones dentro de una categoría específica no puede superar el `1.0` (100%).

---

## 🔑 Autenticación y Seguridad

Todos los endpoints (a excepción de `/health`) están protegidos mediante el middleware `requireAuth`.

- El cliente debe enviar un JWT (JSON Web Token) válido emitido por Supabase Auth en la cabecera `Authorization`.
- Formato requerido:
  ```http
  Authorization: Bearer <JWT_TOKEN>
  ```
- El middleware valida el token contra Supabase Auth y guarda el identificador de usuario (`user.id`) en `req.userId` para restringir el acceso únicamente a los datos pertenecientes al estudiante solicitante.

---

## 📌 Documentación de la API

### 🏥 Health Check
* **Endpoint:** `GET /health`
* **Descripción:** Comprueba el estado del microservicio sin requerir autenticación.
* **Respuesta Exitosa (200 OK):**
  ```json
  {
    "status": "ok",
    "service": "grades-service",
    "timestamp": "2026-05-20T18:00:00.000Z"
  }
  ```

---

### 🧠 Contexto de Inteligencia Artificial (Solo Lectura)

#### 1. Obtener Contexto de Materias Actuales
* **Endpoint:** `GET /ai-context/current`
* **Descripción:** Devuelve el rendimiento de las materias que el estudiante está cursando actualmente.
* **Cabecera:** `Authorization: Bearer <TOKEN>`
* **Respuesta Exitosa (200 OK):**
  ```json
  [
    {
      "subject_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "subject_name": "Cálculo I",
      "subject_code": "MAT110",
      "status": "cursando",
      "summary": {
        "real_average": 4.5,
        "projected_average": 5.2,
        "total_real_weight": 0.40,
        "total_projected_weight": 0.60,
        "is_passing_projected": true
      },
      "structure": [ ... ]
    }
  ]
  ```

#### 2. Obtener Contexto Completo del Historial Académico
* **Endpoint:** `GET /ai-context`
* **Descripción:** Obtiene el historial completo de calificaciones de todas las asignaturas del estudiante (aprobadas, cursando, pendientes).
* **Cabecera:** `Authorization: Bearer <TOKEN>`

---

### 📊 Dashboard e Información General

#### 1. Obtener Progreso de Asignaturas Cursando
* **Endpoint:** `GET /dashboard/current-progress`
* **Descripción:** Devuelve un resumen simplificado de las materias en curso para alimentar de forma directa los gráficos de la interfaz gráfica del estudiante.
* **Cabecera:** `Authorization: Bearer <TOKEN>`
* **Respuesta Exitosa (200 OK):**
  ```json
  [
    {
      "subject_code": "MAT110",
      "subject_name": "Cálculo I",
      "average": 4.5
    },
    {
      "subject_code": "INF233",
      "subject_name": "Estructuras de Datos",
      "average": 5.8
    }
  ]
  ```

#### 2. Obtener Rendimiento Detallado por Materia
* **Endpoint:** `GET /performance/:subject_id`
* **Descripción:** Retorna el árbol completo de categorías y evaluaciones de una asignatura en particular, junto con sus respectivos promedios reales y proyectados.
* **Cabecera:** `Authorization: Bearer <TOKEN>`

---

### 📂 Gestión de Categorías de Evaluación

#### 1. Crear Categoría
* **Endpoint:** `POST /subjects/:subject_id/categories`
* **Descripción:** Registra una nueva categoría de notas en una asignatura.
* **Cabecera:** `Authorization: Bearer <TOKEN>`
* **Cuerpo de Petición (JSON):**
  ```json
  {
    "name": "Certámenes",
    "weight": 0.50,
    "parent_category_id": null
  }
  ```

#### 2. Actualizar Categoría
* **Endpoint:** `PATCH /subjects/:subject_id/categories/:id`
* **Descripción:** Permite cambiar el nombre, ponderación o jerarquía de una categoría.
* **Cabecera:** `Authorization: Bearer <TOKEN>`

#### 3. Eliminar Categoría
* **Endpoint:** `DELETE /subjects/:subject_id/categories/:id`
* **Descripción:** Elimina una categoría y todas sus notas asociadas de forma en cascada.
* **Cabecera:** `Authorization: Bearer <TOKEN>`

---

### 📝 Gestión de Evaluaciones (Notas)

#### 1. Crear Evaluación
* **Endpoint:** `POST /subjects/:subject_id/categories/:category_id/evaluations`
* **Descripción:** Agrega una nueva nota dentro de una categoría de evaluación.
* **Cabecera:** `Authorization: Bearer <TOKEN>`
* **Cuerpo de Petición (JSON):**
  ```json
  {
    "name": "Certamen 1",
    "grade": 5.5,
    "weight": 0.40,
    "is_simulation": false
  }
  ```

#### 2. Actualizar Evaluación
* **Endpoint:** `PATCH /subjects/:subject_id/evaluations/:id`
* **Descripción:** Actualiza los datos de una evaluación (nota, nombre, ponderación o estado de simulación).
* **Cabecera:** `Authorization: Bearer <TOKEN>`

#### 3. Eliminar Evaluación
* **Endpoint:** `DELETE /subjects/:subject_id/evaluations/:id`
* **Descripción:** Remueve la evaluación especificada.
* **Cabecera:** `Authorization: Bearer <TOKEN>`

---

