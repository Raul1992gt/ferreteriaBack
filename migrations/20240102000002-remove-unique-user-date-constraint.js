'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Eliminar el índice único que impide múltiples fichajes por día
    await queryInterface.removeIndex('time_clocks', 'unique_user_date_clock');
    
    console.log('✅ Índice único unique_user_date_clock eliminado - ahora se permiten múltiples fichajes por día');
  },

  async down(queryInterface, Sequelize) {
    // Restaurar el índice único (solo si no hay datos conflictivos)
    await queryInterface.addIndex('time_clocks', ['user_id', 'date'], {
      unique: true,
      name: 'unique_user_date_clock'
    });
    
    console.log('⚠️ Índice único unique_user_date_clock restaurado - solo un fichaje por día');
  }
}; 