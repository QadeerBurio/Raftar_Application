const mongoose = require('mongoose');

const pricingConfigSchema = new mongoose.Schema({
  vehicle: { type: String, required: true, unique: true },
  baseFare: { type: Number, required: true },
  ratePerKm: { type: Number, required: true },
  ratePerMin: { type: Number, required: true },
  floorCost: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('PricingConfig', pricingConfigSchema);
