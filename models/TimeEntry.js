module.exports = (sequelize, DataTypes) => {
  const TimeEntry = sequelize.define('TimeEntry', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'tasks',
        key: 'id'
      },
      comment: 'Null para tiempo libre, ID de tarea para tiempo asignado'
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha y hora de inicio válida'
        }
      }
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha y hora de fin válida'
        },
        isAfterStartTime(value) {
          if (value && this.start_time && value <= this.start_time) {
            throw new Error('La hora de fin debe ser posterior a la hora de inicio');
          }
        }
      }
    },
    duration_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'La duración no puede ser negativa'
        },
        max: {
          args: [1440], // 24 horas máximo
          msg: 'La duración no puede exceder 24 horas (1440 minutos)'
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: {
          args: [3, 500],
          msg: 'La descripción debe tener entre 3 y 500 caracteres'
        }
      }
    },
    is_free_time: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'True para tiempo libre, false para tiempo en tareas'
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha válida'
        }
      }
    },
    is_billable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Indica si este tiempo es facturable/productivo'
    },
    category: {
      type: DataTypes.ENUM('desarrollo', 'reunion', 'documentacion', 'testing', 'soporte', 'administracion', 'formacion', 'otro'),
      allowNull: true,
      validate: {
        isIn: {
          args: [['desarrollo', 'reunion', 'documentacion', 'testing', 'soporte', 'administracion', 'formacion', 'otro']],
          msg: 'La categoría debe ser válida'
        }
      }
    }
  }, {
    tableName: 'time_entries',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['user_id', 'date']
      },
      {
        fields: ['task_id']
      },
      {
        fields: ['date']
      },
      {
        fields: ['start_time']
      }
    ],
    hooks: {
      beforeSave: (timeEntry) => {
        // Calcular duración automáticamente si hay inicio y fin
        if (timeEntry.start_time && timeEntry.end_time) {
          const diffMs = timeEntry.end_time - timeEntry.start_time;
          timeEntry.duration_minutes = Math.floor(diffMs / (1000 * 60));
        }
        
        // Asegurar que la fecha coincida con la fecha de inicio
        if (timeEntry.start_time) {
          timeEntry.date = timeEntry.start_time.toISOString().split('T')[0];
        }
        
        // Si no hay task_id, es tiempo libre
        if (!timeEntry.task_id) {
          timeEntry.is_free_time = true;
        }
      },
      afterSave: async (timeEntry) => {
        // Actualizar las horas reales de la tarea
        if (timeEntry.task_id && timeEntry.duration_minutes > 0) {
          const Task = sequelize.models.Task;
          const task = await Task.findByPk(timeEntry.task_id);
          if (task) {
            // Calcular total de horas de todas las entradas de tiempo para esta tarea
            const totalMinutes = await TimeEntry.sum('duration_minutes', {
              where: { task_id: timeEntry.task_id }
            });
            
            task.actual_hours = (totalMinutes || 0) / 60;
            await task.save();
          }
        }
      }
    }
  });

  // Métodos de instancia
  TimeEntry.prototype.stop = function(endTime = new Date()) {
    this.end_time = endTime;
    
    // Calcular duración
    const diffMs = this.end_time - this.start_time;
    this.duration_minutes = Math.floor(diffMs / (1000 * 60));
    
    return this.save();
  };

  TimeEntry.prototype.isActive = function() {
    return this.start_time && !this.end_time;
  };

  TimeEntry.prototype.getDurationHours = function() {
    return (this.duration_minutes || 0) / 60;
  };

  TimeEntry.prototype.formatDuration = function() {
    const totalMinutes = this.duration_minutes || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  // Métodos estáticos
  TimeEntry.getActiveEntry = async function(userId) {
    return await this.findOne({
      where: {
        user_id: userId,
        end_time: null
      },
      include: [{
        model: sequelize.models.Task,
        as: 'task',
        attributes: ['id', 'title', 'status']
      }]
    });
  };

  TimeEntry.getTodaysEntries = async function(userId, date = new Date()) {
    const today = date.toISOString().split('T')[0];
    return await this.findAll({
      where: {
        user_id: userId,
        date: today
      },
      include: [{
        model: sequelize.models.Task,
        as: 'task',
        attributes: ['id', 'title', 'status']
      }],
      order: [['start_time', 'DESC']]
    });
  };

  TimeEntry.getWeeklyReport = async function(userId, startDate, endDate) {
    return await this.findAll({
      where: {
        user_id: userId,
        date: {
          [sequelize.Op.between]: [startDate, endDate]
        }
      },
      include: [{
        model: sequelize.models.Task,
        as: 'task',
        attributes: ['id', 'title', 'status']
      }],
      order: [['date', 'DESC'], ['start_time', 'DESC']]
    });
  };

  // Asociaciones
  TimeEntry.associate = function(models) {
    // Un registro de tiempo pertenece a un usuario
    TimeEntry.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });

    // Un registro de tiempo puede pertenecer a una tarea
    TimeEntry.belongsTo(models.Task, {
      foreignKey: 'task_id',
      as: 'task'
    });
  };

  return TimeEntry;
}; 