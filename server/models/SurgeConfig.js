const mongoose = require('mongoose');

const surgeConfigSchema = new mongoose.Schema({
  minDrivers: { type: Number, required: true },
  maxDrivers: { type: Number, default: null },
  multiplier: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('SurgeConfig', surgeConfigSchema);
