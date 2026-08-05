const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { calculateFare, loadConfig } = require('./services/pricingEngine');

dotenv.config();

const testPricing = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    await loadConfig();

    console.log('\n--- Test Scenario 1: Car, Karachi, 8.6km, 22min, 4 drivers, 15:00 ---');
    const res1 = await calculateFare({
      vehicle: 'car',
      city: 'Karachi',
      pickup: { lat: 24.8607, lng: 67.0011 },
      dropoff: { lat: 24.8615, lng: 67.0094 },
      stops: [],
      estimatedDistance: 8.6,
      estimatedTime: 22,
      driverLocation: null, // No deadhead for exact match
      isIntercity: false,
      isCarpool: false,
      passengers: 1,
      driversAvailable: 4,
      hour: 15,
      waitMinutes: 0,
      driverId: null
    });
    console.log('Fare:', res1.fare, '(Expected ~620)');
    
    console.log('\n--- Test Scenario 2: Bike, Jamshoro, 4km, 10min, 2 drivers, 20:00 ---');
    const res2 = await calculateFare({
      vehicle: 'bike',
      city: 'Jamshoro',
      estimatedDistance: 4,
      estimatedTime: 10,
      driverLocation: null,
      isIntercity: false,
      isCarpool: false,
      passengers: 1,
      driversAvailable: 2,
      hour: 20,
      waitMinutes: 0,
      driverId: null
    });
    console.log('Fare:', res2.fare, '(Expected ~180)');
    
    console.log('\n--- Test Scenario 3: Car, Intercity, 130km ---');
    const res3 = await calculateFare({
      vehicle: 'car',
      city: 'Karachi',
      estimatedDistance: 130,
      estimatedTime: 120,
      driverLocation: null,
      isIntercity: true,
      isCarpool: false,
      passengers: 1,
      driversAvailable: 5,
      hour: 12,
      waitMinutes: 0,
      driverId: null
    });
    console.log('Fare:', res3.fare, '(Expected ~5500)');

  } catch (error) {
    console.error('Test error:', error);
  } finally {
    process.exit(0);
  }
};

testPricing();
