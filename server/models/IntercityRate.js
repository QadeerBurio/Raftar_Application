const mongoose = require('mongoose');

const intercityRateSchema = new mongoose.Schema({
  minDistance: { type: Number, required: true },
  maxDistance: { type: Number, default: null }, // Null means infinity
  ratePerKm: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('IntercityRate', intercityRateSchema);
