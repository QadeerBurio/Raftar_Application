const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/validation');
const auth = require('../middleware/auth');

console.log('body is', typeof body);
console.log('validateRequest is', typeof validateRequest);
console.log('authController is', typeof authController);
console.log('authController.register is', typeof authController.register);

// Register
router.post(
  '/register',
    body('phoneNumber').isMobilePhone('any').withMessage('Valid phone number required'),
    body('name').notEmpty().withMessage('Name is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['passenger', 'driver']),
  validateRequest,
  authController.register
);

// Login
router.post(
  '/login',
  [
    body('password').notEmpty().withMessage('Password is required'),
    body().custom((value) => {
      if (!value.phoneNumber && !value.email) {
        throw new Error('Either phone number or email is required');
      }
      return true;
    })
  ],
  validateRequest,
  authController.login
);

// Send OTP
router.post(
  '/send-otp',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
  ],
  validateRequest,
  authController.sendOTP
);

// Verify OTP
router.post(
  '/verify-otp',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
    body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid OTP required'),
  ],
  validateRequest,
  authController.verifyOTP
);

// Refresh Token
router.post('/refresh-token', authController.refreshToken);

// Logout
router.post('/logout', auth, authController.logout);

// Forgot Password
router.post(
  '/forgot-password',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
  ],
  validateRequest,
  authController.forgotPassword
);

// Reset Password
router.post(
  '/reset-password',
  [
    body('phoneNumber').isMobilePhone().withMessage('Valid phone number required'),
    body('otp').isLength({ min: 4, max: 6 }).withMessage('Valid OTP required'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  validateRequest,
  authController.resetPassword
);

module.exports = router;