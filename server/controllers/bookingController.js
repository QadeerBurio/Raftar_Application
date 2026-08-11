const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { findMatchingRoutes } = require('../services/mapService');
const { sendNotification } = require('../services/notificationService');

/**
 * Create carpool booking (Driver)
 */
exports.createCarpoolBooking = async (req, res) => {
  try {
    const { pickup, dropoff, seats, timeWindow, pricePerSeat, isIntercity } = req.body;
    
    // Find driver
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const booking = new Booking({
      type: 'carpool',
      isIntercity: isIntercity || false,
      driverId: driver._id,
      pickup,
      dropoff,
      status: 'available',
      timeWindow,
      carpool: {
        totalSeats: seats || 4,
        seatsAvailable: seats || 4,
        pricePerSeat: pricePerSeat || 0,
        departureTime: timeWindow ? timeWindow.start : new Date(),
        passengers: []
      }
    });
    
    await booking.save();

    return res.status(201).json({
      success: true,
      booking,
      message: 'Carpool created successfully'
    });
  } catch (error) {
    console.error('Create carpool error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available carpools
 */
exports.getAvailableCarpools = async (req, res) => {
  try {
    const { pickup, dropoff, time, isIntercity } = req.query;

    if (!pickup || !dropoff) {
      return res.status(400).json({ error: 'Pickup and dropoff locations are required' });
    }

    let pickupLng, pickupLat;
    if (typeof pickup === 'string') {
        try {
            const parsed = JSON.parse(pickup);
            if (Array.isArray(parsed)) {
              pickupLng = parsed[0];
              pickupLat = parsed[1];
            } else {
              pickupLng = parsed.lng || parsed.coordinates[0];
              pickupLat = parsed.lat || parsed.coordinates[1];
            }
        } catch(e) {
            return res.status(400).json({ error: 'Invalid pickup format' });
        }
    } else {
        pickupLng = pickup.lng;
        pickupLat = pickup.lat;
    }

    const userId = req.user ? req.user.id : null;

    const query = {
      type: 'carpool',
      isIntercity: isIntercity === 'true',
      status: { $in: ['available', 'searching'] },
      'carpool.seatsAvailable': { $gt: 0 },
    };

    if (userId) {
      query.$or = [
        { passengerId: { $ne: userId } },
        { passengerId: { $exists: false } }
      ];
    }

    const carpools = await Booking.find({
      ...query,
      'pickup.location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(pickupLng), parseFloat(pickupLat)]
          },
          $maxDistance: 15000 // 15km
        }
      }
    }).populate({ 
        path: 'driverId', 
        populate: { path: 'userId', select: 'name phoneNumber rating profileImage' } 
    });

    res.json({
      success: true,
      carpools: carpools || []
    });
  } catch (error) {
    console.error('Get available carpools error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create carpool request (Passenger)
 */
exports.createCarpoolRequest = async (req, res) => {
  try {
    const { pickup, dropoff, timeWindow, isIntercity } = req.body;
    const passengerId = req.user.id;

    const booking = new Booking({
      type: 'carpool',
      isIntercity: isIntercity || false,
      passengerId,
      pickup,
      dropoff,
      timeWindow,
      status: 'searching',
      carpool: {
        totalSeats: 4,
        seatsAvailable: 3,
        departureTime: timeWindow ? timeWindow.start : new Date(),
        passengers: [{
          user: passengerId,
          pickup,
          dropoff,
          status: 'pending'
        }]
      }
    });

    await booking.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('carpool-request', { booking });
    }

    res.status(201).json({
      success: true,
      booking,
      message: 'Carpool request posted successfully'
    });
  } catch (error) {
    console.error('Create carpool request error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel carpool (Driver)
 */
exports.cancelCarpool = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    
    const booking = await Booking.findOne({ _id: carpoolId, driverId: driver._id, type: 'carpool' });
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });
    
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel this carpool' });
    }
    
    booking.status = 'cancelled';
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      io.emit('carpool-cancelled', { carpoolId });
    }
    
    res.json({ success: true, message: 'Carpool cancelled successfully' });
  } catch (error) {
    console.error('Cancel carpool error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel carpool request (Passenger)
 */
exports.cancelCarpoolRequest = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const passengerId = req.user.id;
    
    const booking = await Booking.findOne({ _id: carpoolId, passengerId, type: 'carpool' });
    if (!booking) {
      return res.status(404).json({ error: 'Carpool request not found' });
    }
    
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel this request' });
    }
    
    booking.status = 'cancelled';
    await booking.save();
    
    // Optionally emit cancellation to drivers here
    const io = req.app.get('io');
    if (io) {
      io.emit('carpool-cancelled', { carpoolId });
    }
    
    res.json({ success: true, message: 'Carpool request cancelled successfully' });
  } catch (error) {
    console.error('Cancel carpool request error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create monthly pass
 */
exports.createMonthlyPass = async (req, res) => {
  try {
    const { pickup, dropoff, schedule, vehicleType } = req.body;
    const passengerId = req.user.id;

    const pass = new Booking({
      type: 'monthly_pass',
      passengerId,
      pickup,
      dropoff,
      schedule,
      vehicleType,
      status: 'active',
      monthlyPass: {
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        days: schedule.days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        time: schedule.time || '09:00'
      }
    });

    await pass.save();

    // Find regular driver for the route
    const driver = await findRegularDriver(pickup, dropoff, schedule);
    if (driver) {
      pass.monthlyPass.assignedDriver = driver._id;
      await pass.save();
      
      await sendNotification(driver.userId, 'MONTHLY_PASS_ASSIGNED', {
        passId: pass._id,
        pickup: pickup.address,
        dropoff: dropoff.address
      });
    }

    res.status(201).json({
      success: true,
      pass,
      message: 'Monthly pass created successfully'
    });
  } catch (error) {
    console.error('Create monthly pass error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get driver carpools
 */
exports.getDriverCarpools = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    // Auto-expire searching requests whose departure time has passed
    const now = new Date();
    await Booking.updateMany(
      { 
        type: 'carpool', 
        status: 'searching', 
        'timeWindow.start': { $lt: now }
      },
      { $set: { status: 'expired' } }
    );

    const { isIntercity } = req.query;
    const isIntercityBool = isIntercity === 'true';

    const acceptedCarpools = await Booking.find({ 
      type: 'carpool', 
      isIntercity: isIntercityBool,
      driverId: driver._id,
      status: { $in: ['accepted', 'confirmed', 'available', 'full', 'in-progress'] }
    })
      .populate('carpool.passengers.user', 'name phoneNumber profileImage')
      .populate('passengerId', 'name phoneNumber profileImage')
      .sort({ createdAt: -1 });

    const pendingRequests = await Booking.find({ 
      type: 'carpool', 
      isIntercity: isIntercityBool,
      status: 'searching', 
      passengerId: { $exists: true } 
    })
      .populate('passengerId', 'name phoneNumber profileImage')
      .sort({ 'timeWindow.start': 1 });
      
    res.json({ success: true, acceptedCarpools, pendingRequests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get passenger carpools (Requests)
 */
exports.getPassengerCarpools = async (req, res) => {
  try {
    const passengerId = req.user.id;
    const { isIntercity } = req.query;
    const isIntercityBool = isIntercity === 'true';

    // Auto-expire searching requests whose departure time has passed
    const now = new Date();
    await Booking.updateMany(
      { 
        type: 'carpool', 
        status: 'searching', 
        passengerId,
        'timeWindow.start': { $lt: now }
      },
      { $set: { status: 'expired' } }
    );

    const pendingRequests = await Booking.find({ 
      type: 'carpool', 
      isIntercity: isIntercityBool, 
      $or: [{ passengerId }, { 'carpool.passengers.user': passengerId }],
      status: 'searching' 
    })
      .populate('carpool.passengers.user', 'name phoneNumber profileImage')
      .sort({ 'timeWindow.start': 1 });

    const acceptedCarpools = await Booking.find({ 
      type: 'carpool', 
      isIntercity: isIntercityBool,
      $or: [{ passengerId }, { 'carpool.passengers.user': passengerId }],
      status: { $in: ['accepted', 'confirmed', 'in-progress', 'completed', 'available', 'full'] }
    })
      .populate({
        path: 'driverId',
        populate: { path: 'userId', select: 'name phoneNumber profileImage' }
      })
      .populate('carpool.passengers.user', 'name phoneNumber profileImage')
      .sort({ createdAt: -1 });
      
    res.json({ success: true, pendingRequests, acceptedCarpools });
  } catch (error) {
    console.error('Get passenger carpools error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get available carpool requests for Drivers
 */
exports.getAvailableCarpoolRequests = async (req, res) => {
  try {
    const { isIntercity } = req.query;
    // A driver wants to see passenger carpool requests (searching)
    const carpools = await Booking.find({
      type: 'carpool',
      isIntercity: isIntercity === 'true',
      status: 'searching',
      passengerId: { $exists: true }
    }).populate('passengerId', 'name phoneNumber rating profileImage')
      .sort({ createdAt: -1 });
      
    res.json({ success: true, carpools });
  } catch (error) {
    console.error('Get available carpool requests error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Accept passenger's carpool request (Driver)
 */
exports.acceptCarpoolRequest = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    
    // Find driver
    const driver = await Driver.findOne({ userId: req.user.id });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const booking = await Booking.findOne({ _id: carpoolId, type: 'carpool', passengerId: { $exists: true } });
    if (!booking) {
      return res.status(404).json({ error: 'Carpool request not found' });
    }

    if (booking.status !== 'searching') {
      return res.status(400).json({ error: 'This request is no longer available' });
    }

    // Driver accepts the passenger's request
    booking.driverId = driver._id;
    booking.status = 'confirmed'; // or 'active' / 'in-progress'
    
    if (booking.carpool && booking.carpool.passengers && booking.carpool.passengers.length > 0) {
      booking.carpool.passengers.forEach(p => {
        p.status = 'accepted';
      });
    }

    await booking.save();

    // Notify all passengers
    const io = req.app.get('io');
    if (io) {
      booking.carpool.passengers.forEach(p => {
        io.to(`user_${p.user.toString()}`).emit('join-accepted', {
          carpoolId: booking._id
        });
      });
    }

    res.json({ success: true, booking, message: 'Carpool request accepted successfully' });
  } catch (error) {
    console.error('Accept carpool request error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Join carpool request (Passenger)
 */
exports.joinCarpool = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const passengerId = req.user.id;
    const { pickup, dropoff } = req.body;

    const booking = await Booking.findById(carpoolId).populate('driverId');
    if (!booking) {
      return res.status(404).json({ error: 'Carpool not found' });
    }

    if (booking.status !== 'available' && booking.status !== 'searching') {
      return res.status(400).json({ error: 'This carpool is no longer available' });
    }

    if (booking.carpool.seatsAvailable <= 0) {
      return res.status(400).json({ error: 'No seats available' });
    }

    // Check if already requested
    const existingPassenger = booking.carpool.passengers.find(p => p.user.toString() === passengerId);
    if (existingPassenger) {
      return res.status(400).json({ error: 'Already requested to join this carpool' });
    }

    const isSearching = booking.status === 'searching';
    
    booking.carpool.passengers.push({
      user: passengerId,
      pickup,
      dropoff,
      status: isSearching ? 'accepted' : 'pending'
    });
    
    if (isSearching) {
      booking.carpool.seatsAvailable -= 1;
    }
    
    await booking.save();

    const io = req.app.get('io');
    if (io && booking.driverId && booking.driverId.userId) {
      io.to(`user_${booking.driverId.userId.toString()}`).emit('join-request', {
        carpoolId: booking._id,
        passengerId,
        pickup,
        dropoff,
        passengerData: {
          _id: req.user.id,
          name: req.user.name,
          rating: req.user.rating || 4.8
        }
      });
    } else if (io && booking.passengerId) {
      io.to(`user_${booking.passengerId.toString()}`).emit('passenger-joined', {
        carpoolId: booking._id,
        passengerId,
        passengerData: {
          _id: req.user.id,
          name: req.user.name,
          rating: req.user.rating || 4.8
        }
      });
    }

    res.json({
      success: true,
      booking,
      message: isSearching ? 'Joined carpool successfully' : 'Join request sent to driver'
    });
  } catch (error) {
    console.error('Join carpool error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Accept join request (Driver)
 */
exports.acceptJoinRequest = async (req, res) => {
  try {
    const { carpoolId, passengerId } = req.params;
    const booking = await Booking.findById(carpoolId);
    
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });
    
    const passenger = booking.carpool.passengers.find(p => p.user.toString() === passengerId);
    if (!passenger) return res.status(404).json({ error: 'Passenger request not found' });
    
    if (passenger.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });
    if (booking.carpool.seatsAvailable <= 0) return res.status(400).json({ error: 'No seats available' });
    
    passenger.status = 'accepted';
    booking.carpool.seatsAvailable -= 1;
    if (booking.carpool.seatsAvailable === 0) {
      booking.status = 'full';
    }
    
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${passengerId}`).emit('join-accepted', {
        carpoolId: booking._id
      });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reject join request (Driver)
 */
exports.rejectJoinRequest = async (req, res) => {
  try {
    const { carpoolId, passengerId } = req.params;
    const booking = await Booking.findById(carpoolId);
    
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });
    
    const passenger = booking.carpool.passengers.find(p => p.user.toString() === passengerId);
    if (!passenger) return res.status(404).json({ error: 'Passenger request not found' });
    
    passenger.status = 'rejected';
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${passengerId}`).emit('join-rejected', {
        carpoolId: booking._id
      });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Pickup passenger (Driver)
 */
exports.pickupPassenger = async (req, res) => {
  try {
    const { carpoolId, passengerId } = req.params;
    const booking = await Booking.findById(carpoolId);
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });
    
    const passenger = booking.carpool.passengers.find(p => p.user.toString() === passengerId);
    if (!passenger) return res.status(404).json({ error: 'Passenger not found' });
    
    passenger.status = 'picked_up';
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${passengerId}`).emit('passenger-picked-up', { carpoolId: booking._id });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Dropoff passenger (Driver)
 */
exports.dropoffPassenger = async (req, res) => {
  try {
    const { carpoolId, passengerId } = req.params;
    const booking = await Booking.findById(carpoolId);
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });
    
    const passenger = booking.carpool.passengers.find(p => p.user.toString() === passengerId);
    if (!passenger) return res.status(404).json({ error: 'Passenger not found' });
    
    passenger.status = 'dropped_off';
    
    const allDroppedOff = booking.carpool.passengers.every(p => 
      p.status === 'dropped_off' || p.status === 'pending' || p.status === 'rejected'
    );
    
    if (allDroppedOff) {
      booking.status = 'completed';
    }
    
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${passengerId}`).emit('carpool-completed', { carpoolId: booking._id, fare: booking.carpool.pricePerSeat });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Start carpool (Driver)
 */
exports.startCarpool = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const booking = await Booking.findById(carpoolId);
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });

    booking.status = 'in-progress';
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      booking.carpool.passengers.forEach(p => {
        if (p.status === 'accepted') {
          io.to(`user_${p.user.toString()}`).emit('carpool-started', { carpoolId: booking._id });
        }
      });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Complete carpool (Driver)
 */
exports.completeCarpool = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const booking = await Booking.findById(carpoolId);
    if (!booking) return res.status(404).json({ error: 'Carpool not found' });

    booking.status = 'completed';
    booking.carpool.passengers.forEach(p => {
      if (p.status === 'accepted') p.status = 'dropped_off';
    });
    await booking.save();
    
    const io = req.app.get('io');
    if (io) {
      booking.carpool.passengers.forEach(p => {
        if (p.status === 'dropped_off') {
          io.to(`user_${p.user.toString()}`).emit('carpool-completed', { carpoolId: booking._id, fare: booking.carpool.pricePerSeat });
        }
      });
    }
    
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Leave carpool (Passenger)
 */
exports.leaveCarpool = async (req, res) => {
  try {
    const { carpoolId } = req.params;
    const passengerId = req.user.id;

    const booking = await Booking.findById(carpoolId);
    if (!booking) {
      return res.status(404).json({ error: 'Carpool not found' });
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot leave this carpool' });
    }

    const passengerIndex = booking.carpool.passengers.findIndex(p => p.user.toString() === passengerId);
    if (passengerIndex === -1) {
      return res.status(400).json({ error: 'Not a member of this carpool' });
    }

    if (booking.carpool.passengers[passengerIndex].status === 'accepted') {
      booking.carpool.seatsAvailable += 1;
      if (booking.status === 'full') {
         booking.status = 'available';
      }
    }
    
    booking.carpool.passengers.splice(passengerIndex, 1);
    
    if (booking.carpool.passengers.length === 0 && booking.status === 'in-progress') {
      booking.status = 'completed';
    }
    await booking.save();

    res.json({
      success: true,
      booking,
      message: 'Successfully left carpool'
    });
  } catch (error) {
    console.error('Leave carpool error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get monthly pass details
 */
exports.getMonthlyPass = async (req, res) => {
  try {
    const { passId } = req.params;
    const userId = req.user.id;

    const pass = await Booking.findById(passId)
      .populate('passengerId', 'name phoneNumber')
      .populate('driverId', 'userId vehicleDetails');

    if (!pass) {
      return res.status(404).json({ error: 'Monthly pass not found' });
    }

    if (pass.passengerId._id.toString() !== userId && pass.driverId?.userId?._id.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      success: true,
      pass
    });
  } catch (error) {
    console.error('Get monthly pass error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Renew monthly pass
 */
exports.renewMonthlyPass = async (req, res) => {
  try {
    const { passId } = req.params;
    const userId = req.user.id;

    const pass = await Booking.findById(passId);
    if (!pass) {
      return res.status(404).json({ error: 'Monthly pass not found' });
    }

    if (pass.passengerId.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (pass.status !== 'active' && pass.status !== 'expired') {
      return res.status(400).json({ error: 'Pass cannot be renewed' });
    }

    pass.monthlyPass.startDate = new Date();
    pass.monthlyPass.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    pass.status = 'active';
    await pass.save();

    res.json({
      success: true,
      pass,
      message: 'Monthly pass renewed successfully'
    });
  } catch (error) {
    console.error('Renew monthly pass error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create pink pool booking
 */
exports.createPinkPoolBooking = async (req, res) => {
  try {
    const { pickup, dropoff, timeWindow } = req.body;
    const passengerId = req.user.id;

    // Verify passenger is female
    const passenger = await User.findById(passengerId);
    if (!passenger || passenger.gender !== 'female') {
      return res.status(403).json({ error: 'Pink Pool is for women only' });
    }

    // Find female drivers
    const femaleDrivers = await Driver.find({
      'availability.status': 'available',
      isOnline: true,
      status: 'approved',
      'vehicleDetails.type': { $in: ['car', 'economy', 'premium'] }
    }).populate('userId');

    // Filter female drivers
    const femaleDriverList = femaleDrivers.filter(driver => 
      driver.userId && driver.userId.gender === 'female'
    );

    const booking = new Booking({
      type: 'pink_pool',
      passengerId,
      pickup,
      dropoff,
      timeWindow,
      status: 'searching',
      pinkPool: {
        verified: true,
        emergencyContacts: passenger.emergencyContacts || [],
        safetyCheck: {
          verified: true,
          verifiedAt: new Date()
        }
      }
    });

    await booking.save();

    // Notify female drivers
    for (const driver of femaleDriverList) {
      await sendNotification(driver.userId._id, 'PINK_POOL_REQUEST', {
        bookingId: booking._id,
        pickup: pickup.address,
        dropoff: dropoff.address
      });
    }

    res.status(201).json({
      success: true,
      booking,
      message: 'Pink Pool request created'
    });
  } catch (error) {
    console.error('Create pink pool error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create family vault booking
 */
exports.createFamilyVaultBooking = async (req, res) => {
  try {
    const { childId, pickup, dropoff, schedule } = req.body;
    const parentId = req.user.id;

    // Verify parent relationship
    const child = await User.findById(childId);
    if (!child) {
      return res.status(404).json({ error: 'Child not found' });
    }

    if (!child.parentId || child.parentId.toString() !== parentId) {
      return res.status(403).json({ error: 'Unauthorized access to child' });
    }

    const booking = new Booking({
      type: 'family_vault',
      passengerId: childId,
      parentId,
      pickup,
      dropoff,
      schedule,
      status: 'active',
      familyVault: {
        childName: child.name,
        childPhone: child.phoneNumber,
        childId: childId,
        emergencyContacts: child.emergencyContacts || [],
        tracking: {
          enabled: true,
          startTime: schedule.startTime,
          endTime: schedule.endTime
        },
        whatsappNotifications: {
          enabled: true,
          phoneNumber: parentId.phoneNumber
        },
        cameraAccess: {
          enabled: false,
          allowed: false
        }
      }
    });

    await booking.save();

    // Assign trusted driver
    const driver = await findTrustedDriver(pickup, dropoff);
    if (driver) {
      booking.driverId = driver._id;
      await booking.save();
      
      await sendNotification(driver.userId, 'FAMILY_VAULT_ASSIGNED', {
        bookingId: booking._id,
        childName: child.name,
        pickup: pickup.address,
        dropoff: dropoff.address
      });
    }

    // Notify parent
    await sendNotification(parentId, 'FAMILY_VAULT_CREATED', {
      bookingId: booking._id,
      childName: child.name
    });

    res.status(201).json({
      success: true,
      booking,
      message: 'Family Vault booking created successfully'
    });
  } catch (error) {
    console.error('Create family vault error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get family vault trips
 */
exports.getFamilyVaultTrips = async (req, res) => {
  try {
    const parentId = req.user.id;

    const bookings = await Booking.find({
      parentId: parentId,
      type: 'family_vault'
    })
    .populate('passengerId', 'name phoneNumber')
    .populate('driverId', 'userId vehicleDetails')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      bookings: bookings || []
    });
  } catch (error) {
    console.error('Get family vault trips error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Track family vault child
 */
exports.trackChild = async (req, res) => {
  try {
    const { childId } = req.params;
    const parentId = req.user.id;

    const booking = await Booking.findOne({
      'familyVault.childId': childId,
      parentId: parentId,
      status: { $in: ['active', 'started'] }
    });

    if (!booking) {
      return res.status(404).json({ error: 'No active trip found for this child' });
    }

    // Get real-time location from driver
    let location = null;
    if (booking.driverId) {
      const driver = await Driver.findById(booking.driverId);
      if (driver && driver.location) {
        location = driver.location;
      }
    }

    res.json({
      success: true,
      child: {
        id: childId,
        name: booking.familyVault.childName
      },
      booking: {
        id: booking._id,
        status: booking.status,
        pickup: booking.pickup,
        dropoff: booking.dropoff,
        estimatedArrival: booking.estimatedArrival
      },
      location: location || null
    });
  } catch (error) {
    console.error('Track child error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper functions (to be implemented or imported)

/**
 * Find regular driver for a route
 */
const findRegularDriver = async (pickup, dropoff, schedule) => {
  try {
    // In production, this would find a driver who frequently takes this route
    // For now, return null
    return null;
  } catch (error) {
    console.error('Find regular driver error:', error);
    return null;
  }
};

/**
 * Find trusted driver for family vault
 */
const findTrustedDriver = async (pickup, dropoff) => {
  try {
    // In production, this would find a verified and trusted driver
    // For now, return null
    return null;
  } catch (error) {
    console.error('Find trusted driver error:', error);
    return null;
  }
};