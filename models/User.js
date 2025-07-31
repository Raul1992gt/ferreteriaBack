const bcrypt = require('bcryptjs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: {
        name: 'username',
        msg: 'Este nombre de usuario ya está en uso'
      },
      validate: {
        len: {
          args: [3, 50],
          msg: 'El nombre de usuario debe tener entre 3 y 50 caracteres'
        },
        isAlphanumeric: {
          msg: 'El nombre de usuario solo puede contener letras y números'
        }
      }
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: {
        name: 'email',
        msg: 'Este email ya está registrado'
      },
      validate: {
        isEmail: {
          msg: 'Debe proporcionar un email válido'
        }
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        len: {
          args: [6, 255],
          msg: 'La contraseña debe tener al menos 6 caracteres'
        }
      }
    },
    role: {
      type: DataTypes.ENUM('jefe', 'trabajador'),
      allowNull: false,
      defaultValue: 'trabajador',
      validate: {
        isIn: {
          args: [['jefe', 'trabajador']],
          msg: 'El rol debe ser jefe o trabajador'
        }
      }
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: {
          args: [2, 100],
          msg: 'El nombre debe tener entre 2 y 100 caracteres'
        }
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (user) => {
        if (user.password_hash) {
          const salt = await bcrypt.genSalt(12);
          user.password_hash = await bcrypt.hash(user.password_hash, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password_hash')) {
          const salt = await bcrypt.genSalt(12);
          user.password_hash = await bcrypt.hash(user.password_hash, salt);
        }
      }
    }
  });

  // Métodos de instancia
  User.prototype.validatePassword = async function(password) {
    return await bcrypt.compare(password, this.password_hash);
  };

  User.prototype.toSafeObject = function() {
    const { password_hash, ...safeUser } = this.toJSON();
    return safeUser;
  };

  // Asociaciones
  User.associate = function(models) {
    // Un usuario puede tener muchas tareas asignadas
    User.hasMany(models.Task, {
      foreignKey: 'assigned_to',
      as: 'assignedTasks'
    });

    // Un usuario puede crear muchas tareas (si es jefe)
    User.hasMany(models.Task, {
      foreignKey: 'created_by',
      as: 'createdTasks'
    });

    // Un usuario puede tener muchos fichajes
    User.hasMany(models.TimeClock, {
      foreignKey: 'user_id',
      as: 'timeClocks'
    });

    // Un usuario puede tener muchos registros de tiempo
    User.hasMany(models.TimeEntry, {
      foreignKey: 'user_id',
      as: 'timeEntries'
    });
  };

  return User;
}; 