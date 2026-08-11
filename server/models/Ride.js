const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  passengerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  },
  type: {
    type: String,
    enum: ['solo', 'carpool', 'parcel', 'intercity'],
    required: true
  },
  guest: {
    isGuestBooking: { type: Boolean, default: false },
    name: String,
    phoneNumber: String,
    relation: String,
    note: String
  },
  status: {
    type: String,
    enum: ['pending', 'searching', 'accepted', 'scheduled', 'started', 'completed', 'cancelled'],
    default: 'pending'
  },
  shareToken: {
    type: String,
    unique: true,
    sparse: true
  },
  scheduledTime: {
    type: Date
  },
  reminderSent: {
    type: Boolean,
    default: false
  },
  pickup: {
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    },
    placeId: String
  },
  dropoff: {
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    },
    placeId: String
  },
  waypoints: [{
    address: String,
    location: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    },
    status: {
      type: String,
      enum: ['pending', 'arrived', 'completed'],
      default: 'pending'
    }
  }],
  fare: {
    offered: Number,
    counter: Number,
    accepted: Number,
    final: Number,
    type: {
      type: String,
      enum: ['offer', 'ai', 'negotiated']
    }
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'rickshaw', 'car', 'ac_car', 'luxury_car']
  },
  bids: [{
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true
    },
    fare: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  payment: {
    method: {
      type: String,
      enum: ['cash', 'easypaisa', 'jazzcash', 'raast', 'wallet']
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },
    transactionId: String,
    amount: Number
  },
  carpool: {
    seats: Number,
    bookedSeats: [{
      passengerId: mongoose.Schema.Types.ObjectId,
      status: String
    }],
    totalPassengers: Number
  },
  parcel: {
    size: {
      type: String,
      enum: ['small', 'medium', 'large']
    },
    weight: Number,
    description: String,
    receiverName: String,
    receiverPhone: String,
    deliveryOTP: String,
    codAmount: Number,
    codStatus: {
      type: String,
      enum: ['pending', 'collected', 'delivered']
    }
  },
  tracking: {
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    distance: Number,
    route: {
      type: {
        type: String,
        enum: ['LineString']
      },
      coordinates: [[Number]]
    }
  },
  ratings: {
    passengerRating: {
      rating: Number,
      comment: String,
      createdAt: Date
    },
    driverRating: {
      rating: Number,
      comment: String,
      createdAt: Date
    }
  },
  emergency: {
    sos: {
      triggered: Boolean,
      triggeredAt: Date,
      contacts: [String]
    }
  },
  chat: [{
    senderId: mongoose.Schema.Types.ObjectId,
    message: String,
    type: {
      type: String,
      enum: ['text', 'voice']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

rideSchema.index({ 'pickup.location': '2dsphere' });
rideSchema.index({ 'dropoff.location': '2dsphere' });
rideSchema.index({ status: 1, type: 1 });
rideSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Ride', rideSchema);