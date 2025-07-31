module.exports = (sequelize, DataTypes) => {
  const TimeClock = sequelize.define('TimeClock', {
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
    clock_in_time: {
      type: DataTypes.DATE,
      allowNull: false,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha y hora válida para la entrada'
        }
      }
    },
    clock_out_time: {
      type: DataTypes.DATE,
      allowNull: true,
      validate: {
        isDate: {
          msg: 'Debe proporcionar una fecha y hora válida para la salida'
        },
        isAfterClockIn(value) {
          if (value && this.clock_in_time && value <= this.clock_in_time) {
            throw new Error('La hora de salida debe ser posterior a la hora de entrada');
          }
        }
      }
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
    total_hours: {
      type: DataTypes.DECIMAL(4, 2),
      allowNull: true,
      defaultValue: 0.00,
      validate: {
        min: {
          args: [0],
          msg: 'Las horas totales no pueden ser negativas'
        },
        max: {
          args: [24],
          msg: 'Las horas totales no pueden exceder 24 horas en un día'
        }
      }
    },
    break_time_minutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'El tiempo de descanso no puede ser negativo'
        },
        max: {
          args: [480], // 8 horas máximo de descanso
          msg: 'El tiempo de descanso no puede exceder 8 horas'
        }
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_manual: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Indica si el fichaje fue creado manualmente por un administrador'
    }
  }, {
    tableName: 'time_clocks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['date']
      },
      {
        fields: ['user_id', 'clock_in_time']
      }
    ],
    hooks: {
      beforeSave: (timeClock) => {
        // Calcular horas totales automáticamente si hay entrada y salida
        if (timeClock.clock_in_time && timeClock.clock_out_time) {
          const diffMs = timeClock.clock_out_time - timeClock.clock_in_time;
          const diffHours = diffMs / (1000 * 60 * 60);
          const breakHours = (timeClock.break_time_minutes || 0) / 60;
          timeClock.total_hours = Math.max(0, diffHours - breakHours);
        }
        
        // Asegurar que la fecha coincida con la fecha de entrada
        if (timeClock.clock_in_time) {
          timeClock.date = timeClock.clock_in_time.toISOString().split('T')[0];
        }
      }
    }
  });

  // Métodos de instancia
  TimeClock.prototype.clockOut = function(clockOutTime = new Date(), breakMinutes = 0) {
    this.clock_out_time = clockOutTime;
    this.break_time_minutes = breakMinutes;
    
    // Recalcular horas totales
    const diffMs = this.clock_out_time - this.clock_in_time;
    const diffHours = diffMs / (1000 * 60 * 60);
    const breakHours = breakMinutes / 60;
    this.total_hours = Math.max(0, diffHours - breakHours);
    
    return this.save();
  };

  TimeClock.prototype.isActive = function() {
    return this.clock_in_time && !this.clock_out_time;
  };

  TimeClock.prototype.getDuration = function() {
    if (!this.clock_in_time) return 0;
    
    const endTime = this.clock_out_time || new Date();
    const diffMs = endTime - this.clock_in_time;
    return Math.max(0, diffMs / (1000 * 60 * 60)); // retorna en horas
  };

  TimeClock.prototype.formatDuration = function() {
    const hours = this.getDuration();
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  // Métodos estáticos
  TimeClock.getTodaysClock = async function(userId, date = new Date()) {
    const today = date.toISOString().split('T')[0];
    return await this.findOne({
      where: {
        user_id: userId,
        date: today
      }
    });
  };

  // NUEVO: Obtener el fichaje activo más reciente de hoy (para múltiples fichajes)
  TimeClock.getTodaysActiveClock = async function(userId, date = new Date()) {
    const today = date.toISOString().split('T')[0];
    return await this.findOne({
      where: {
        user_id: userId,
        date: today,
        clock_out_time: null
      },
      order: [['clock_in_time', 'DESC']]
    });
  };

  // NUEVO: Obtener todos los fichajes del día
  TimeClock.getAllTodaysClocks = async function(userId, date = new Date()) {
    const today = date.toISOString().split('T')[0];
    return await this.findAll({
      where: {
        user_id: userId,
        date: today
      },
      order: [['clock_in_time', 'ASC']]
    });
  };

  // NUEVO: Calcular horas totales del día (suma de todos los períodos)
  TimeClock.getTotalHoursToday = async function(userId, date = new Date()) {
    const clocks = await this.getAllTodaysClocks(userId, date);
    let totalHours = 0;
    
    for (const clock of clocks) {
      if (clock.clock_out_time) {
        // Períodos cerrados: usar las horas calculadas
        totalHours += parseFloat(clock.total_hours) || 0;
      } else {
        // Período activo: calcular horas transcurridas hasta ahora
        const now = new Date();
        const diffMs = now - new Date(clock.clock_in_time);
        const diffHours = diffMs / (1000 * 60 * 60);
        const breakHours = (clock.break_time_minutes || 0) / 60;
        const activeHours = Math.max(0, diffHours - breakHours);
        totalHours += activeHours;
      }
    }
    
    return Math.round(totalHours * 10) / 10; // Redondear a 1 decimal
  };

  TimeClock.getActiveClocks = async function() {
    return await this.findAll({
      where: {
        clock_out_time: null
      },
      include: [{
        model: sequelize.models.User,
        as: 'user',
        attributes: ['id', 'name', 'username', 'role']
      }]
    });
  };

  // Asociaciones
  TimeClock.associate = function(models) {
    // Un fichaje pertenece a un usuario
    TimeClock.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user'
    });
  };

  return TimeClock;
}; 