const Ride = require('../models/Ride');
const User = require('../models/User');
const Driver = require('../models/Driver');
const { calculateDistance, findNearbyDrivers } = require('../services/mapService');
const { sendNotification } = require('../services/notificationService');
const pricingEngine = require('../services/pricingEngine');

/**
 * Create a new ride
 */
exports.createRide = async (req, res) => {
  try {
    const { pickup, dropoff, waypoints, vehicleType, fare, type, carpool, parcel, scheduledTime, guest } = req.body;
    const passengerId = req.user.id;

    // Validate passenger
    const passenger = await User.findById(passengerId);
    if (!passenger || !passenger.isActive) {
      return res.status(400).json({ error: 'Invalid passenger' });
    }

    // Calculate distance and duration
    const distance = await calculateDistance(pickup.location, dropoff.location);
    
    // Calculate AI fare if not offered
    let finalFare = fare;
    if (!fare || fare.type === 'ai') {
      const engineInput = {
        vehicle: vehicleType || 'car',
        city: 'Karachi', // Extract from pickup address normally
        pickup: { lat: pickup.location.coordinates[1], lng: pickup.location.coordinates[0] },
        dropoff: { lat: dropoff.location.coordinates[1], lng: dropoff.location.coordinates[0] },
        stops: waypoints ? waypoints.map(w => ({ lat: w.location.coordinates[1], lng: w.location.coordinates[0] })) : [],
        isIntercity: type === 'intercity',
        isCarpool: !!carpool,
        passengers: carpool?.seats || 1,
        driversAvailable: 5, // mock or get actual
        hour: new Date().getHours()
      };
      
      const newFare = await pricingEngine.calculateFare(engineInput);
      
      finalFare = {
        offered: null,
        accepted: newFare.fare,
        type: 'ai'
      };
    }

    // Create ride
    const ride = new Ride({
      passengerId,
      type: type || 'solo',
      pickup,
      dropoff,
      vehicleType,
      waypoints: waypoints || [],
      fare: {
        offered: fare?.offered || null,
        accepted: finalFare.accepted || finalFare.offered,
        type: fare?.type || 'ai'
      },
      carpool: carpool || null,
      parcel: parcel || null,
      scheduledTime: scheduledTime || null,
      guest: guest || undefined,
      status: type === 'intercity' ? 'scheduled' : 'searching'
    });

    await ride.save();

    // Find nearby drivers
    const nearbyDrivers = await findNearbyDrivers(pickup.location, vehicleType);
    console.log(`[createRide] Found ${nearbyDrivers.length} nearby online drivers matching vehicleType ${vehicleType}`);
    
    // Send ride request to nearby drivers
    for (const driver of nearbyDrivers) {
      await sendNotification(driver.userId, 'NEW_RIDE_REQUEST', {
        rideId: ride._id,
        pickup: ride.pickup.address,
        dropoff: ride.dropoff.address,
        waypoints: ride.waypoints.map(w => w.address),
        fare: finalFare.accepted || finalFare.offered,
        distance: distance.distance,
        duration: distance.duration
      });
    }

    // Emit socket event to drivers globally so they see the request without manual refresh
    req.app.get('io').emit('new-ride-request', ride);

    if (nearbyDrivers && nearbyDrivers.length > 0) {
      const driversPayload = nearbyDrivers.map(d => ({
        _id: d._id,
        location: { coordinates: d.location.coordinates }
      }));
      req.app.get('io').to(`ride-${ride._id.toString()}`).emit('nearby-drivers', {
        drivers: driversPayload
      });
    }

    res.status(201).json({
      success: true,
      ride,
      message: 'Ride created successfully'
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Calculate fare for a ride
 */
exports.calculateFare = async (req, res) => {
  try {
    const { pickup, dropoff, waypoints, vehicleType, seats, type } = req.body;

    const engineInput = {
      vehicle: vehicleType || 'car',
      city: 'Karachi', 
      pickup: pickup.coordinates ? { lat: pickup.coordinates[1], lng: pickup.coordinates[0] } : pickup,
      dropoff: dropoff.coordinates ? { lat: dropoff.coordinates[1], lng: dropoff.coordinates[0] } : dropoff,
      stops: waypoints ? waypoints.map(w => w.coordinates ? { lat: w.coordinates[1], lng: w.coordinates[0] } : w) : [],
      isIntercity: type === 'intercity',
      isCarpool: seats && seats > 1,
      passengers: seats || 1,
      driversAvailable: 5,
      hour: new Date().getHours()
    };

    const newFare = await pricingEngine.calculateFare(engineInput);

    res.json({
      success: true,
      fare: {
        total: newFare.fare,
        commission: newFare.platformCommission,
        ...newFare
      }
    });
  } catch (error) {
    console.error('Calculate fare error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get ride details
 */
exports.getRideDetails = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const ride = await Ride.findById(rideId)
      .populate('passengerId', 'name phoneNumber profilePhoto rating')
      .populate('driverId', 'userId vehicleDetails stats rating')
      .populate('driverId.userId', 'name phoneNumber profilePhoto');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Check authorization
    const isPassenger = ride.passengerId._id.toString() === userId;
    const isDriver = ride.driverId?.userId?._id?.toString() === userId;
    
    if (!isPassenger && !isDriver) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      success: true,
      ride
    });
  } catch (error) {
    console.error('Get ride details error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Accept ride (driver)
 */
exports.acceptRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'searching' && ride.status !== 'scheduled') {
      return res.status(400).json({ error: 'Ride is no longer available' });
    }

    // Check if driver is available
    const driver = await Driver.findOne({ userId: driverId }).populate('userId', 'name phoneNumber');
    if (!driver) {
      return res.status(400).json({ error: 'Driver not found' });
    }
    if (driver.availability.status !== 'available') {
      return res.status(400).json({ error: `Driver not available (Status: ${driver.availability.status})` });
    }

    // Update ride
    ride.driverId = driver._id;
    ride.status = 'accepted';
    await ride.save();

    // Update driver
    driver.currentRide = ride._id;
    driver.availability.status = 'busy';
    await driver.save();

    // Notify passenger
    await sendNotification(ride.passengerId, 'RIDE_ACCEPTED', {
      rideId: ride._id,
      driver: {
        name: driver.userId.name,
        rating: driver.stats.rating,
        vehicle: driver.vehicleDetails
      }
    });

    console.log(`Server: "Emitting ride-accepted to room ride-${ride._id.toString()}"`);
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('ride-accepted', {
      ride,
      driver: {
        name: driver.userId?.name || 'Your Driver',
        phone: driver.userId?.phoneNumber,
        rating: driver.stats?.rating,
        vehicle: driver.vehicleDetails,
        location: driver.location
      }
    });

    res.json({
      success: true,
      ride,
      message: 'Ride accepted successfully'
    });
  } catch (error) {
    console.error('Accept ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Counter offer (driver)
 */
exports.counterOffer = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { amount } = req.body;
    const driverId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid counter offer amount' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'searching' && ride.status !== 'scheduled') {
      return res.status(400).json({ error: 'Ride is no longer available' });
    }

    // Find driver by userId
    const driver = await Driver.findOne({ userId: driverId }).populate('userId', 'name');
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    if (driver.availability.status !== 'available') {
      return res.status(400).json({ error: `Cannot send offer (Driver status: ${driver.availability.status})` });
    }

    // Check if driver already bid
    const existingBidIndex = ride.bids.findIndex(b => b.driverId.toString() === driver._id.toString());
    if (existingBidIndex >= 0) {
      ride.bids[existingBidIndex].fare = amount;
      ride.bids[existingBidIndex].timestamp = new Date();
    } else {
      ride.bids.push({
        driverId: driver._id,
        fare: amount,
        status: 'pending'
      });
    }

    await ride.save();

    console.log(`Server: "Emitting counter-offer-received to room ride-${ride._id.toString()}"`);
    
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('counter-offer-received', {
      rideId: ride._id,
      amount: amount,
      driver: {
        id: driver.userId._id, // User ID of driver
        driverId: driver._id,  // Driver Profile ID
        name: driver.userId?.name || 'Driver',
        rating: driver.stats?.rating || 0,
        vehicle: driver.vehicleDetails,
        location: driver.location
      }
    });

    res.json({
      success: true,
      ride,
      message: 'Bid sent successfully'
    });
  } catch (error) {
    console.error('Counter offer error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Accept counter offer (passenger)
 */
exports.acceptCounterOffer = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { driverId, amount } = req.body;
    const passengerId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.passengerId.toString() !== passengerId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (ride.status !== 'searching' && ride.status !== 'scheduled') {
      return res.status(400).json({ error: 'Ride is no longer available' });
    }

    // Find driver by userId or _id (depending on what was passed from the frontend)
    const driver = await Driver.findOne({
      $or: [
        { 'userId': driverId },
        { '_id': driverId }
      ]
    });
    if (!driver) {
      return res.status(400).json({ error: 'Driver profile not found' });
    }
    if (driver.availability.status !== 'available') {
      return res.status(400).json({ error: `Driver is no longer available (Status: ${driver.availability.status})` });
    }

    // Update ride bids
    ride.bids.forEach(bid => {
      if (bid.driverId.toString() === driver._id.toString()) {
        bid.status = 'accepted';
      } else {
        bid.status = 'rejected';
      }
    });

    // Update ride
    ride.driverId = driver._id;
    ride.status = 'accepted';
    ride.fare.accepted = amount;
    await ride.save();

    await ride.populate('passengerId', 'name phoneNumber stats rating profilePhoto');
    await ride.populate('driverId');

    // Update driver
    driver.currentRide = ride._id;
    driver.availability.status = 'busy';
    await driver.save();

    console.log("ACCEPT BID - rideId:", rideId);
    console.log("ACCEPT BID - winning driverId:", driver._id);
    console.log("ACCEPT BID - emitting bid-accepted to room:", "ride-" + ride._id.toString());

    // Emit 'bid-accepted' to the winning driver's personal room
    console.log(`Server: "Emitting bid-accepted to room user-${driver.userId.toString()}"`);
    req.app.get('io').to(`user-${driver.userId.toString()}`).emit('bid-accepted', {
      rideId: ride._id,
      ride: ride
    });

    // Emit 'ride-taken' to the ride room for other drivers
    console.log(`Server: "Emitting ride-taken to room ride-${ride._id.toString()}"`);
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('ride-taken', {
      rideId: ride._id
    });
    
    // Also emit to the ride room so the passenger UI updates
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('ride-accepted', {
      ride,
      driver: {
        name: driver.userId?.name || 'Your Driver',
        rating: driver.stats?.rating,
        vehicle: driver.vehicleDetails,
        location: driver.location
      }
    });

    res.json({
      success: true,
      ride,
      message: 'Counter offer accepted successfully'
    });
  } catch (error) {
    console.error('Accept counter offer error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Start ride (driver)
 */
exports.startRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const driverId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'accepted') {
      return res.status(400).json({ error: 'Ride not in accepted state' });
    }

    ride.status = 'started';
    ride.tracking.startedAt = new Date();
    await ride.save();

    // Notify passenger
    await sendNotification(ride.passengerId, 'RIDE_STARTED', {
      rideId: ride._id
    });

    res.json({
      success: true,
      ride,
      message: 'Ride started successfully'
    });
  } catch (error) {
    console.error('Start ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Complete ride (driver)
 */
exports.completeRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const paymentMethod = req.body?.paymentMethod || 'cash';
    const driverId = req.user.id;

    const ride = await Ride.findById(rideId).populate('driverId').populate('passengerId');
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status !== 'started') {
      return res.status(400).json({ error: 'Ride not in started state' });
    }

    // Calculate final fare safely
    const finalFare = ride.fare?.counter || ride.fare?.accepted || ride.fare?.offered || 0;

    // Update ride
    ride.status = 'completed';
    ride.tracking = ride.tracking || {};
    ride.tracking.completedAt = new Date();
    ride.shareToken = undefined;
    
    ride.payment = ride.payment || {};
    ride.payment.method = paymentMethod;
    ride.payment.status = 'pending';
    ride.payment.amount = finalFare;
    
    // Clear chat and voice recordings
    ride.chat = [];
    
    await ride.save();

    // Update driver stats
    if (ride.driverId) {
      const driver = await Driver.findById(ride.driverId._id || ride.driverId);
      if (driver) {
        driver.stats.totalRides += 1;
        driver.stats.totalEarnings += finalFare;
        driver.currentRide = null;
        driver.availability.status = 'available';
        await driver.save();
      }
    }

    // End any active calls for this ride
    try {
      const CallSession = require('../models/CallSession');
      await CallSession.updateMany(
        { rideId: ride._id, status: { $in: ['ringing', 'in_progress'] } },
        { 
          $set: { 
            status: 'completed', 
            endedAt: new Date(), 
            endReason: 'ride_ended' 
          }
        }
      );
      
      // Also emit call:end to clear any active ringing on clients
      req.app.get('io').to(`ride-${ride._id.toString()}`).emit('call:end', {
        rideId: ride._id,
        reason: 'ride_ended'
      });
    } catch (callErr) {
      console.error('Error ending calls on ride completion:', callErr);
    }

    // Emit socket event to the ride room
    console.log(`Server: "Ride ${ride._id.toString()} completed successfully, fare: Rs. ${finalFare}"`);
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('ride-completed', {
      rideId: ride._id,
      fare: finalFare,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      ride: ride
    });

    // Notify passenger
    const passengerObjectId = ride.passengerId?._id || ride.passengerId;
    await sendNotification(passengerObjectId, 'RIDE_COMPLETED', {
      rideId: ride._id,
      fare: finalFare
    });

    res.json({
      success: true,
      ride,
      message: 'Ride completed successfully'
    });
  } catch (error) {
    console.error('Complete ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel ride
 */
exports.cancelRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.status === 'completed') {
      return res.status(400).json({ error: 'Ride already completed' });
    }

    ride.status = 'cancelled';
    ride.cancelledBy = userId;
    ride.cancelledAt = new Date();
    ride.shareToken = undefined;
    
    // Clear chat and voice recordings
    ride.chat = [];
    
    await ride.save();

    // Update driver if assigned
    if (ride.driverId) {
      const driver = await Driver.findById(ride.driverId);
      if (driver) {
        driver.currentRide = null;
        driver.availability.status = 'available';
        await driver.save();
      }
    }

    // Notify other party
    if (ride.driverId) {
      await sendNotification(ride.driverId, 'RIDE_CANCELLED', {
        rideId: ride._id,
        message: 'Ride has been cancelled'
      });
    }
    await sendNotification(ride.passengerId, 'RIDE_CANCELLED', {
      rideId: ride._id,
      message: 'Ride has been cancelled'
    });

    // End any active calls for this ride
    try {
      const CallSession = require('../models/CallSession');
      await CallSession.updateMany(
        { rideId: ride._id, status: { $in: ['ringing', 'in_progress'] } },
        { 
          $set: { 
            status: 'completed', 
            endedAt: new Date(), 
            endReason: 'ride_ended' 
          }
        }
      );
      
      req.app.get('io').to(`ride-${ride._id.toString()}`).emit('call:end', {
        rideId: ride._id,
        reason: 'ride_ended'
      });
    } catch (callErr) {
      console.error('Error ending calls on ride cancellation:', callErr);
    }

    // Emit socket event to the ride room so clients navigate away immediately
    req.app.get('io').to(`ride-${ride._id.toString()}`).emit('ride-cancelled', {
      rideId: ride._id,
      cancelledBy: userId
    });

    res.json({
      success: true,
      message: 'Ride cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update driver location
 */
exports.updateDriverLocation = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { location } = req.body;

    if (!location || !location.coordinates) {
      return res.status(400).json({ error: 'Location data required' });
    }

    const driver = await Driver.findOne({ userId: driverId });
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.location = {
      type: 'Point',
      coordinates: location.coordinates
    };
    driver.availability.lastUpdated = new Date();
    await driver.save();

    // Emit socket event for live tracking
    if (driver.currentRide) {
      const ride = await Ride.findById(driver.currentRide);
      if (ride) {
        // Socket emission will be handled by the socket server
        req.app.get('io').to(`ride-${ride._id.toString()}`).emit('driver-location', {
          rideId: ride._id,
          location: driver.location
        });
      }
    } else if (driver.availability.status === 'available') {
      // Driver is available, check for nearby searching rides to update their maps
      const searchingRides = await Ride.find({
        status: 'searching',
        'pickup.location': {
          $near: {
            $geometry: driver.location,
            $maxDistance: 10000 // 10km radius
          }
        },
        vehicleType: driver.vehicleDetails?.type || { $exists: true }
      });

      for (const ride of searchingRides) {
        const nearbyDrivers = await findNearbyDrivers(ride.pickup.location, ride.vehicleType);
        const driversPayload = nearbyDrivers.map(d => ({
          _id: d._id,
          location: { coordinates: d.location.coordinates }
        }));
        
        req.app.get('io').to(`ride-${ride._id.toString()}`).emit('nearby-drivers', {
          drivers: driversPayload
        });
      }
    }

    res.json({
      success: true,
      message: 'Location updated'
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get ride history
 */
exports.getRideHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, type, status } = req.query;

    // Check if the user has a driver profile
    const driver = await Driver.findOne({ userId });

    const query = {
      $or: [
        { passengerId: userId },
        ...(driver ? [{ driverId: driver._id }] : [])
      ]
    };

    if (type) query.type = type;
    if (status) query.status = status;

    const rides = await Ride.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('passengerId', 'name phoneNumber profilePhoto')
      .populate('driverId', 'userId vehicleDetails')
      .populate('driverId.userId', 'name phoneNumber');

    const total = await Ride.countDocuments(query);

    res.json({
      success: true,
      rides,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get ride history error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get active rides
 */
exports.getActiveRides = async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if the user has a driver profile
    const driver = await Driver.findOne({ userId });
    
    // Filter out stale/ghost rides older than 12 hours (except scheduled intercity rides)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

    const activeRides = await Ride.find({
      $and: [
        {
          $or: [
            { passengerId: userId },
            ...(driver ? [{ driverId: driver._id }] : [])
          ]
        },
        {
          status: { $in: ['searching', 'scheduled', 'accepted', 'started'] }
        },
        {
          $or: [
            { status: 'scheduled' },
            { createdAt: { $gte: twelveHoursAgo } }
          ]
        }
      ]
    })
    .populate('passengerId', 'name phoneNumber')
    .populate('driverId', 'userId vehicleDetails')
    .populate('driverId.userId', 'name phoneNumber');

    res.json({
      success: true,
      rides: activeRides
    });
  } catch (error) {
    console.error('Get active rides error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Rate driver
 */
exports.rateDriver = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.passengerId.toString() !== userId) {
      return res.status(403).json({ error: 'Only passenger can rate driver' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Ride must be completed to rate' });
    }

    ride.ratings.passengerRating = {
      rating,
      comment: comment || '',
      createdAt: new Date()
    };
    await ride.save();

    // Update driver rating
    if (ride.driverId) {
      const driver = await Driver.findById(ride.driverId);
      if (driver) {
        const totalRatings = driver.stats.totalRatings || 0;
        const currentRating = driver.stats.rating || 0;
        const newRating = ((currentRating * totalRatings) + rating) / (totalRatings + 1);
        driver.stats.rating = Math.round(newRating * 10) / 10;
        driver.stats.totalRatings = totalRatings + 1;
        await driver.save();
      }
    }

    res.json({
      success: true,
      message: 'Driver rated successfully'
    });
  } catch (error) {
    console.error('Rate driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Rate passenger
 */
exports.ratePassenger = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    const driver = await Driver.findOne({ userId });
    if (!driver || ride.driverId.toString() !== driver._id.toString()) {
      return res.status(403).json({ error: 'Only driver can rate passenger' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Ride must be completed to rate' });
    }

    ride.ratings.driverRating = {
      rating,
      comment: comment || '',
      createdAt: new Date()
    };
    await ride.save();

    res.json({
      success: true,
      message: 'Passenger rated successfully'
    });
  } catch (error) {
    console.error('Rate passenger error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Send chat message
 */
exports.sendChatMessage = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { message, type } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Check if user is part of the ride
    let isAuthorized = false;
    
    // Check passenger match
    if (ride.passengerId.toString() === userId) {
      isAuthorized = true;
    } else if (ride.driverId) {
      // For driver match, we need to find the driver document associated with this userId
      const Driver = require('../models/Driver');
      const driverDoc = await Driver.findOne({ userId });
      if (driverDoc && ride.driverId.toString() === driverDoc._id.toString()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const chatMessage = {
      senderId: userId,
      message,
      type: type || 'text',
      timestamp: new Date()
    };

    ride.chat.push(chatMessage);
    await ride.save();

    // Emit socket event
    req.app.get('io').to(`ride-${rideId}`).emit('new-message', chatMessage);

    res.json({
      success: true,
      message: 'Message sent successfully',
      chat: chatMessage
    });
  } catch (error) {
    console.error('Send chat message error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get chat messages
 */
exports.getChatMessages = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Check if user is part of the ride
    let isAuthorized = false;
    
    // Check passenger match
    if (ride.passengerId.toString() === userId) {
      isAuthorized = true;
    } else if (ride.driverId) {
      // For driver match, we need to find the driver document associated with this userId
      const Driver = require('../models/Driver');
      const driverDoc = await Driver.findOne({ userId });
      if (driverDoc && ride.driverId.toString() === driverDoc._id.toString()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json({
      success: true,
      messages: ride.chat || []
    });
  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Trigger SOS alert
 */
exports.triggerSOS = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const ride = await Ride.findById(rideId)
      .populate('passengerId')
      .populate('driverId');

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Update ride with SOS status
    ride.emergency = {
      sos: {
        triggered: true,
        triggeredAt: new Date(),
        contacts: ride.passengerId?.emergencyContacts || []
      }
    };
    await ride.save();

    // Get emergency contacts
    const contacts = ride.passengerId?.emergencyContacts || [];
    const location = ride.pickup?.address || 'Unknown location';

    // Notify emergency contacts
    for (const contact of contacts) {
      await sendNotification(contact.phoneNumber, 'SOS_ALERT', {
        message: `Emergency alert! ${ride.passengerId?.name} needs immediate help. Location: ${location}`,
        location
      });
    }

    // Notify driver
    if (ride.driverId) {
      await sendNotification(ride.driverId.userId, 'SOS_ALERT', {
        message: `Emergency alert! Please check on your passenger immediately.`,
        location
      });
    }

    // Notify admin
    await sendNotification('admin', 'SOS_ALERT', {
      message: `SOS Alert triggered! User: ${ride.passengerId?.name}, Ride: ${rideId}`,
      location
    });

    // Emit socket event
    req.app.get('io').to(`ride-${rideId}`).emit('sos-triggered', {
      rideId: ride._id,
      location
    });

    res.json({
      success: true,
      message: 'SOS alert triggered successfully'
    });
  } catch (error) {
    console.error('SOS alert error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Share trip with contacts
 */
exports.shareTrip = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { contacts } = req.body;
    const userId = req.user.id;

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ error: 'Contacts are required' });
    }

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    // Check if user is part of the ride
    if (ride.passengerId.toString() !== userId && 
        ride.driverId?.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Create share link (in production, generate a unique link)
    const shareLink = `https://raftar.com/trip/${rideId}`;
    const location = ride.pickup?.address || 'Unknown location';
    const destination = ride.dropoff?.address || 'Unknown destination';

    // Send share notifications
    for (const contact of contacts) {
      await sendNotification(contact.phoneNumber, 'TRIP_SHARED', {
        message: `${ride.passengerId?.name} is sharing their trip with you. From: ${location} To: ${destination}`,
        link: shareLink
      });
    }

    res.json({
      success: true,
      shareLink,
      message: 'Trip shared successfully'
    });
  } catch (error) {
    console.error('Share trip error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate share token
 */
exports.generateShareToken = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = req.user.id;

    const ride = await Ride.findById(rideId);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.passengerId.toString() !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot share a completed or cancelled ride' });
    }

    if (!ride.shareToken) {
      const crypto = require('crypto');
      ride.shareToken = crypto.randomBytes(16).toString('hex');
      await ride.save();
    }

    const shareUrl = `raftar://share/${ride.shareToken}`;

    res.json({
      success: true,
      shareToken: ride.shareToken,
      shareUrl
    });
  } catch (error) {
    console.error('Generate share token error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get shared ride details
 */
exports.getSharedRideDetails = async (req, res) => {
  try {
    const { token } = req.params;

    const ride = await Ride.findOne({ shareToken: token })
      .populate('driverId', 'userId vehicleDetails stats rating')
      .populate('driverId.userId', 'name profilePhoto');

    if (!ride) {
      return res.status(404).json({ error: 'Shared ride not found or link has expired' });
    }

    if (ride.status === 'completed' || ride.status === 'cancelled') {
      return res.status(410).json({ error: 'Ride has ended' });
    }

    // Strip out passenger PII and chat
    const sanitizedRide = {
      _id: ride._id,
      status: ride.status,
      type: ride.type,
      pickup: ride.pickup,
      dropoff: ride.dropoff,
      fare: ride.fare,
      driver: ride.driverId ? {
        name: ride.driverId.userId?.name,
        profilePhoto: ride.driverId.userId?.profilePhoto,
        rating: ride.driverId.stats?.rating,
        vehicleDetails: ride.driverId.vehicleDetails
      } : null
    };

    res.json({
      success: true,
      ride: sanitizedRide
    });
  } catch (error) {
    console.error('Get shared ride error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Redirect for Deep Links
 */
exports.redirectDeepLink = (req, res) => {
  const targetUrl = req.query.to;
  if (!targetUrl) {
    return res.status(400).send('Invalid redirect link');
  }
  res.send(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="0; url=${targetUrl}" />
        <title>Redirecting to Raftar...</title>
        <script>
          setTimeout(() => {
            window.location.href = "${targetUrl}";
          }, 100);
        </script>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff; }
          a { color: #4ECDC4; text-decoration: none; padding: 10px 20px; border: 1px solid #4ECDC4; border-radius: 5px; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <h2>Opening Raftar...</h2>
        <p>If the app does not open automatically, click the button below.</p>
        <a href="${targetUrl}">Open App</a>
      </body>
    </html>
  `);
};