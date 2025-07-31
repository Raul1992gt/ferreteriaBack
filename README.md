# 🚀 AppFerre Backend

Backend de la aplicación de gestión de tareas y fichaje para PYME desarrollado con Node.js, Express y PostgreSQL.

## 📋 Características

- ✅ **API REST** completa con autenticación JWT
- ✅ **Base de datos PostgreSQL** con Sequelize ORM
- ✅ **Sistema de roles** (jefe/trabajador) 
- ✅ **Fichaje de entrada/salida**
- ✅ **Gestión de tareas** con asignación
- ✅ **Registro de tiempo** por tareas
- ✅ **Reportes** y estadísticas
- ✅ **Validaciones** y manejo de errores
- ✅ **Rate limiting** y seguridad

## 🛠️ Tecnologías

- **Node.js** + **Express.js**
- **PostgreSQL** + **Sequelize ORM**
- **JWT** para autenticación
- **bcryptjs** para hash de contraseñas
- **express-validator** para validaciones
- **helmet** + **cors** para seguridad

## 📦 Instalación

### 1. Instalar dependencias
```bash
cd backend
npm install
```

### 2. Configurar variables de entorno
Crear archivo `.env` basado en `.env.example`:

```env
# Configuración del servidor
PORT=5000
NODE_ENV=development

# JWT
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
JWT_EXPIRES_IN=7d

# Base de datos PostgreSQL
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/appferre_dev

# CORS
FRONTEND_URL=http://localhost:5173

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Configurar PostgreSQL

#### Opción A: PostgreSQL local
1. Instalar PostgreSQL en tu sistema
2. Crear base de datos:
```sql
CREATE DATABASE appferre_dev;
CREATE USER appferre_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE appferre_dev TO appferre_user;
```

#### Opción B: Supabase (recomendado para desarrollo)
1. Ir a [supabase.com](https://supabase.com)
2. Crear nuevo proyecto
3. Obtener la URL de conexión desde Settings > Database
4. Usar la URL en el `.env`

### 4. Ejecutar migraciones y seeders
```bash
# Sincronizar modelos (desarrollo)
npm run dev

# O usar migraciones (producción)
npm run migrate
npm run seed
```

## 🚀 Uso

### Desarrollo
```bash
npm run dev
```
El servidor se ejecutará en `http://localhost:5000`

### Producción
```bash
npm start
```

### Verificar funcionamiento
```bash
curl http://localhost:5000/api/health
```

## 📚 API Endpoints

### Autenticación (`/api/auth`)
- `POST /register` - Registrar usuario
- `POST /login` - Iniciar sesión  
- `GET /me` - Perfil actual
- `POST /refresh` - Renovar token
- `POST /logout` - Cerrar sesión
- `PUT /change-password` - Cambiar contraseña

### Usuarios (`/api/users`)
- `GET /` - Lista usuarios (jefe)
- `GET /:id` - Usuario específico
- `PUT /:id` - Actualizar usuario
- `DELETE /:id` - Desactivar usuario (jefe)
- `GET /:id/stats` - Estadísticas usuario
- `GET /workers/summary` - Resumen trabajadores (jefe)

### Tareas (`/api/tasks`)
- `GET /` - Lista tareas
- `POST /` - Crear tarea (jefe)
- `GET /:id` - Tarea específica
- `PUT /:id` - Actualizar tarea
- `DELETE /:id` - Eliminar tarea (jefe)
- `POST /:id/complete` - Completar tarea

### Tiempo (`/api/timetrack`)
- `GET /clock/status` - Estado fichaje
- `POST /clock/in` - Fichar entrada
- `POST /clock/out` - Fichar salida
- `GET /clock/history/:userId?` - Historial fichajes
- `GET /entries/active` - Registro tiempo activo
- `POST /entries/start` - Iniciar registro tiempo
- `POST /entries/:id/stop` - Detener registro tiempo
- `GET /entries/today` - Registros de hoy
- `GET /entries/history/:userId?` - Historial registros
- `GET /reports/weekly/:userId?` - Reporte semanal

## 🔐 Autenticación

Incluir en headers de peticiones:
```
Authorization: Bearer <jwt_token>
```

## 👥 Usuarios de Prueba

Después del seeding inicial:

| Rol | Usuario | Email | Contraseña |
|-----|---------|-------|------------|
| Jefe | `jefe` | jefe@appferre.com | `123456` |
| Trabajador | `juan` | juan@appferre.com | `123456` |
| Trabajador | `maria` | maria@appferre.com | `123456` |

## 📊 Base de Datos

### Esquema Principal
- **users** - Usuarios del sistema
- **tasks** - Tareas asignables
- **time_clocks** - Fichajes entrada/salida
- **time_entries** - Registros de tiempo en tareas

### Relaciones
- User → Tasks (1:N como asignado)
- User → Tasks (1:N como creador)
- User → TimeClocks (1:N)
- User → TimeEntries (1:N)
- Task → TimeEntries (1:N)

## 🔧 Scripts Disponibles

- `npm run dev` - Servidor desarrollo con nodemon
- `npm start` - Servidor producción
- `npm run migrate` - Ejecutar migraciones
- `npm run seed` - Ejecutar seeders

## 🌐 Despliegue

### Railway (Recomendado)
1. Conectar repositorio a Railway
2. Configurar variables de entorno
3. Deploy automático

### Render/Heroku
1. Crear app en la plataforma
2. Configurar PostgreSQL addon
3. Configurar variables de entorno
4. Deploy desde Git

## 🐛 Troubleshooting

### Error de conexión BD
```bash
# Verificar conexión PostgreSQL
psql -h localhost -U appferre_user -d appferre_dev
```

### Error JWT
```bash
# Verificar JWT_SECRET en .env
echo $JWT_SECRET
```

### Error de permisos
```bash
# Verificar roles en BD
SELECT username, role FROM users;
```

## 📄 Licencia

MIT

---

¿Necesitas ayuda? Consulta la documentación o crea un issue en GitHub. 