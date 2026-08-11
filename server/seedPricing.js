const mongoose = require('mongoose');
const dotenv = require('dotenv');

const PricingConfig = require('./models/PricingConfig');
const CityTier = require('./models/CityTier');
const IntercityRate = require('./models/IntercityRate');
const SurgeConfig = require('./models/SurgeConfig');
const PeakHour = require('./models/PeakHour');

dotenv.config();

const VEHICLE_RATES = [
  { vehicle: 'bike', baseFare: 22, ratePerKm: 15, ratePerMin: 2.5, floorCost: 11 },
  { vehicle: 'rickshaw', baseFare: 28, ratePerKm: 35, ratePerMin: 4.5, floorCost: 10 },
  { vehicle: 'car', baseFare: 75, ratePerKm: 45, ratePerMin: 5.5, floorCost: 29 },
  { vehicle: 'ac_car', baseFare: 75, ratePerKm: 45, ratePerMin: 5.5, floorCost: 45 },
  { vehicle: 'luxury', baseFare: 110, ratePerKm: 65, ratePerMin: 8, floorCost: 66 }
];

const CITY_TIERS = [
  { city: 'Karachi', tier: 1, multiplier: 1.0 },
  { city: 'Lahore', tier: 1, multiplier: 1.0 },
  { city: 'Islamabad', tier: 1, multiplier: 1.0 },
  { city: 'Rawalpindi', tier: 2, multiplier: 1.15 },
  { city: 'Faisalabad', tier: 2, multiplier: 1.15 },
  { city: 'Multan', tier: 2, multiplier: 1.15 },
  { city: 'Hyderabad', tier: 2, multiplier: 1.15 },
  { city: 'Peshawar', tier: 2, multiplier: 1.15 },
  { city: 'Jamshoro', tier: 3, multiplier: 1.3 },
  { city: 'Sukkur', tier: 3, multiplier: 1.3 },
  { city: 'Sialkot', tier: 3, multiplier: 1.3 },
  { city: 'Gujranwala', tier: 3, multiplier: 1.3 }
];

const INTERCITY_RATES = [
  { minDistance: 0, maxDistance: 80, ratePerKm: 55 },
  { minDistance: 80, maxDistance: 150, ratePerKm: 42 },
  { minDistance: 150, maxDistance: 300, ratePerKm: 33 },
  { minDistance: 300, maxDistance: 700, ratePerKm: 28 },
  { minDistance: 700, maxDistance: null, ratePerKm: 25 }
];

const SURGE_CONFIG = [
  { minDrivers: 5, maxDrivers: null, multiplier: 0.9 },
  { minDrivers: 3, maxDrivers: 4, multiplier: 1.0 },
  { minDrivers: 1, maxDrivers: 2, multiplier: 1.25 },
  { minDrivers: 0, maxDrivers: 0, multiplier: 1.5 }
];

const PEAK_HOURS = [
  { dayOfWeek: null, startHour: 7, endHour: 9, multiplier: 1.25 },
  { dayOfWeek: null, startHour: 17, endHour: 19, multiplier: 1.25 },
  { dayOfWeek: null, startHour: 18, endHour: 22, multiplier: 1.15 },
  { dayOfWeek: null, startHour: 10, endHour: 16, multiplier: 0.9 },
  { dayOfWeek: null, startHour: 22, endHour: 6, multiplier: 0.9 }
];

const seedPricing = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing
    await PricingConfig.deleteMany({});
    await CityTier.deleteMany({});
    await IntercityRate.deleteMany({});
    await SurgeConfig.deleteMany({});
    await PeakHour.deleteMany({});

    // Seed new
    await PricingConfig.insertMany(VEHICLE_RATES);
    await CityTier.insertMany(CITY_TIERS);
    await IntercityRate.insertMany(INTERCITY_RATES);
    await SurgeConfig.insertMany(SURGE_CONFIG);
    await PeakHour.insertMany(PEAK_HOURS);

    console.log('Pricing data seeded successfully!');
  } catch (error) {
    console.error('Error seeding pricing data:', error);
  } finally {
    process.exit(0);
  }
};

seedPricing();
