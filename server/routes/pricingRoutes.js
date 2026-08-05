const express = require('express');
const router = express.Router();
const pricingEngine = require('../services/pricingEngine');
const { protect, admin } = require('../middleware/auth'); // Check actual auth middleware imports
const PricingConfig = require('../models/PricingConfig');
const CityTier = require('../models/CityTier');
const IntercityRate = require('../models/IntercityRate');
const SurgeConfig = require('../models/SurgeConfig');
const PeakHour = require('../models/PeakHour');

// POST /api/pricing/calculate - full fare with all inputs
router.post('/calculate', protect, async (req, res) => {
  try {
    const fareDetails = await pricingEngine.calculateFare(req.body);
    res.json(fareDetails);
  } catch (error) {
    console.error('Error calculating fare:', error);
    res.status(500).json({ message: 'Error calculating fare', error: error.message });
  }
});

// POST /api/pricing/estimate - pre-booking estimate
router.post('/estimate', protect, async (req, res) => {
  try {
    // For estimate, we don't have driver location, driverId, waitMinutes, etc.
    const input = {
      ...req.body,
      driverLocation: null,
      driverId: null,
      waitMinutes: 0,
      hour: req.body.hour || new Date().getHours()
    };
    
    const fareDetails = await pricingEngine.calculateFare(input);
    
    res.json({
      estimatedFare: fareDetails.fare,
      estimatedDistance: fareDetails.distance,
      estimatedTime: fareDetails.time,
      vehicle: req.body.vehicle
    });
  } catch (error) {
    console.error('Error estimating fare:', error);
    res.status(500).json({ message: 'Error estimating fare', error: error.message });
  }
});

// GET /api/pricing/config - get all current rates
router.get('/config', async (req, res) => {
  try {
    // Always return the latest from cache or force reload
    await pricingEngine.loadConfig();
    res.json(pricingEngine.configCache);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pricing config' });
  }
});

// PUT /api/pricing/config - update rates (admin only)
router.put('/config', protect, admin, async (req, res) => {
  try {
    const { type, data } = req.body;
    
    // Type can be vehicleRates, cityTiers, intercityRates, surgeConfig, peakHours
    switch (type) {
      case 'vehicleRates':
        if (data.id) {
          await PricingConfig.findByIdAndUpdate(data.id, data);
        } else {
          await PricingConfig.findOneAndUpdate({ vehicle: data.vehicle }, data, { upsert: true });
        }
        break;
      case 'cityTiers':
        if (data.id) {
          await CityTier.findByIdAndUpdate(data.id, data);
        } else {
          await CityTier.findOneAndUpdate({ city: data.city }, data, { upsert: true });
        }
        break;
      case 'intercityRates':
        if (data.id) {
          await IntercityRate.findByIdAndUpdate(data.id, data);
        } else {
          await new IntercityRate(data).save();
        }
        break;
      case 'surgeConfig':
        if (data.id) {
          await SurgeConfig.findByIdAndUpdate(data.id, data);
        } else {
          await new SurgeConfig(data).save();
        }
        break;
      case 'peakHours':
        if (data.id) {
          await PeakHour.findByIdAndUpdate(data.id, data);
        } else {
          await new PeakHour(data).save();
        }
        break;
      default:
        return res.status(400).json({ message: 'Invalid config type' });
    }
    
    // Reload cache
    await pricingEngine.loadConfig();
    res.json({ message: 'Configuration updated successfully', cache: pricingEngine.configCache });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ message: 'Error updating pricing config', error: error.message });
  }
});

module.exports = router;
