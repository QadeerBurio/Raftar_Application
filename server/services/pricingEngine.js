const PricingConfig = require('../models/PricingConfig');
const CityTier = require('../models/CityTier');
const IntercityRate = require('../models/IntercityRate');
const SurgeConfig = require('../models/SurgeConfig');
const PeakHour = require('../models/PeakHour');
const Subscription = require('../models/Subscription');

// In-memory cache
let configCache = {
  vehicleRates: {},
  cityTiers: {},
  intercityRates: [],
  surgeConfig: [],
  peakHours: [],
  lastUpdated: null
};

/**
 * Load pricing configs from DB to memory
 */
const loadConfig = async () => {
  try {
    const vehicles = await PricingConfig.find({});
    configCache.vehicleRates = {};
    vehicles.forEach(v => {
      configCache.vehicleRates[v.vehicle] = {
        base: v.baseFare,
        ratePerKm: v.ratePerKm,
        ratePerMin: v.ratePerMin,
        floor: v.floorCost
      };
    });

    const cities = await CityTier.find({});
    configCache.cityTiers = {};
    cities.forEach(c => {
      configCache.cityTiers[c.city] = c.multiplier;
    });

    configCache.intercityRates = await IntercityRate.find({}).sort({ minDistance: 1 });
    configCache.surgeConfig = await SurgeConfig.find({}).sort({ minDrivers: -1 });
    configCache.peakHours = await PeakHour.find({});
    
    configCache.lastUpdated = new Date();
    console.log('Pricing configuration loaded into memory.');
  } catch (error) {
    console.error('Error loading pricing config:', error);
  }
};

/**
 * Helper Functions (matching spec)
 */

function getDistanceFactor(distanceKm) {
  if (distanceKm <= 2) return 0.7;
  if (distanceKm <= 5) return 1.0;
  if (distanceKm <= 10) return 1.2;
  return 1.0;
}

function getPeakFactor(hour, dayOfWeek) {
  // First check DB config
  const peak = configCache.peakHours.find(p => p.startHour <= hour && p.endHour >= hour && (p.dayOfWeek === null || p.dayOfWeek === dayOfWeek));
  if (peak) return peak.multiplier;

  // Fallback to hardcoded from document
  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) return 1.25;
  if (hour >= 18 && hour <= 22) return 1.15;
  if ((hour >= 10 && hour <= 16) || (hour >= 22 || hour <= 6)) return 0.9;
  return 1.0;
}

function getNightFactor(hour) {
  if (hour >= 22 && hour < 24) return 1.1;
  if (hour >= 0 && hour < 5) return 1.25;
  if (hour >= 5 && hour < 6) return 1.1;
  return 1.0;
}

function getSurgeFactor(driversAvailable) {
  // Check DB config first
  const surge = configCache.surgeConfig.find(s => driversAvailable >= s.minDrivers && (s.maxDrivers === null || driversAvailable <= s.maxDrivers));
  if (surge) return surge.multiplier;

  // Fallback to hardcoded from document
  if (driversAvailable >= 5) return 0.9;
  if (driversAvailable >= 3) return 1.0;
  if (driversAvailable >= 1) return 1.25;
  return 1.5;
}

function getACPremium(distanceKm) {
  let premium = 12 * distanceKm;
  return Math.min(premium, 200);
}

function calculateIntercityFare(distanceKm) {
  let remaining = distanceKm;
  let fare = 100; // Base
  
  const tiers = configCache.intercityRates.length > 0 ? configCache.intercityRates.map(t => ({
    max: t.maxDistance || Infinity,
    rate: t.ratePerKm
  })) : [
    { max: 80, rate: 55 },
    { max: 150, rate: 42 },
    { max: 300, rate: 33 },
    { max: 700, rate: 28 },
    { max: Infinity, rate: 25 }
  ];

  let prevMax = 0;
  for (const tier of tiers) {
    const take = Math.min(remaining, tier.max - prevMax);
    if (take <= 0) continue;
    fare += take * tier.rate;
    remaining -= take;
    prevMax = tier.max;
    if (remaining <= 0) break;
  }
  return fare;
}

async function getDeadheadDistance(driverLat, driverLng, pickupLat, pickupLng) {
  // In a real scenario, this would call Google Maps Distance Matrix API
  // Returning hardcoded values based on the spec
  return { distance: 2.5, time: 5 };
}


function calculateWaitFee(waitMinutes) {
  if (waitMinutes <= 3) return 0;
  if (waitMinutes <= 10) return (waitMinutes - 3) * 15;
  // After 10 minutes: auto-cancel, driver compensated
  return 0; // Ride cancelled, no fee to rider
}

async function getDriverCommission(driverId) {
  if (!driverId) return 0.15;
  try {
    const sub = await Subscription.findOne({
      driverId: driverId,
      expiresAt: { $gt: new Date() },
      isActive: true
    });
    // Active subscriber = 0% commission, Inactive = 15% commission
    if (sub) return 0;
    return 0.15;
  } catch (error) {
    console.error('Error checking subscription:', error);
    return 0.15;
  }
}

async function getGoogleMapsDirect(pickup, dropoff) {
  // Mock Google Maps API call. Should be replaced with actual Google Maps API logic in production.
  const distance = Math.sqrt(Math.pow(pickup.lat - dropoff.lat, 2) + Math.pow(pickup.lng - dropoff.lng, 2)) * 111;
  const time = distance * 2.5;
  return { distance: Math.max(distance, 1), time: Math.max(time, 1) };
}

async function getGoogleMapsWithWaypoints(pickup, waypointsStr, dropoff) {
  // Mock Google Maps API call with waypoints
  let distance = 0;
  let current = pickup;
  const stops = waypointsStr.split('|').map(s => {
    const parts = s.split(',');
    return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
  });
  
  const allStops = [...stops, dropoff];
  for (const stop of allStops) {
    distance += Math.sqrt(Math.pow(current.lat - stop.lat, 2) + Math.pow(current.lng - stop.lng, 2)) * 111;
    current = stop;
  }
  const time = distance * 2.5;
  return { distance: Math.max(distance, 1), time: Math.max(time, 1) };
}

/**
 * MAIN CALCULATE FARE FUNCTION
 */
async function calculateFare(input) {
  // INPUTS: vehicle, city, pickup, dropoff, stops[], driverLocation, driversAvailable, hour, isIntercity, isCarpool, passengers, waitMinutes, driverId
  
  if (!configCache.lastUpdated) {
    await loadConfig();
  }

  const fallbackRates = {
    bike: { base: 22, ratePerKm: 15, ratePerMin: 2.5, floor: 11 },
    rickshaw: { base: 28, ratePerKm: 35, ratePerMin: 4.5, floor: 10 },
    car: { base: 75, ratePerKm: 45, ratePerMin: 5.5, floor: 29 },
    ac_car: { base: 75, ratePerKm: 45, ratePerMin: 5.5, floor: 45 },
    luxury: { base: 110, ratePerKm: 65, ratePerMin: 8, floor: 66 }
  };
  const rates = configCache.vehicleRates[input.vehicle] || fallbackRates[input.vehicle] || fallbackRates.car;
  
  // === STEP 1: Get Google Maps Data ===
  let routeData;
  if (input.estimatedDistance && input.estimatedTime) {
      routeData = { distance: input.estimatedDistance, time: input.estimatedTime };
  } else if (input.stops && input.stops.length > 0) {
      // Build waypoints string
      const waypoints = input.stops.map(s => `${s.lat},${s.lng}`).join('|');
      // Call Google Maps with waypoints
      routeData = await getGoogleMapsWithWaypoints(input.pickup, waypoints, input.dropoff);
  } else {
      routeData = await getGoogleMapsDirect(input.pickup, input.dropoff);
  }
  
  let deadhead = { distance: 0, time: 0 };
  if (input.driverLocation) {
    deadhead = await getDeadheadDistance(input.driverLocation.lat, input.driverLocation.lng, input.pickup.lat, input.pickup.lng);
  }

  const totalDistance = routeData.distance + deadhead.distance;
  const totalTime = routeData.time + deadhead.time;

  
  // === STEP 3: Base Fare ===
  let subtotal = 
    rates.base * getDistanceFactor(totalDistance) +
    totalDistance * rates.ratePerKm +
    totalTime * rates.ratePerMin;
  
  // === STEP 4: Multipliers ===
  const cityTierMultiplier = configCache.cityTiers[input.city] || 1.3;
  subtotal *= cityTierMultiplier;
  
  const peakMultiplier = getPeakFactor(input.hour, new Date().getDay());
  subtotal *= peakMultiplier;
  
  const surgeMultiplier = getSurgeFactor(input.driversAvailable);
  subtotal *= surgeMultiplier;
  
  const nightMultiplier = getNightFactor(input.hour);
  subtotal *= nightMultiplier;
  
  // === STEP 5: AC Premium ===
  const acPremium = input.vehicle === 'ac_car' ? getACPremium(totalDistance) : 0;
  subtotal += acPremium;
  

  
  // === STEP 7: Wait Time Fee ===
  const waitFee = calculateWaitFee(input.waitMinutes || 0);
  subtotal += waitFee;
  
  // === STEP 8: Intercity Override ===
  if (input.isIntercity) {
    subtotal = calculateIntercityFare(totalDistance);
  }
  
  // === STEP 9: Carpool ===
  if (input.isCarpool && input.passengers > 1) {
    const soloFare = subtotal;
    let poolFactor = 0.35; // In-city default
    if (input.isIntercity && totalDistance < 500) poolFactor = 0.45;
    if (input.isIntercity && totalDistance >= 500) poolFactor = 0.30;
    const totalPool = soloFare * (1 + poolFactor * (input.passengers - 1));
    subtotal = totalPool / input.passengers;
  }
  
  // === STEP 10: Floor Protection ===
  const floor = rates.floor * totalDistance;
  const floorApplied = subtotal < floor;
  if (floorApplied) subtotal = floor;
  
  // === STEP 11: Commission Check ===
  const commission = await getDriverCommission(input.driverId);
  const driverEarnings = subtotal * (1 - commission);
  
  // === STEP 12: Round ===
  const finalFare = Math.ceil(subtotal / 10) * 10;
  
  return {
    fare: finalFare,
    driverEarnings: Math.ceil(driverEarnings / 10) * 10,
    platformCommission: commission * 100,
    breakdown: {
      baseFare: rates.base * getDistanceFactor(totalDistance),
      distanceCost: totalDistance * rates.ratePerKm,
      timeCost: totalTime * rates.ratePerMin,
      deadheadDistance: deadhead.distance,
      deadheadTime: deadhead.time,

      waitFee: waitFee,
      cityTier: cityTierMultiplier,
      peakMultiplier: peakMultiplier,
      surgeMultiplier: surgeMultiplier,
      nightMultiplier: nightMultiplier,
      acPremium: acPremium,
      floorApplied: floorApplied,
      commissionApplied: commission > 0,
      final: finalFare
    },
    distance: totalDistance,
    time: totalTime,
    vehicle: input.vehicle,
    city: input.city
  };
}

module.exports = {
  calculateFare,
  loadConfig,
  configCache
};
