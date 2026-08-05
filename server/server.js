const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const dns = require('dns');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store io instance
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection - REMOVED DEPRECATED OPTIONS
mongoose.connect(process.env.MONGODB_URI, {
  // These options are now default in mongoose v6+
  // useNewUrlParser and useUnifiedTopology are removed
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
  family: 4,
})
  .then(async () => {
    console.log('✅ MongoDB Connected');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🔌 Host: ${mongoose.connection.host}`);

    // One-time migration for vehicle types
    try {
      const Driver = require('./models/Driver');
      const economyUpdate = await Driver.updateMany({ 'vehicleDetails.type': 'economy' }, { $set: { 'vehicleDetails.type': 'car' } });
      const premiumUpdate = await Driver.updateMany({ 'vehicleDetails.type': 'premium' }, { $set: { 'vehicleDetails.type': 'car' } });
      const totalMigrated = (economyUpdate.modifiedCount || 0) + (premiumUpdate.modifiedCount || 0);
      if (totalMigrated > 0) {
        console.log(`Migrated ${totalMigrated} drivers from economy/premium to car`);
      }
    } catch (err) {
      console.error('Migration error:', err);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('💡 Make sure your MongoDB Atlas IP is whitelisted');
    // Don't exit, let the server try to reconnect
  });

// MongoDB Connection Events
mongoose.connection.on('connected', () => {
  console.log('🟢 MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error(`🔴 MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('🟡 MongoDB disconnected');
});

// Socket.IO Connection
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);

  socket.on('join-ride', (rideId) => {
    socket.join(`ride-${rideId}`);
    console.log(`Socket ${socket.id} joined ride ${rideId}`);
  });

  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Socket ${socket.id} joined user ${userId}`);
  });

  socket.on('join-parcel', (parcelId) => {
    socket.join(`parcel-${parcelId}`);
    console.log(`Socket ${socket.id} joined parcel ${parcelId}`);
  });

  socket.on('driver-location', (data) => {
    io.to(`ride-${data.rideId}`).emit('driver-location', data);
  });

  socket.on('parcel-driver-location', (data) => {
    io.to(`parcel-${data.parcelId}`).emit('parcel-driver-location', data);
  });

  socket.on('join-shared-ride', async (shareToken) => {
    try {
      const Ride = require('./models/Ride');
      const ride = await Ride.findOne({ shareToken });
      if (ride && (ride.status === 'accepted' || ride.status === 'started')) {
        const roomName = `ride-${ride._id}`;
        // Enforce max viewers (simple check)
        const room = io.sockets.adapter.rooms.get(roomName);
        if (!room || room.size < 10) { // arbitrary safe limit
          socket.join(roomName);
          console.log(`Shared viewer ${socket.id} joined ride ${ride._id}`);
        } else {
          socket.emit('error', 'Too many viewers for this ride');
        }
      } else {
        socket.emit('error', 'Ride not found or ended');
      }
    } catch (e) {
      console.error('join-shared-ride error', e);
    }
  });

  socket.on('passenger-location', (data) => {
    io.to(`ride-${data.rideId}`).emit('passenger-location', data);
  });

  // VoIP WebRTC Signaling
  require('./socket/callHandler')(io, socket);

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
  });
});

// Routes - IMPORTANT: Route order matters
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rides', require('./routes/rideRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/calls', require('./routes/callRoutes'));
// app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/parcels', require('./routes/parcelRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/ratings', require('./routes/ratingRoutes'));
app.use('/api/history', require('./routes/historyRoutes'));
app.use('/api/pricing', require('./routes/pricingRoutes'));

// Health check
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };

  res.json({
    status: 'OK',
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: statusMap[dbStatus] || 'Unknown'
  });
});

// Error Handler
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Shutting down gracefully...');
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  } catch (err) {
    console.error('❌ Error during shutdown:', err);
    process.exit(1);
  }
});

module.exports = { app, server, io };