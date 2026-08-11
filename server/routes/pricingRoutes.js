const express = require('express');
const router = express.Router();
const pricingEngine = require('../services/pricingEngine');
const auth = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const PricingConfig = require('../models/PricingConfig');
const CityTier = require('../models/CityTier');
const IntercityRate = require('../models/IntercityRate');
const SurgeConfig = require('../models/SurgeConfig');
const PeakHour = require('../models/PeakHour');

// POST /api/pricing/calculate - full fare with all inputs
router.post('/calculate', auth, async (req, res) => {
  try {
    const fareDetails = await pricingEngine.calculateFare(req.body);
    res.json(fareDetails);
  } catch (error) {
    console.error('Error calculating fare:', error);
    res.status(500).json({ message: 'Error calculating fare', error: error.message });
  }
});

// POST /api/pricing/estimate - pre-booking estimate
router.post('/estimate', auth, async (req, res) => {
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
router.put('/config', auth, isAdmin, async (req, res) => {
  try {
    const { type, data } = req.body;
    const docId = data._id || data.id;
    
    // Type can be vehicleRates, cityTiers, intercityRates, surgeConfig, peakHours
    switch (type) {
      case 'vehicleRates':
        const vehicleData = {
          vehicle: data.vehicle,
          baseFare: data.base !== undefined ? data.base : data.baseFare,
          ratePerKm: data.ratePerKm,
          ratePerMin: data.ratePerMin,
          floorCost: data.floor !== undefined ? data.floor : data.floorCost
        };
        if (docId) {
          await PricingConfig.findByIdAndUpdate(docId, vehicleData);
        } else {
          await PricingConfig.findOneAndUpdate({ vehicle: data.vehicle }, vehicleData, { upsert: true });
        }
        break;
      case 'cityTiers':
        if (docId) {
          await CityTier.findByIdAndUpdate(docId, data);
        } else {
          await CityTier.findOneAndUpdate({ city: data.city }, data, { upsert: true });
        }
        break;
      case 'intercityRates':
        if (docId) {
          await IntercityRate.findByIdAndUpdate(docId, data);
        } else {
          await new IntercityRate(data).save();
        }
        break;
      case 'surgeConfig':
        if (docId) {
          await SurgeConfig.findByIdAndUpdate(docId, data);
        } else {
          await new SurgeConfig(data).save();
        }
        break;
      case 'peakHours':
        if (docId) {
          await PeakHour.findByIdAndUpdate(docId, data);
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
