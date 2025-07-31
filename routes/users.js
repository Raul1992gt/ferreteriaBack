const express = require('express');
const { body, validationResult } = require('express-validator');
const { User, Task, TimeClock } = require('../models');
const { Op, fn, col } = require('sequelize');
const { authenticateToken, requireJefe, requireOwnerOrJefe } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// @route   GET /api/users
// @desc    Obtener lista de usuarios (solo jefe)
// @access  Private (Jefe)
router.get('/', requireJefe, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, active } = req.query;
    
    const offset = (page - 1) * limit;
    const where = {};
    
    if (role) {
      where.role = role;
    }
    
    if (active !== undefined) {
      where.is_active = active === 'true';
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Task,
          as: 'assignedTasks',
          attributes: ['id', 'title', 'status'],
          required: false,
          where: { status: ['pendiente', 'en_progreso'] }
        }
      ]
    });

    res.json({
      users,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Obtener usuario específico
// @access  Private (Propietario o Jefe)
router.get('/:id', requireOwnerOrJefe, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      attributes: { exclude: ['password_hash'] },
      include: [
        {
          model: Task,
          as: 'assignedTasks',
          attributes: ['id', 'title', 'status', 'priority', 'due_date', 'estimated_hours', 'actual_hours']
        },
        {
          model: TimeClock,
          as: 'timeClocks',
          attributes: ['id', 'date', 'clock_in_time', 'clock_out_time', 'total_hours'],
          limit: 7,
          order: [['date', 'DESC']]
        }
      ]
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Error obteniendo usuario:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Actualizar usuario
// @access  Private (Propietario o Jefe)
router.put('/:id', [
  requireOwnerOrJefe,
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Debe proporcionar un email válido'),
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
    .isAlphanumeric()
    .withMessage('El nombre de usuario solo puede contener letras y números')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { name, email, username, is_active, role } = req.body;

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Solo el jefe puede cambiar rol y estado activo
    const updateData = { name, email, username };
    if (req.user.role === 'jefe') {
      if (role !== undefined) updateData.role = role;
      if (is_active !== undefined) {
        // Evitar que el jefe se desactive a sí mismo
        if (parseInt(id) === req.user.id && is_active === false) {
          return res.status(400).json({
            error: 'No puedes desactivar tu propia cuenta'
          });
        }
        updateData.is_active = is_active;
      }
    }

    // Verificar duplicados si se cambia email o username
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({
          error: 'Este email ya está en uso'
        });
      }
    }

    if (username && username !== user.username) {
      const existingUsername = await User.findOne({ where: { username } });
      if (existingUsername) {
        return res.status(409).json({
          error: 'Este nombre de usuario ya está en uso'
        });
      }
    }

    await user.update(updateData);

    res.json({
      message: 'Usuario actualizado exitosamente',
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Error actualizando usuario:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Desactivar usuario (solo jefe)
// @access  Private (Jefe)
router.delete('/:id', requireJefe, async (req, res) => {
  try {
    const { id } = req.params;

    // No puede eliminarse a sí mismo
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        error: 'No puedes eliminar tu propia cuenta'
      });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Desactivar en lugar de eliminar para mantener integridad referencial
    await user.update({ is_active: false });

    res.json({
      message: 'Usuario desactivado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando usuario:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/users/:id/stats
// @desc    Obtener estadísticas del usuario
// @access  Private (Propietario o Jefe)
router.get('/:id/stats', requireOwnerOrJefe, async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Configurar rango de fechas (por defecto último mes)
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Estadísticas de tareas - CORREGIDO para incluir rango de fechas
    const taskStats = await Task.findAll({
      where: { 
        assigned_to: id,
        // Filtrar por tareas completadas en el período
        [Op.or]: [
          { status: ['pendiente', 'en_progreso'] }, // Tareas actuales
          { 
            status: 'completada',
            updated_at: { [Op.between]: [start, end] } // Solo completadas en el período
          }
        ]
      },
      attributes: [
        'status',
        [fn('COUNT', '*'), 'count'],
        [fn('SUM', col('actual_hours')), 'total_hours']
      ],
      group: ['status'],
      raw: true
    });

    // Estadísticas de fichajes - CORREGIDO para días únicos
    const timeClockStats = await TimeClock.findAll({
      where: {
        user_id: id,
        date: {
          [Op.between]: [start, end]
        },
        total_hours: { [Op.gt]: 0 } // Solo días con horas registradas
      },
      attributes: [
        [fn('COUNT', fn('DISTINCT', col('date'))), 'days_worked'], // Días únicos
        [fn('SUM', col('total_hours')), 'total_hours']
        // Promedio se calculará manualmente: total_hours / days_worked
      ],
      raw: true
    });

    // Calcular promedio correcto: total horas / días únicos
    const timeStats = timeClockStats[0] || { days_worked: 0, total_hours: 0 };
    const avgHoursPerDay = timeStats.days_worked > 0 
      ? parseFloat(timeStats.total_hours) / parseInt(timeStats.days_worked)
      : 0;
    
    // Añadir el promedio calculado correctamente
    timeStats.avg_hours_per_day = Math.round(avgHoursPerDay * 100) / 100; // Redondear a 2 decimales

    // Estadísticas adicionales para debug
    const totalTasksAssigned = await Task.count({
      where: { assigned_to: id }
    });

    const totalDaysInPeriod = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    console.log(`📊 Stats for user ${id}:`, {
      period: { start: start.toISOString(), end: end.toISOString() },
      taskStats,
      timeStats: timeStats,
      totalTasksAssigned,
      totalDaysInPeriod,
      avgCalculation: `${timeStats.total_hours}h ÷ ${timeStats.days_worked} días = ${timeStats.avg_hours_per_day}h/día`
    });

    res.json({
      user: user.toSafeObject(),
      period: { 
        start, 
        end,
        days_in_period: totalDaysInPeriod
      },
      task_stats: taskStats,
      time_stats: timeStats,
      total_tasks_assigned: totalTasksAssigned
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/users/workers/summary
// @desc    Resumen de todos los trabajadores (solo jefe)
// @access  Private (Jefe)
router.get('/workers/summary', requireJefe, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const workers = await User.findAll({
      where: { role: 'trabajador', is_active: true },
      attributes: { exclude: ['password_hash'] }
    });

    // Procesar cada trabajador para obtener estadísticas completas
    const summary = await Promise.all(workers.map(async (worker) => {
      // Tareas activas (pendientes + en progreso)
      const activeTasks = await Task.findAll({
        where: { 
          assigned_to: worker.id,
          status: ['pendiente', 'en_progreso']
        },
        attributes: ['id', 'status']
      });

      // Tareas completadas (total, no solo de hoy)
      const completedTasks = await Task.findAll({
        where: { 
          assigned_to: worker.id,
          status: 'completada'
        },
        attributes: ['id']
      });

      // Fichaje activo de hoy
      const activeTimeClock = await TimeClock.findOne({
        where: {
          user_id: worker.id,
          date: today,
          clock_out_time: null
        },
        attributes: ['id', 'clock_in_time']
      });

      // Horas de fichaje de hoy (solo registros completos con clock_out_time)
      const todayTimeClocks = await TimeClock.findAll({
        where: {
          user_id: worker.id,
          date: today,
          clock_out_time: { [Op.not]: null } // Solo registros cerrados
        },
        attributes: ['total_hours']
      });

      // Calcular horas totales de fichaje de hoy
      const totalHoursToday = todayTimeClocks.reduce(
        (total, clock) => total + (clock.total_hours || 0), 0
      );

      return {
        id: worker.id,
        name: worker.name,
        username: worker.username,
        is_clocked_in: !!activeTimeClock,
        active_tasks: activeTasks.length,
        completed_tasks: completedTasks.length,
        total_hours_today: Math.round(totalHoursToday * 10) / 10, // Redondear a 1 decimal
        pending_tasks: activeTasks.filter(t => t.status === 'pendiente').length,
        in_progress_tasks: activeTasks.filter(t => t.status === 'en_progreso').length
      };
    }));

    res.json({
      workers: summary,
      total_workers: summary.length,
      clocked_in: summary.filter(w => w.is_clocked_in).length
    });

  } catch (error) {
    console.error('Error obteniendo resumen de trabajadores:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router; 