const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { sendOTP, verifyOTP } = require('../services/smsService');
const { generateToken } = require('../utils/helpers');

exports.register = async (req, res, next) => {
  try {
    const { phoneNumber, name, password, role, email, cnic } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this phone number' });
    }

    // Create user
    const user = new User({
      phoneNumber,
      name,
      password,
      email,
      cnic,
      role: role || 'passenger'
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id);

    console.log(`User registered successfully: ${phoneNumber}, role: ${user.role}`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { phoneNumber, email, password } = req.body;
    
    const query = {};
    if (email) {
      query.email = email;
    } else if (phoneNumber) {
      query.phoneNumber = phoneNumber;
    } else {
      return res.status(400).json({ error: 'Phone number or email is required' });
    }

    // Find user
    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePhoto: user.profilePhoto
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.sendOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in cache or database
    // For demo, we'll just send it
    
    // Send OTP via SMS
    await sendOTP(phoneNumber, otp);

    // Store OTP for verification (in production, use Redis with TTL)
    // For demo, we'll return the OTP
    res.json({
      success: true,
      otp, // Remove this in production
      message: 'OTP sent successfully'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Verify OTP
    const isValid = await verifyOTP(phoneNumber, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Find or create user
    let user = await User.findOne({ phoneNumber });
    if (!user) {
      // Create temporary user
      user = new User({
        phoneNumber,
        isVerified: true,
        name: 'User'
      });
      await user.save();
    } else {
      user.isVerified = true;
      await user.save();
    }

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const newToken = generateToken(user._id);
    res.json({ success: true, token: newToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

exports.logout = async (req, res) => {
  // In production, add token to blacklist
  res.json({ success: true, message: 'Logged out successfully' });
};

exports.forgotPassword = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate reset OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await sendOTP(phoneNumber, otp);
    
    // Store OTP for reset
    // In production, use Redis

    res.json({
      success: true,
      message: 'Reset OTP sent to your phone'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { phoneNumber, otp, newPassword } = req.body;

    // Verify OTP
    const isValid = await verifyOTP(phoneNumber, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: error.message });
  }
};