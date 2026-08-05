const mongoose = require('mongoose');

const cityTierSchema = new mongoose.Schema({
  city: { type: String, required: true, unique: true },
  tier: { type: Number, required: true },
  multiplier: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('CityTier', cityTierSchema);
