module.exports = (sequelize, DataTypes) => {
  const Task = sequelize.define('Task', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: {
          args: [3, 200],
          msg: 'El título debe tener entre 3 y 200 caracteres'
        }
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    assigned_to: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: DataTypes.ENUM('pendiente', 'en_progreso', 'completada', 'cancelada'),
      allowNull: false,
      defaultValue: 'pendiente',
      validate: {
        isIn: {
          args: [['pendiente', 'en_progreso', 'completada', 'cancelada']],
          msg: 'El estado debe ser pendiente, en_progreso, completada o cancelada'
        }
      }
    },
    priority: {
      type: DataTypes.ENUM('baja', 'media', 'alta', 'urgente'),
      allowNull: false,
      defaultValue: 'media',
      validate: {
        isIn: {
          args: [['baja', 'media', 'alta', 'urgente']],
          msg: 'La prioridad debe ser baja, media, alta o urgente'
        }
      }
    },
    estimated_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: {
        min: {
          args: [0.1],
          msg: 'Las horas estimadas deben ser mayor a 0'
        },
        max: {
          args: [999.99],
          msg: 'Las horas estimadas no pueden ser mayor a 999.99'
        }
      }
    },
    actual_hours: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      defaultValue: 0.00
    },
    due_date: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha válida'
        },
        isAfterToday(value) {
          if (value && value < new Date()) {
            throw new Error('La fecha de vencimiento debe ser en el futuro');
          }
        }
      }
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    completion_comments: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Comentarios del usuario al completar la tarea'
    }
  }, {
    tableName: 'tasks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeUpdate: (task) => {
        if (task.status === 'completada' && !task.completed_at) {
          task.completed_at = new Date();
        }
        if (task.status !== 'completada' && task.completed_at) {
          task.completed_at = null;
        }
      }
    }
  });

  // Métodos de instancia
  Task.prototype.markAsCompleted = function() {
    this.status = 'completada';
    this.completed_at = new Date();
    return this.save();
  };

  // Método para calcular progreso automáticamente
  Task.prototype.calculateProgress = function() {
    if (this.status === 'completada') {
      return 100;
    }
    
    if (!this.estimated_hours || this.estimated_hours <= 0) {
      return 0;
    }
    
    // Calcular progreso basado en horas trabajadas vs estimadas
    const progress = (this.actual_hours / this.estimated_hours) * 100;
    return Math.min(Math.round(progress), 100);
  };

  // Método para verificar si está atrasada
  Task.prototype.isOverdue = function() {
    if (!this.due_date || this.status === 'completada') {
      return false;
    }
    return new Date(this.due_date) < new Date();
  };

  // Asociaciones
  Task.associate = function(models) {
    // Una tarea pertenece a un usuario asignado
    Task.belongsTo(models.User, {
      foreignKey: 'assigned_to',
      as: 'assignedUser'
    });

    // Una tarea pertenece a un usuario creador
    Task.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'creator'
    });

    // Una tarea puede tener muchos registros de tiempo
    Task.hasMany(models.TimeEntry, {
      foreignKey: 'task_id',
      as: 'timeEntries'
    });
  };

  return Task;
}; 