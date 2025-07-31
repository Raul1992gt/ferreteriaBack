'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('time_clocks', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      clock_in_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      clock_out_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      total_hours: {
        type: Sequelize.DECIMAL(4, 2),
        allowNull: true,
        defaultValue: 0.00
      },
      break_time_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_manual: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Crear índices
    await queryInterface.addIndex('time_clocks', ['user_id']);
    await queryInterface.addIndex('time_clocks', ['date']);
    await queryInterface.addIndex('time_clocks', ['user_id', 'clock_in_time']);
    
    // Índice único para evitar múltiples fichajes por día
    await queryInterface.addIndex('time_clocks', ['user_id', 'date'], {
      unique: true,
      name: 'unique_user_date_clock'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('time_clocks');
  }
}; 