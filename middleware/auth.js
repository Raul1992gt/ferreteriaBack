const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Middleware para verificar JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Verificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar el usuario en la base de datos
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!user) {
      return res.status(401).json({ 
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ 
        error: 'Usuario desactivado',
        code: 'USER_INACTIVE'
      });
    }

    // Añadir usuario a la request
    req.user = user;
    next();

  } catch (error) {
    console.error('Error en autenticación:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        error: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(403).json({ 
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar rol de jefe
const requireJefe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.user.role !== 'jefe') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de jefe',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  } catch (error) {
    console.error('Error verificando rol de jefe:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar rol de trabajador
const requireTrabajador = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.user.role !== 'trabajador') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Se requiere rol de trabajador',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  } catch (error) {
    console.error('Error verificando rol de trabajador:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar que el usuario pueda acceder a sus propios datos
const requireOwnerOrJefe = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Autenticación requerida',
        code: 'AUTH_REQUIRED'
      });
    }

    const requestedUserId = parseInt(req.params.userId || req.params.id);
    
    // Si es jefe, puede acceder a cualquier dato
    if (req.user.role === 'jefe') {
      return next();
    }
    
    // Si es trabajador, solo puede acceder a sus propios datos
    if (req.user.role === 'trabajador' && req.user.id === requestedUserId) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Acceso denegado. Solo puedes acceder a tus propios datos',
      code: 'ACCESS_DENIED'
    });

  } catch (error) {
    console.error('Error verificando permisos de propietario:', error);
    return res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware opcional para autenticación (no falla si no hay token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash'] }
    });

    req.user = user && user.is_active ? user : null;
    next();

  } catch (error) {
    // En caso de error, simplemente no autenticar
    req.user = null;
    next();
  }
};

module.exports = {
  authenticateToken,
  requireJefe,
  requireTrabajador,
  requireOwnerOrJefe,
  optionalAuth
}; 