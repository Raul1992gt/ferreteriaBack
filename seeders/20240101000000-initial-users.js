'use strict';

const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const salt = await bcrypt.genSalt(12);
    
    await queryInterface.bulkInsert('users', [
      {
        username: 'jefe',
        email: 'jefe@appferre.com',
        password_hash: await bcrypt.hash('123456', salt),
        role: 'jefe',
        name: 'Administrador del Sistema',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        username: 'juan',
        email: 'juan@appferre.com',
        password_hash: await bcrypt.hash('123456', salt),
        role: 'trabajador',
        name: 'Juan Pérez',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        username: 'maria',
        email: 'maria@appferre.com',
        password_hash: await bcrypt.hash('123456', salt),
        role: 'trabajador',
        name: 'María García',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', null, {});
  }
}; 