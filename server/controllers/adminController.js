const User = require('../models/User');
const Driver = require('../models/Driver');
const Ride = require('../models/Ride');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { sendNotification } = require('../services/notificationService');

/**
 * Get dashboard stats
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(today);
    monthStart.setDate(1);

    const [
      totalUsers,
      totalDrivers,
      activeDrivers,
      todayRides,
      totalRides,
      totalRatingAgg,
      totalEarnings,
      pendingDrivers,
      activeRides
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Driver.countDocuments({ status: 'approved' }),
      Driver.countDocuments({ isOnline: true, 'availability.status': 'available' }),
      Ride.countDocuments({ 
        status: 'completed',
        'tracking.completedAt': { $gte: today }
      }),
      Ride.countDocuments(),
      User.aggregate([
        { $match: { 'stats.rating': { $gt: 0 } } },
        { $group: { _id: null, avgRating: { $avg: '$stats.rating' } } }
      ]),
      Ride.aggregate([
        {
          $match: { status: 'completed' }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$fare.final' }
          }
        }
      ]),
      Driver.countDocuments({ status: 'pending' }),
      Ride.countDocuments({ 
        status: { $in: ['searching', 'accepted', 'started'] }
      })
    ]);

    const averageRating = totalRatingAgg[0]?.avgRating || 0;

    // Get revenue breakdown
    const revenueByType = await Ride.aggregate([
      {
        $match: { 
          status: 'completed',
          'tracking.completedAt': { $gte: monthStart }
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$fare.final' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get ride statistics by hour for heatmap
    const ridesByHour = await Ride.aggregate([
      {
        $match: {
          status: 'completed',
          'tracking.completedAt': { $gte: monthStart }
        }
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$tracking.completedAt' },
            day: { $dayOfWeek: '$tracking.completedAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1, '_id.hour': 1 } }
    ]);

    const stats = {
      users: {
        total: totalUsers,
        newToday: 0,
        active: totalUsers
      },
      drivers: {
        total: totalDrivers,
        active: activeDrivers,
        pending: pendingDrivers
      },
      rides: {
        total: totalRides,
        today: todayRides,
        active: activeRides
      },
      revenue: {
        total: totalEarnings[0]?.total || 0,
        byType: revenueByType,
        monthly: 0
      },
      averageRating: Number(averageRating.toFixed(1)),
      heatmap: ridesByHour,
      growth: {
        users: '+12%',
        drivers: '+8%',
        rides: '+15%',
        revenue: '+22%'
      }
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get users list
 */
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, status } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (role) query.role = role;
    if (status) query.isActive = status === 'active';

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password');

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user details
 */
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .populate('emergencyContacts');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user stats
    const rideCount = await Ride.countDocuments({ passengerId: userId });
    const totalSpent = await Ride.aggregate([
      {
        $match: { passengerId: userId, status: 'completed' }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$fare.final' }
        }
      }
    ]);

    res.json({
      success: true,
      user,
      stats: {
        rideCount,
        totalSpent: totalSpent[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Get user details error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Block user
 */
exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Unblock user
 */
exports.unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Verify user
 */
exports.verifyUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndUpdate(
      userId,
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'User verified successfully'
    });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete user
 */
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also delete associated driver profile if exists
    await Driver.findOneAndDelete({ userId });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get drivers list
 */
exports.getDrivers = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;

    const query = {};
    if (status && status !== 'all') query.status = status;
    if (req.query.vehicleType && req.query.vehicleType !== 'all') query['vehicleDetails.type'] = req.query.vehicleType;
    if (search) {
      const userIds = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { phoneNumber: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      query.userId = { $in: userIds.map(u => u._id) };
    }

    console.log(`Executing Driver.find with query:`, query);

    const drivers = await Driver.find(query)
      .populate('userId', 'name phoneNumber email profilePhoto')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Driver.countDocuments(query);

    if (query.status === 'pending') {
      console.log(`Fetched ${drivers.length} drivers with status pending`);
    }

    res.json({
      success: true,
      drivers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('Get drivers error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get driver details
 */
exports.getDriverDetails = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId)
      .populate('userId', 'name phoneNumber email profilePhoto')
      .populate('currentRide')
      .populate('currentParcel');

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    res.json({
      success: true,
      driver
    });
  } catch (error) {
    console.error('Get driver details error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Approve driver
 */
exports.approveDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const adminId = req.user.id;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.status = 'approved';
    driver.approval = {
      isApproved: true,
      approvedBy: adminId,
      approvedAt: new Date()
    };
    await driver.save();

    // Update user role
    await User.findByIdAndUpdate(driver.userId, { role: 'driver' });

    // Notify driver
    await sendNotification(driver.userId, 'DRIVER_APPROVED', {
      message: 'Your driver application has been approved'
    });

    res.json({
      success: true,
      message: 'Driver approved successfully'
    });
  } catch (error) {
    console.error('Approve driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reject driver
 */
exports.rejectDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { reason } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.status = 'rejected';
    driver.approval = {
      isApproved: false,
      rejectionReason: reason || 'Application rejected'
    };
    await driver.save();

    // Notify driver
    await sendNotification(driver.userId, 'DRIVER_REJECTED', {
      message: 'Your driver application has been rejected',
      reason: reason
    });

    res.json({
      success: true,
      message: 'Driver rejected successfully'
    });
  } catch (error) {
    console.error('Reject driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Suspend driver
 */
exports.suspendDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { reason } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.status = 'suspended';
    driver.approval = {
      isApproved: false,
      rejectionReason: reason || 'Driver suspended'
    };
    await driver.save();

    res.json({
      success: true,
      message: 'Driver suspended successfully'
    });
  } catch (error) {
    console.error('Suspend driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Activate driver
 */
exports.activateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    driver.status = 'approved';
    driver.approval = {
      isApproved: true,
      approvedAt: new Date()
    };
    await driver.save();

    res.json({
      success: true,
      message: 'Driver activated successfully'
    });
  } catch (error) {
    console.error('Activate driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete driver
 */
exports.deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;

    const driver = await Driver.findByIdAndDelete(driverId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    // Revert user role
    await User.findByIdAndUpdate(driver.userId, { role: 'passenger' });

    res.json({
      success: true,
      message: 'Driver deleted successfully'
    });
  } catch (error) {
    console.error('Delete driver error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get trips
 */
exports.getTrips = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, dateFrom, dateTo } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const rides = await Ride.find(query)
      .populate('passengerId', 'name phoneNumber')
      .populate('driverId', 'vehicleDetails')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

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
    console.error('Get trips error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get trip details
 */
exports.getTripDetails = async (req, res) => {
  try {
    const { tripId } = req.params;

    const ride = await Ride.findById(tripId)
      .populate('passengerId', 'name phoneNumber email')
      .populate('driverId', 'userId vehicleDetails')
      .populate('driverId.userId', 'name phoneNumber');

    if (!ride) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({
      success: true,
      ride
    });
  } catch (error) {
    console.error('Get trip details error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Cancel trip (admin)
 */
exports.cancelTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { reason } = req.body;

    const ride = await Ride.findById(tripId);
    if (!ride) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    ride.status = 'cancelled';
    ride.cancelledBy = req.user.id;
    ride.cancelledAt = new Date();
    ride.metadata = ride.metadata || {};
    ride.metadata.set('adminCancelReason', reason || 'Cancelled by admin');
    await ride.save();

    // Notify passenger and driver
    await sendNotification(ride.passengerId, 'RIDE_CANCELLED', {
      rideId: ride._id,
      reason: 'Trip cancelled by admin'
    });

    if (ride.driverId) {
      await sendNotification(ride.driverId, 'RIDE_CANCELLED', {
        rideId: ride._id,
        reason: 'Trip cancelled by admin'
      });
    }

    res.json({
      success: true,
      message: 'Trip cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel trip error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Refund trip
 */
exports.refundTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { amount, reason } = req.body;

    const ride = await Ride.findById(tripId);
    if (!ride) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Create refund payment
    const refund = new Payment({
      userId: ride.passengerId,
      rideId: ride._id,
      amount: amount || ride.fare?.final || 0,
      type: 'refund',
      paymentMethod: 'wallet',
      status: 'completed',
      metadata: {
        reason: reason || 'Trip refund',
        adminId: req.user.id
      }
    });
    await refund.save();

    // Update ride
    ride.payment.status = 'refunded';
    await ride.save();

    // Update user wallet
    await User.findByIdAndUpdate(ride.passengerId, {
      $inc: { 'wallet.balance': refund.amount }
    });

    res.json({
      success: true,
      refund,
      message: 'Trip refunded successfully'
    });
  } catch (error) {
    console.error('Refund trip error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get payments
 */
exports.getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type, dateFrom, dateTo } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const payments = await Payment.find(query)
      .populate('userId', 'name phoneNumber')
      .populate('rideId', 'pickup dropoff')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get payment details
 */
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('userId', 'name phoneNumber email')
      .populate('rideId', 'pickup dropoff status fare');

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Refund payment (admin)
 */
exports.refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({ error: 'Payment cannot be refunded' });
    }

    payment.status = 'refunded';
    payment.refundedAt = new Date();
    payment.metadata = payment.metadata || {};
    payment.metadata.set('refundReason', reason || 'Refunded by admin');
    await payment.save();

    // Update user wallet
    await User.findByIdAndUpdate(payment.userId, {
      $inc: { 'wallet.balance': -payment.amount }
    });

    res.json({
      success: true,
      payment,
      message: 'Payment refunded successfully'
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get revenue analytics
 */
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    let groupBy;
    switch (period) {
      case 'daily':
        groupBy = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
        break;
      case 'weekly':
        groupBy = { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } };
        break;
      case 'monthly':
      default:
        groupBy = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
        break;
    }

    const revenue = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          type: { $in: ['ride', 'booking'] }
        }
      },
      {
        $group: {
          _id: groupBy,
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          avg: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get top earning drivers
    const topDrivers = await Ride.aggregate([
      {
        $match: { status: 'completed' }
      },
      {
        $group: {
          _id: '$driverId',
          totalEarnings: { $sum: '$fare.final' },
          totalRides: { $sum: 1 }
        }
      },
      { $sort: { totalEarnings: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'drivers',
          localField: '_id',
          foreignField: '_id',
          as: 'driver'
        }
      },
      { $unwind: '$driver' },
      {
        $lookup: {
          from: 'users',
          localField: 'driver.userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          name: '$user.name',
          totalEarnings: 1,
          totalRides: 1
        }
      }
    ]);

    res.json({
      success: true,
      revenue,
      topDrivers,
      period,
      total: revenue.reduce((sum, r) => sum + r.total, 0)
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user analytics
 */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    const userGrowth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const roleDistribution = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      userGrowth,
      roleDistribution,
      total: await User.countDocuments()
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get ride analytics
 */
exports.getRideAnalytics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    const rideStats = await Ride.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalFare: { $sum: '$fare.final' }
        }
      }
    ]);

    const typeDistribution = await Ride.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      rideStats,
      typeDistribution,
      total: await Ride.countDocuments()
    });
  } catch (error) {
    console.error('Get ride analytics error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get heatmap data
 */
exports.getHeatmapData = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    const query = {
      status: 'completed'
    };
    if (dateFrom) query['tracking.completedAt'] = { $gte: new Date(dateFrom) };
    if (dateTo) query['tracking.completedAt'] = { ...query['tracking.completedAt'], $lte: new Date(dateTo) };

    const heatmap = await Ride.aggregate([
      {
        $match: query
      },
      {
        $group: {
          _id: {
            lat: { $arrayElemAt: ['$pickup.location.coordinates', 1] },
            lng: { $arrayElemAt: ['$pickup.location.coordinates', 0] }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          location: {
            lat: '$_id.lat',
            lng: '$_id.lng'
          },
          count: 1,
          _id: 0
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 100
      }
    ]);

    res.json({
      success: true,
      heatmap
    });
  } catch (error) {
    console.error('Get heatmap data error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get system settings
 */
exports.getSettings = async (req, res) => {
  try {
    // In production, fetch from database
    const settings = {
      appName: 'Raftar',
      version: '1.0.0',
      maintenanceMode: false,
      commission: {
        ride: 15,
        parcel: 10,
        carpool: 5
      },
      pricing: {
        minFare: 50,
        maxFare: 10000,
        perKmRate: 20
      },
      features: {
        carpool: true,
        parcel: true,
        pinkPool: true,
        familyVault: true,
        monthlyPass: true
      }
    };

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update system settings
 */
exports.updateSettings = async (req, res) => {
  try {
    const updates = req.body;
    // In production, update database
    res.json({
      success: true,
      message: 'Settings updated successfully',
      settings: updates
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate report
 */
exports.generateReport = async (req, res) => {
  try {
    const { type, dateFrom, dateTo } = req.body;

    // Generate report based on type
    let report = {};
    
    switch (type) {
      case 'revenue':
        report = await generateRevenueReport(dateFrom, dateTo);
        break;
      case 'users':
        report = await generateUserReport(dateFrom, dateTo);
        break;
      case 'rides':
        report = await generateRideReport(dateFrom, dateTo);
        break;
      default:
        return res.status(400).json({ error: 'Invalid report type' });
    }

    res.json({
      success: true,
      report,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get reports list
 */
exports.getReports = async (req, res) => {
  try {
    // In production, fetch from database
    const reports = [
      {
        id: 'rep_1',
        type: 'revenue',
        generatedAt: new Date(),
        status: 'completed',
        downloadUrl: '/reports/revenue_2024.pdf'
      }
    ];

    res.json({
      success: true,
      reports
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get fleets
 */
exports.getFleets = async (req, res) => {
  try {
    // In production, fetch from database
    const fleets = [];

    res.json({
      success: true,
      fleets
    });
  } catch (error) {
    console.error('Get fleets error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create fleet
 */
exports.createFleet = async (req, res) => {
  try {
    const fleetData = req.body;
    // In production, save to database
    res.json({
      success: true,
      message: 'Fleet created successfully',
      fleet: fleetData
    });
  } catch (error) {
    console.error('Create fleet error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update fleet
 */
exports.updateFleet = async (req, res) => {
  try {
    const { fleetId } = req.params;
    const updates = req.body;
    // In production, update database
    res.json({
      success: true,
      message: 'Fleet updated successfully',
      fleetId
    });
  } catch (error) {
    console.error('Update fleet error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete fleet
 */
exports.deleteFleet = async (req, res) => {
  try {
    const { fleetId } = req.params;
    // In production, delete from database
    res.json({
      success: true,
      message: 'Fleet deleted successfully'
    });
  } catch (error) {
    console.error('Delete fleet error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get commission settings
 */
exports.getCommissionSettings = async (req, res) => {
  try {
    const commission = {
      ride: 15,
      parcel: 10,
      carpool: 5,
      corporate: 8,
      fleet: 12
    };

    res.json({
      success: true,
      commission
    });
  } catch (error) {
    console.error('Get commission settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update commission settings
 */
exports.updateCommissionSettings = async (req, res) => {
  try {
    const updates = req.body;
    // In production, update database
    res.json({
      success: true,
      message: 'Commission settings updated successfully',
      commission: updates
    });
  } catch (error) {
    console.error('Update commission settings error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get withdrawals
 */
exports.getWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { type: 'withdrawal' };
    if (status) query.status = status;

    const withdrawals = await Payment.find(query)
      .populate('userId', 'name phoneNumber email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      withdrawals,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get withdrawals error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Approve withdrawal
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;

    const withdrawal = await Payment.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    withdrawal.status = 'completed';
    withdrawal.completedAt = new Date();
    await withdrawal.save();

    res.json({
      success: true,
      message: 'Withdrawal approved successfully'
    });
  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Reject withdrawal
 */
exports.rejectWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    const { reason } = req.body;

    const withdrawal = await Payment.findById(withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({ error: 'Withdrawal not found' });
    }

    withdrawal.status = 'cancelled';
    withdrawal.metadata = withdrawal.metadata || {};
    withdrawal.metadata.set('rejectionReason', reason || 'Rejected by admin');
    await withdrawal.save();

    // Refund the amount back to user wallet
    await User.findByIdAndUpdate(withdrawal.userId, {
      $inc: { 'wallet.balance': withdrawal.amount }
    });

    res.json({
      success: true,
      message: 'Withdrawal rejected successfully'
    });
  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper functions for report generation
async function generateRevenueReport(dateFrom, dateTo) {
  const query = {
    status: 'completed',
    type: { $in: ['ride', 'booking'] }
  };
  if (dateFrom) query.createdAt = { $gte: new Date(dateFrom) };
  if (dateTo) query.createdAt = { ...query.createdAt, $lte: new Date(dateTo) };

  const payments = await Payment.find(query);
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  
  return {
    totalRevenue: total,
    count: payments.length,
    average: payments.length > 0 ? total / payments.length : 0,
    dateFrom,
    dateTo
  };
}

async function generateUserReport(dateFrom, dateTo) {
  const query = {};
  if (dateFrom) query.createdAt = { $gte: new Date(dateFrom) };
  if (dateTo) query.createdAt = { ...query.createdAt, $lte: new Date(dateTo) };

  const users = await User.find(query);
  
  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.isActive).length,
    verifiedUsers: users.filter(u => u.isVerified).length,
    roleDistribution: {
      passenger: users.filter(u => u.role === 'passenger').length,
      driver: users.filter(u => u.role === 'driver').length,
      admin: users.filter(u => u.role === 'admin').length
    },
    dateFrom,
    dateTo
  };
}

async function generateRideReport(dateFrom, dateTo) {
  const query = {};
  if (dateFrom) query.createdAt = { $gte: new Date(dateFrom) };
  if (dateTo) query.createdAt = { ...query.createdAt, $lte: new Date(dateTo) };

  const rides = await Ride.find(query);
  
  return {
    totalRides: rides.length,
    completedRides: rides.filter(r => r.status === 'completed').length,
    cancelledRides: rides.filter(r => r.status === 'cancelled').length,
    totalFare: rides.reduce((sum, r) => sum + (r.fare?.final || 0), 0),
    typeDistribution: {
      solo: rides.filter(r => r.type === 'solo').length,
      carpool: rides.filter(r => r.type === 'carpool').length,
      parcel: rides.filter(r => r.type === 'parcel').length
    },
    dateFrom,
    dateTo
  };
}