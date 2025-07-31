'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('time_entries', {
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
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_minutes: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 0
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      is_free_time: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      is_billable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      category: {
        type: Sequelize.ENUM('desarrollo', 'reunion', 'documentacion', 'testing', 'soporte', 'administracion', 'formacion', 'otro'),
        allowNull: true
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
    await queryInterface.addIndex('time_entries', ['user_id', 'date']);
    await queryInterface.addIndex('time_entries', ['task_id']);
    await queryInterface.addIndex('time_entries', ['date']);
    await queryInterface.addIndex('time_entries', ['start_time']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('time_entries');
  }
}; 