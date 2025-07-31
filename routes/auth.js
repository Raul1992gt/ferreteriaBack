const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Generar JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @route   POST /api/auth/register
// @desc    Registrar nuevo usuario
// @access  Public (pero controlado por jefe en producción)
router.post('/register', [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('El nombre de usuario debe tener entre 3 y 50 caracteres')
    .isAlphanumeric()
    .withMessage('El nombre de usuario solo puede contener letras y números'),
  body('email')
    .isEmail()
    .withMessage('Debe proporcionar un email válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres')
    .trim(),
  body('role')
    .optional()
    .isIn(['jefe', 'trabajador'])
    .withMessage('El rol debe ser jefe o trabajador')
], async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { username, email, password, name, role = 'trabajador' } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({
      where: {
        [User.sequelize.Sequelize.Op.or]: [
          { email },
          { username }
        ]
      }
    });

    if (existingUser) {
      return res.status(409).json({
        error: existingUser.email === email 
          ? 'Este email ya está registrado' 
          : 'Este nombre de usuario ya está en uso'
      });
    }

    // Crear nuevo usuario
    const newUser = await User.create({
      username,
      email,
      password_hash: password, // Se hashea automáticamente en el hook
      name,
      role
    });

    // Generar token
    const token = generateToken(newUser.id);

    // Respuesta exitosa
    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: newUser.toSafeObject()
    });

  } catch (error) {
    console.error('Error en registro:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Iniciar sesión
// @access  Public
router.post('/login', [
  body('identifier')
    .notEmpty()
    .withMessage('Debe proporcionar email o nombre de usuario'),
  body('password')
    .notEmpty()
    .withMessage('Debe proporcionar una contraseña')
], async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { identifier, password } = req.body;

    // Buscar usuario por email o username
    const user = await User.findOne({
      where: {
        [User.sequelize.Sequelize.Op.or]: [
          { email: identifier },
          { username: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    // Verificar si el usuario está activo
    if (!user.is_active) {
      return res.status(401).json({
        error: 'Usuario desactivado. Contacte al administrador'
      });
    }

    // Verificar contraseña
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciales inválidas'
      });
    }

    // Actualizar último login
    user.last_login = new Date();
    await user.save();

    // Generar token
    const token = generateToken(user.id);

    // Respuesta exitosa
    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Obtener información del usuario actual
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user.toSafeObject()
    });
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Renovar token JWT
// @access  Private
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    // Generar nuevo token
    const newToken = generateToken(req.user.id);

    res.json({
      message: 'Token renovado exitosamente',
      token: newToken
    });

  } catch (error) {
    console.error('Error renovando token:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Cerrar sesión (invalida token en el cliente)
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // En una implementación más robusta, aquí se invalidaría el token
    // en una blacklist de redis o similar
    
    res.json({
      message: 'Sesión cerrada exitosamente'
    });

  } catch (error) {
    console.error('Error cerrando sesión:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Cambiar contraseña del usuario actual
// @access  Private
router.put('/change-password', [
  authenticateToken,
  body('currentPassword')
    .notEmpty()
    .withMessage('Debe proporcionar la contraseña actual'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres')
], async (req, res) => {
  try {
    // Verificar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Obtener usuario completo (con password_hash)
    const user = await User.findByPk(req.user.id);

    // Verificar contraseña actual
    const isValidPassword = await user.validatePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Contraseña actual incorrecta'
      });
    }

    // Actualizar contraseña
    user.password_hash = newPassword; // Se hashea automáticamente en el hook
    await user.save();

    res.json({
      message: 'Contraseña actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

module.exports = router; 