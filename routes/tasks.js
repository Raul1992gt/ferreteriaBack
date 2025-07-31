const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Task, User, TimeEntry } = require('../models');
const { Op } = require('sequelize');
const { authenticateToken, requireJefe, requireOwnerOrJefe } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// @route   GET /api/tasks
// @desc    Obtener lista de tareas
// @access  Private
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['pendiente', 'en_progreso', 'completada', 'cancelada']),
  query('priority').optional().isIn(['baja', 'media', 'alta', 'urgente']),
  query('search').optional().isLength({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Parámetros inválidos', details: errors.array() });
    }

    const { page = 1, limit = 20, status, priority, search } = req.query;
    const offset = (page - 1) * limit;

    // Construir filtros base
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    // Filtros de búsqueda
    const searchFilters = search ? {
      [Op.or]: [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ]
    } : {};

    // Filtros por rol (CRÍTICO para seguridad)
    if (req.user.role === 'trabajador') {
      // Los trabajadores SOLO pueden ver:
      // 1. Sus tareas asignadas
      // 2. Tareas sin asignar (disponibles)
      // NUNCA tareas del jefe o de otros trabajadores
      const roleFilters = {
        [Op.or]: [
          { assigned_to: req.user.id },  // Mis tareas asignadas
          { assigned_to: null }           // Tareas disponibles (sin asignar)
        ]
      };

      // Combinar búsqueda con filtros de rol usando AND
      if (search) {
        where[Op.and] = [searchFilters, roleFilters];
      } else {
        Object.assign(where, roleFilters);
      }
    } else {
      // El jefe puede ver TODAS las tareas
      if (search) {
        Object.assign(where, searchFilters);
      }
    }

    const { count, rows: tasks } = await Task.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        },
        {
          model: TimeEntry,
          as: 'timeEntries',
          attributes: ['duration_minutes'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    // Calcular progreso y estadísticas para cada tarea
    const tasksWithProgress = tasks.map(task => {
      const taskData = task.toJSON()
      
      // Calcular tiempo total trabajado en minutos
      const totalMinutesWorked = taskData.timeEntries.reduce(
        (total, entry) => total + (entry.duration_minutes || 0), 
        0
      )
      
      // Convertir a horas
      const totalHoursWorked = totalMinutesWorked / 60
      
      // Calcular progreso basado en horas estimadas
      let progress = 0
      if (taskData.estimated_hours && taskData.estimated_hours > 0) {
        progress = Math.min((totalHoursWorked / taskData.estimated_hours) * 100, 100)
      } else if (taskData.status === 'completada') {
        progress = 100
      }
      
      // Agregar campos calculados
      taskData.total_hours_worked = Math.round(totalHoursWorked * 10) / 10 // Redondear a 1 decimal
      taskData.progress = Math.round(progress)
      taskData.is_overdue = taskData.due_date && new Date(taskData.due_date) < new Date()
      
      // Limpiar datos innecesarios
      delete taskData.timeEntries
      
      return taskData
    })

    res.json({
      tasks: tasksWithProgress,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error obteniendo tareas:', error);
    res.status(500).json({ error: 'Error al obtener las tareas' });
  }
});

// @route   POST /api/tasks
// @desc    Crear nueva tarea (solo jefe)
// @access  Private (Jefe)
router.post('/', [
  authenticateToken,
  requireJefe,
  body('title')
    .notEmpty()
    .withMessage('El título es obligatorio')
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres'),
  body('assigned_to')
    .optional({ checkFalsy: true }) // Esto trata "", 0, false, null como opcional
    .isInt({ min: 1 })
    .withMessage('assigned_to debe ser un ID de usuario válido'),
  body('priority')
    .optional()
    .isIn(['baja', 'media', 'alta', 'urgente'])
    .withMessage('Prioridad debe ser: baja, media, alta o urgente'),
  body('estimated_hours')
    .optional()
    .isFloat({ min: 0.1, max: 1000 })
    .withMessage('Las horas estimadas deben ser un número positivo'),
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Fecha de vencimiento debe ser una fecha válida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Errores de validación:', errors.array());
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg,
          value: err.value
        }))
      });
    }

    const {
      title,
      description,
      assigned_to,
      priority = 'media',
      estimated_hours,
      due_date
    } = req.body;

    // Validar que el usuario asignado existe (si se especifica)
    if (assigned_to) {
      const assignedUser = await User.findByPk(assigned_to);
      if (!assignedUser) {
        return res.status(400).json({ error: 'El usuario asignado no existe' });
      }
      // Permitir asignar tareas a trabajadores Y al jefe que está creando la tarea
      if (assignedUser.role !== 'trabajador' && assignedUser.id !== req.user.id) {
        return res.status(400).json({ error: 'Solo se puede asignar tareas a trabajadores o a ti mismo' });
      }
    }

    // Crear la tarea
    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : null,
      assigned_to: assigned_to || null,
      created_by: req.user.id,
      priority,
      estimated_hours: estimated_hours || null,
      due_date: due_date || null,
      status: 'pendiente'
    });

    // Obtener la tarea completa con relaciones
    const fullTask = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        }
      ]
    });

    res.status(201).json({
      message: 'Tarea creada exitosamente',
      task: fullTask
    });
  } catch (error) {
    console.error('Error creando tarea:', error);

    // Manejo específico de errores de base de datos
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Error de validación',
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    res.status(500).json({ error: 'Error interno al crear la tarea' });
  }
});

// @route   GET /api/tasks/:id
// @desc    Obtener tarea específica
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findByPk(id, {
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        },
        {
          model: TimeEntry,
          as: 'timeEntries',
          attributes: ['id', 'user_id', 'start_time', 'end_time', 'duration_minutes', 'description', 'date'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'username']
            }
          ]
        }
      ]
    });

    if (!task) {
      return res.status(404).json({
        error: 'Tarea no encontrada'
      });
    }

    // Verificar permisos
    if (req.user.role === 'trabajador' && task.assigned_to !== req.user.id) {
      return res.status(403).json({
        error: 'No tienes permisos para ver esta tarea'
      });
    }

    const taskData = task.toJSON();
    taskData.progress = task.calculateProgress();
    taskData.is_overdue = task.isOverdue();

    res.json({ task: taskData });

  } catch (error) {
    console.error('Error obteniendo tarea:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Actualizar tarea
// @access  Private
router.put('/:id', [
  body('title')
    .optional()
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres'),
  body('status')
    .optional()
    .isIn(['pendiente', 'en_progreso', 'completada', 'cancelada'])
    .withMessage('Estado inválido'),
  body('priority')
    .optional()
    .isIn(['baja', 'media', 'alta', 'urgente'])
    .withMessage('Prioridad inválida'),
  body('estimated_hours')
    .optional()
    .isFloat({ min: 0.1, max: 1000 })
    .withMessage('Las horas estimadas deben ser un número positivo'),
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Fecha de vencimiento inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    // Verificar permisos
    if (req.user.role === 'trabajador' && task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permisos para editar esta tarea' });
    }

    // Validación: No permitir editar tareas en progreso (excepto para cambiar estado y comentarios)
    if (task.status === 'en_progreso') {
      // Solo permitir cambiar el estado y agregar comentarios de finalización
      const allowedFieldsForInProgress = ['status', 'completion_comments'];
      const attemptedFields = Object.keys(req.body);
      const invalidFields = attemptedFields.filter(field => !allowedFieldsForInProgress.includes(field));
      
      if (invalidFields.length > 0) {
        return res.status(400).json({ 
          error: 'No se puede editar una tarea en progreso. Solo se puede cambiar el estado y agregar comentarios de finalización.',
          invalid_fields: invalidFields
        });
      }
    }

    // Si se está intentando completar la tarea, verificar que no haya timer activo
    if (req.body.status === 'completada') {
      const activeEntry = await TimeEntry.findOne({
        where: {
          task_id: task.id,
          end_time: null // Timer activo
        }
      });

      if (activeEntry) {
        return res.status(400).json({ 
          error: 'No se puede completar la tarea mientras el timer esté activo. Detén el timer primero.' 
        });
      }
    }

    // Actualizar campos permitidos
    const allowedUpdates = ['title', 'description', 'status', 'priority', 'estimated_hours', 'due_date', 'completion_comments'];
    const updates = {};
    
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Si se completa la tarea, añadir timestamp
    if (req.body.status === 'completada') {
      updates.completed_at = new Date();
    }

    await task.update(updates);

    // Obtener tarea actualizada con relaciones
    const updatedTask = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        }
      ]
    });

    res.json({
      message: 'Tarea actualizada exitosamente',
      task: updatedTask
    });
  } catch (error) {
    console.error('Error actualizando tarea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Eliminar tarea (solo jefe)
// @access  Private (Jefe)
router.delete('/:id', requireJefe, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findByPk(id);
    if (!task) {
      return res.status(404).json({
        error: 'Tarea no encontrada'
      });
    }

    await task.destroy();

    res.json({
      message: 'Tarea eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando tarea:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/tasks/:id/complete
// @desc    Marcar tarea como completada
// @access  Private
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findByPk(id);
    if (!task) {
      return res.status(404).json({
        error: 'Tarea no encontrada'
      });
    }

    // Verificar permisos
    if (req.user.role === 'trabajador' && task.assigned_to !== req.user.id) {
      return res.status(403).json({
        error: 'Solo puedes completar tus propias tareas'
      });
    }

    await task.markAsCompleted();

    res.json({
      message: 'Tarea marcada como completada',
      task
    });

  } catch (error) {
    console.error('Error completando tarea:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   PUT /api/tasks/:id/assign-to-me
// @desc    Auto-asignarse una tarea (trabajadores)
// @access  Private (Trabajador)
router.put('/:id/assign-to-me', authenticateToken, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Buscar la tarea
    const task = await Task.findByPk(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    // Verificar que la tarea no esté ya asignada
    if (task.assigned_to !== null) {
      return res.status(400).json({ error: 'Esta tarea ya está asignada a otro usuario' });
    }

    // Verificar que no esté completada o cancelada
    if (task.status === 'completada' || task.status === 'cancelada') {
      return res.status(400).json({ error: 'No se puede asignar una tarea completada o cancelada' });
    }

    // Auto-asignar la tarea al usuario actual
    await task.update({
      assigned_to: req.user.id,
      status: 'en_progreso' // Cambiar automáticamente a en progreso
    });

    // Obtener la tarea actualizada con relaciones
    const updatedTask = await Task.findByPk(taskId, {
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        }
      ]
    });

    res.json({
      message: 'Tarea asignada exitosamente',
      task: updatedTask
    });
  } catch (error) {
    console.error('Error auto-asignando tarea:', error);
    res.status(500).json({ error: 'Error interno al asignar la tarea' });
  }
});

// @route   POST /api/tasks/activity
// @desc    Crear tarea de actividad libre (trabajadores y jefe)
// @access  Private
router.post('/activity', [
  authenticateToken,
  body('title')
    .notEmpty()
    .withMessage('El título es obligatorio')
    .isLength({ min: 3, max: 200 })
    .withMessage('El título debe tener entre 3 y 200 caracteres'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La descripción no puede exceder 1000 caracteres')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: errors.array().map(err => ({
          field: err.path,
          message: err.msg,
          value: err.value
        }))
      });
    }

    const { title, description } = req.body;

    // Crear la tarea auto-asignada y en progreso
    const task = await Task.create({
      title: title.trim(),
      description: description ? description.trim() : 'Actividad de trabajo libre',
      assigned_to: req.user.id, // Auto-asignar al usuario actual
      created_by: req.user.id,
      priority: 'media',
      estimated_hours: null,
      due_date: null,
      status: 'en_progreso' // Iniciar directamente en progreso
    });

    // Cargar la tarea con las relaciones
    const taskWithUser = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Tarea de actividad creada exitosamente',
      task: taskWithUser
    });

  } catch (error) {
    console.error('Error creando tarea de actividad:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router; 