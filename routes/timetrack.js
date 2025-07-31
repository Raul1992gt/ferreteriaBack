const express = require('express');
const { body, validationResult } = require('express-validator');
const { TimeClock, TimeEntry, User, Task } = require('../models');
const { authenticateToken, requireOwnerOrJefe } = require('../middleware/auth');
const { Op } = require('sequelize'); // Added Op for date range filtering

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// ========================================
// RUTAS DE FICHAJE (TimeClock)
// ========================================

// @route   GET /api/timetrack/clock/status
// @desc    Obtener estado actual de fichaje del usuario
// @access  Private
router.get('/clock/status', async (req, res) => {
  try {
    const activeClock = await TimeClock.getTodaysActiveClock(req.user.id);
    const allTodaysClocks = await TimeClock.getAllTodaysClocks(req.user.id);
    const totalHoursToday = await TimeClock.getTotalHoursToday(req.user.id);

    res.json({
      is_clocked_in: !!activeClock,
      clock_data: activeClock || null,
      total_hours_today: totalHoursToday,
      total_periods_today: allTodaysClocks.length,
      all_periods: allTodaysClocks.map(clock => ({
        id: clock.id,
        clock_in_time: clock.clock_in_time,
        clock_out_time: clock.clock_out_time,
        total_hours: clock.total_hours,
        is_active: clock.isActive()
      })),
      current_time: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error obteniendo estado de fichaje:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/timetrack/clock/in
// @desc    Fichar entrada (permite múltiples fichajes por día)
// @access  Private
router.post('/clock/in', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Verificar si ya tiene una entrada ACTIVA (sin salida)
    const activeClock = await TimeClock.getTodaysActiveClock(req.user.id);

    if (activeClock) {
      return res.status(400).json({
        error: 'Ya tienes un fichaje activo. Debes fichar salida antes de fichar entrada nuevamente.',
        clock: activeClock
      });
    }

    // Crear nueva entrada (permitir múltiples por día)
    const newClock = await TimeClock.create({
      user_id: req.user.id,
      clock_in_time: new Date(),
      date: today
    });

    // Obtener estadísticas actualizadas
    const totalHoursToday = await TimeClock.getTotalHoursToday(req.user.id);
    const allPeriods = await TimeClock.getAllTodaysClocks(req.user.id);

    res.status(201).json({
      message: 'Entrada fichada correctamente',
      clock: newClock,
      total_hours_today: totalHoursToday,
      total_periods_today: allPeriods.length,
      is_multiple_entry: allPeriods.length > 1
    });

  } catch (error) {
    console.error('Error fichando entrada:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/timetrack/clock/out
// @desc    Fichar salida (cierra el fichaje activo más reciente)
// @access  Private
router.post('/clock/out', [
  body('break_minutes')
    .optional()
    .isInt({ min: 0, max: 480 })
    .withMessage('Los minutos de descanso deben estar entre 0 y 480')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { break_minutes = 0 } = req.body;

    // Buscar el fichaje activo más reciente
    const activeClock = await TimeClock.getTodaysActiveClock(req.user.id);

    if (!activeClock) {
      return res.status(400).json({
        error: 'No tienes ningún fichaje activo para cerrar. Debes fichar entrada primero.'
      });
    }

    // Cerrar el fichaje activo
    await activeClock.clockOut(new Date(), break_minutes);

    // Obtener estadísticas actualizadas del día
    const totalHoursToday = await TimeClock.getTotalHoursToday(req.user.id);
    const allPeriods = await TimeClock.getAllTodaysClocks(req.user.id);

    res.json({
      message: 'Salida fichada correctamente',
      clock: activeClock,
      period_hours: activeClock.total_hours,
      period_duration: activeClock.formatDuration(),
      total_hours_today: totalHoursToday,
      total_periods_today: allPeriods.length,
      is_final_exit: allPeriods.every(clock => !clock.isActive()) // true si no hay fichajes activos
    });

  } catch (error) {
    console.error('Error fichando salida:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/timetrack/clock/history/:userId?
// @desc    Obtener historial de fichajes
// @access  Private
router.get('/clock/history/:userId?', requireOwnerOrJefe, async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    
    const offset = (page - 1) * limit;
    const where = { user_id: userId };

    if (startDate && endDate) {
      where.date = {
        [TimeClock.sequelize.Op.between]: [startDate, endDate]
      };
    }

    const { count, rows: clocks } = await TimeClock.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['date', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'username']
        }
      ]
    });

    res.json({
      clocks,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de fichajes:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// ========================================
// RUTAS DE REGISTRO DE TIEMPO (TimeEntry)
// ========================================

// @route   GET /api/timetrack/entries/active
// @desc    Obtener entrada de tiempo activa del usuario
// @access  Private
router.get('/entries/active', async (req, res) => {
  try {
    const activeEntry = await TimeEntry.getActiveEntry(req.user.id);

    res.json({
      has_active_entry: !!activeEntry,
      active_entry: activeEntry
    });

  } catch (error) {
    console.error('Error obteniendo entrada activa:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/timetrack/entries/start
// @desc    Iniciar registro de tiempo
// @access  Private
router.post('/entries/start', [
  body('task_id')
    .optional()
    .isInt()
    .withMessage('El ID de tarea debe ser un número'),
  body('description')
    .isLength({ min: 3, max: 500 })
    .withMessage('La descripción debe tener entre 3 y 500 caracteres'),
  body('category')
    .optional()
    .isIn(['desarrollo', 'reunion', 'documentacion', 'testing', 'soporte', 'administracion', 'formacion', 'otro'])
    .withMessage('La categoría debe ser válida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { task_id, description, category } = req.body;

    // Verificar que no haya otra entrada activa
    const activeEntry = await TimeEntry.getActiveEntry(req.user.id);
    if (activeEntry) {
      return res.status(400).json({
        error: 'Ya tienes un registro de tiempo activo',
        active_entry: activeEntry
      });
    }

    // Verificar que la tarea existe y está asignada al usuario (si se especifica)
    if (task_id) {
      const task = await Task.findByPk(task_id);
      if (!task) {
        return res.status(404).json({
          error: 'Tarea no encontrada'
        });
      }

      if (req.user.role === 'trabajador' && task.assigned_to !== req.user.id) {
        return res.status(403).json({
          error: 'No puedes registrar tiempo en una tarea que no está asignada a ti'
        });
      }
    }

    const newEntry = await TimeEntry.create({
      user_id: req.user.id,
      task_id,
      start_time: new Date(),
      description,
      is_free_time: !task_id,
      category,
      date: new Date().toISOString().split('T')[0]
    });

    // Incluir información de la tarea si existe
    const entryWithTask = await TimeEntry.findByPk(newEntry.id, {
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    res.status(201).json({
      message: 'Registro de tiempo iniciado',
      entry: entryWithTask
    });

  } catch (error) {
    console.error('Error iniciando registro de tiempo:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/timetrack/entries/:id/stop
// @desc    Detener registro de tiempo
// @access  Private
router.post('/entries/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;

    const entry = await TimeEntry.findByPk(id, {
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    if (!entry) {
      return res.status(404).json({
        error: 'Registro de tiempo no encontrado'
      });
    }

    if (entry.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'No puedes detener el registro de tiempo de otro usuario'
      });
    }

    if (!entry.isActive()) {
      return res.status(400).json({
        error: 'Este registro de tiempo ya está detenido'
      });
    }

    await entry.stop();

    res.json({
      message: 'Registro de tiempo detenido',
      entry,
      duration: entry.formatDuration()
    });

  } catch (error) {
    console.error('Error deteniendo registro de tiempo:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/timetrack/entries/today
// @desc    Obtener entradas de tiempo de hoy
// @access  Private
router.get('/entries/today', async (req, res) => {
  try {
    const todaysEntries = await TimeEntry.getTodaysEntries(req.user.id);

    const totalMinutes = todaysEntries.reduce(
      (total, entry) => total + (entry.duration_minutes || 0), 0
    );

    res.json({
      entries: todaysEntries,
      total_time_minutes: totalMinutes,
      total_time_formatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`
    });

  } catch (error) {
    console.error('Error obteniendo entradas de hoy:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/timetrack/entries/history/:userId?
// @desc    Obtener historial de registros de tiempo
// @access  Private
router.get('/entries/history/:userId?', requireOwnerOrJefe, async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const { page = 1, limit = 10, startDate, endDate, task_id } = req.query;
    
    const offset = (page - 1) * limit;
    const where = { user_id: userId };

    if (startDate && endDate) {
      where.date = {
        [TimeEntry.sequelize.Op.between]: [startDate, endDate]
      };
    }

    if (task_id) {
      where.task_id = task_id;
    }

    const { count, rows: entries } = await TimeEntry.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['date', 'DESC'], ['start_time', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'username']
        },
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status']
        }
      ]
    });

    res.json({
      entries,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de entradas:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/timetrack/reports/weekly/:userId?
// @desc    Obtener reporte semanal de tiempo
// @access  Private
router.get('/reports/weekly/:userId?', async (req, res) => {
  try {
    const targetUserId = req.params.userId || req.user.id;
    
    // Verificar permisos
    if (req.user.role === 'trabajador' && targetUserId != req.user.id) {
      return res.status(403).json({
        error: 'No tienes permisos para ver reportes de otros usuarios'
      });
    }

    // Calcular fechas de la semana actual
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sábado
    endOfWeek.setHours(23, 59, 59, 999);

    // Filtros base
    const where = {
      user_id: targetUserId,
      date: {
        [Op.between]: [startOfWeek, endOfWeek]
      }
    };

    // Obtener entradas de tiempo de la semana
    const timeEntries = await TimeEntry.findAll({
      where,
      include: [
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'estimated_hours'],
          required: false
        }
      ],
      order: [['date', 'DESC'], ['start_time', 'DESC']]
    });

    // Calcular estadísticas
    const totalMinutes = timeEntries.reduce((sum, entry) => sum + (entry.duration_minutes || 0), 0);
    const totalHours = totalMinutes / 60;
    
    // Agrupar por día
    const dailyStats = {};
    timeEntries.forEach(entry => {
      // entry.date es DATEONLY, convertir a string correctamente
      const day = entry.date instanceof Date ? entry.date.toISOString().split('T')[0] : entry.date;
      if (!dailyStats[day]) {
        dailyStats[day] = {
          date: day,
          total_minutes: 0,
          total_hours: 0,
          entries_count: 0,
          tasks: []
        };
      }
      
      dailyStats[day].total_minutes += entry.duration_minutes || 0;
      dailyStats[day].total_hours = dailyStats[day].total_minutes / 60;
      dailyStats[day].entries_count++;
      
      if (entry.task) {
        dailyStats[day].tasks.push({
          id: entry.task.id,
          title: entry.task.title,
          duration_minutes: entry.duration_minutes
        });
      }
    });

    res.json({
      week_range: {
        start: startOfWeek.toISOString().split('T')[0],
        end: endOfWeek.toISOString().split('T')[0]
      },
      summary: {
        total_entries: timeEntries.length,
        total_minutes: totalMinutes,
        total_hours: Math.round(totalHours * 10) / 10,
        total_hours_formatted: `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m`,
        avg_hours_per_day: Math.round((totalHours / 7) * 10) / 10
      },
      daily_breakdown: Object.values(dailyStats),
      entries: timeEntries.map(entry => ({
        id: entry.id,
        date: entry.date instanceof Date ? entry.date.toISOString().split('T')[0] : entry.date,
        start_time: entry.start_time,
        end_time: entry.end_time,
        duration_minutes: entry.duration_minutes,
        description: entry.description,
        task: entry.task ? {
          id: entry.task.id,
          title: entry.task.title
        } : null
      }))
    });
  } catch (error) {
    console.error('Error generando reporte semanal:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/timetrack/reports/team-stats
// @desc    Obtener estadísticas completas del equipo
// @access  Private (Solo jefe)
router.get('/reports/team-stats', authenticateToken, async (req, res) => {
  try {
    // Solo el jefe puede ver estadísticas del equipo completo
    if (req.user.role !== 'jefe') {
      return res.status(403).json({
        error: 'Solo el jefe puede acceder a las estadísticas del equipo'
      });
    }

    const { period = 'week' } = req.query;
    let startDate, endDate;

    // Calcular rango de fechas según el período
    const now = new Date();
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay()); // Domingo
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Sábado
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      endDate.setHours(23, 59, 59, 999);
    }

    // Obtener usuarios trabajadores
    const workers = await User.findAll({
      where: { role: 'trabajador', is_active: true },
      attributes: ['id', 'name', 'username', 'email', 'created_at']
    });

    // Estadísticas de tareas por período
    const taskStats = await Task.findAll({
      where: {
        created_at: {
          [Op.between]: [startDate, endDate]
        }
      },
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'username']
        },
        {
          model: TimeEntry,
          as: 'timeEntries',
          attributes: ['duration_minutes'],
          required: false
        }
      ]
    });

    // Estadísticas de tiempo por trabajador
    const timeStats = await TimeEntry.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate]
        }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'username']
        },
        {
          model: Task,
          as: 'task',
          attributes: ['id', 'title', 'status'],
          required: false
        }
      ]
    });

    // Procesar estadísticas por trabajador
    const workerStats = await Promise.all(workers.map(async (worker) => {
      const workerTasks = taskStats.filter(task => 
        task.assigned_to === worker.id
      );
      
      const workerTimeEntries = timeStats.filter(entry => 
        entry.user_id === worker.id
      );

      // Calcular horas totales del período usando TimeClock (fichaje)
      const workerTimeClocks = await TimeClock.findAll({
        where: {
          user_id: worker.id,
          date: {
            [Op.between]: [startDate, endDate]
          },
          clock_out_time: { [Op.not]: null } // Solo registros cerrados
        },
        attributes: ['total_hours']
      });

      const totalHours = workerTimeClocks.reduce(
        (total, clock) => total + (parseFloat(clock.total_hours) || 0), 0
      );

      const completedTasks = workerTasks.filter(task => 
        task.status === 'completada'
      ).length;

      const activeTasks = workerTasks.filter(task => 
        task.status === 'en_progreso'
      ).length;

      const pendingTasks = workerTasks.filter(task => 
        task.status === 'pendiente'
      ).length;

      // Calcular eficiencia de manera más inclusiva
      let efficiency = 0;
      
      // Método 1: Eficiencia basada en tiempo estimado vs tiempo real (si hay datos)
      const tasksWithEstimates = workerTasks.filter(task => task.estimated_hours > 0);
      const tasksWithTimeEntries = workerTasks.filter(task => task.timeEntries.length > 0);
      
      if (tasksWithEstimates.length > 0 && tasksWithTimeEntries.length > 0) {
        const totalEstimated = tasksWithEstimates.reduce(
          (sum, task) => sum + (parseFloat(task.estimated_hours) || 0), 0
        );
        const totalWorkedOnTasks = workerTasks.reduce((sum, task) => 
          sum + task.timeEntries.reduce((taskSum, entry) => 
            taskSum + (parseFloat(entry.duration_minutes) || 0) / 60, 0
          ), 0
        );
        
        console.log(`🎯 ${worker.name} MÉTODO 1: estimated=${totalEstimated}h, workedOnTasks=${totalWorkedOnTasks}h, tasksWithEstimates=${tasksWithEstimates.length}, tasksWithTimeEntries=${tasksWithTimeEntries.length}`);
        
        if (totalWorkedOnTasks > 0) {
          efficiency = Math.round((totalEstimated / totalWorkedOnTasks) * 100);
          console.log(`✅ ${worker.name} MÉTODO 1 RESULT: efficiency=${efficiency}%`);
        } else {
          console.log(`❌ ${worker.name} MÉTODO 1 FAILED: totalWorkedOnTasks=0`);
        }
      } 
      // Método 2: Eficiencia basada en productividad (tareas completadas / tiempo total)
      else if (totalHours > 0) {
        // Calcular productividad: tareas completadas por hora trabajada
        const productivity = parseFloat(completedTasks) / parseFloat(totalHours);
        
        // Convertir a porcentaje basado en un estándar de 0.5 tareas/hora como 100%
        const standardProductivity = 0.5; // 0.5 tareas por hora = 100% eficiencia
        efficiency = Math.round(Math.min((productivity / standardProductivity) * 100, 200));
        
        // Debug para verificar cálculos
        console.log(`🔍 ${worker.name}: completed=${completedTasks}, hours=${totalHours}, productivity=${productivity}, efficiency=${efficiency}`);
      }
      // Método 3: Si hay tareas completadas pero sin tiempo registrado
      else if (completedTasks > 0) {
        // Dar un 80% por completar tareas sin registro de tiempo
        efficiency = 80;
      }

      return {
        worker: {
          id: worker.id,
          name: worker.name,
          username: worker.username
        },
        stats: {
          total_hours: Math.round(totalHours * 10) / 10,
          completed_tasks: completedTasks,
          active_tasks: activeTasks,
          pending_tasks: pendingTasks,
          total_tasks: workerTasks.length,
          efficiency: efficiency,
          avg_hours_per_day: Math.round((totalHours / 7) * 10) / 10
        }
      };
    }));

    // Estadísticas generales
    const totalTasks = taskStats.length;
    const completedTasks = taskStats.filter(t => t.status === 'completada').length;
    const totalHours = timeStats.reduce(
      (total, entry) => total + (entry.duration_minutes || 0) / 60, 0
    );

    // Distribución por prioridad
    const priorityDistribution = {
      urgente: taskStats.filter(t => t.priority === 'urgente').length,
      alta: taskStats.filter(t => t.priority === 'alta').length,
      media: taskStats.filter(t => t.priority === 'media').length,
      baja: taskStats.filter(t => t.priority === 'baja').length
    };

    // Distribución por estado
    const statusDistribution = {
      pendiente: taskStats.filter(t => t.status === 'pendiente').length,
      en_progreso: taskStats.filter(t => t.status === 'en_progreso').length,
      completada: taskStats.filter(t => t.status === 'completada').length,
      cancelada: taskStats.filter(t => t.status === 'cancelada').length
    };

    res.json({
      period: {
        type: period,
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      overview: {
        total_workers: workers.length,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        completion_rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        total_hours: Math.round(totalHours * 10) / 10,
        avg_hours_per_worker: workers.length > 0 ? Math.round((totalHours / workers.length) * 10) / 10 : 0
      },
      distributions: {
        priority: priorityDistribution,
        status: statusDistribution
      },
      worker_performance: workerStats,
      top_performers: workerStats
        .filter(worker => 
          // Solo incluir trabajadores que han hecho algo productivo
          worker.stats.completed_tasks > 0 || 
          worker.stats.total_hours > 0 ||
          worker.stats.active_tasks > 0
        )
        .sort((a, b) => {
          // Algoritmo de ranking multifactor
          
          // 1. Priorizar por tareas completadas (peso: 40%)
          const completedDiff = (b.stats.completed_tasks - a.stats.completed_tasks) * 0.4;
          
          // 2. Priorizar por eficiencia, pero solo si han trabajado (peso: 30%)
          const efficiencyDiff = (b.stats.efficiency - a.stats.efficiency) * 0.3;
          
          // 3. Priorizar por horas trabajadas (peso: 20%)
          const hoursDiff = (b.stats.total_hours - a.stats.total_hours) * 0.2;
          
          // 4. Penalizar por tareas pendientes (peso: 10%)
          const pendingPenalty = (a.stats.pending_tasks - b.stats.pending_tasks) * 0.1;
          
          const totalScore = completedDiff + efficiencyDiff + hoursDiff + pendingPenalty;
          
          // Si el score es muy similar, usar tareas completadas como desempate
          if (Math.abs(totalScore) < 0.1) {
            return b.stats.completed_tasks - a.stats.completed_tasks;
          }
          
          return totalScore;
        })
        .slice(0, 3),
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generando estadísticas del equipo:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router; 