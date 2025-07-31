const Sequelize = require('sequelize');
const config = require('../config/database.js');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

let sequelize;

// Si tu dbConfig de producción tiene una URL completa (aunque Aiven te dio componentes separados)
// Puedes construir la URL si quieres, pero con los componentes separados y dialectOptions es suficiente
if (dbConfig.url) {
  sequelize = new Sequelize(dbConfig.url, dbConfig);
} else {
  sequelize = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, dbConfig);
}

const db = {};

// Cargar todos los modelos automáticamente
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== path.basename(__filename)) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Configurar asociaciones
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Prueba la conexión a la base de datos
sequelize.authenticate()
  .then(() => {
    console.log('Conexión a la base de datos establecida correctamente.');
  })
  .catch(err => {
    console.error('❌ Error al conectar a la base de datos:', err);
    // Es común salir del proceso si la conexión a la DB falla en el arranque
    process.exit(1);
  });

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;