const mongoose = require('mongoose');

const peakHourSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, default: null }, // 0 = Sunday, 1 = Monday... Null = Every day
  startHour: { type: Number, required: true },
  endHour: { type: Number, required: true },
  multiplier: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('PeakHour', peakHourSchema);
