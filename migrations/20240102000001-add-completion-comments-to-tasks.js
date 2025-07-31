'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tasks', 'completion_comments', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Comentarios del usuario al completar la tarea'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('tasks', 'completion_comments');
  }
}; 