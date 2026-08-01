const axios = require('axios');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const ROUTES_NEW_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const redactKey = () => {
  if (!GOOGLE_MAPS_API_KEY) return '<MISSING>';
  return `${GOOGLE_MAPS_API_KEY.slice(0, 8)}...${GOOGLE_MAPS_API_KEY.slice(-4)}`;
};

// Surfaces the real Google failure instead of silently returning a constant.
const logGoogleFailure = (label, payload) => {
  const status = payload?.status || payload?.error?.status || 'UNKNOWN';
  const message = payload?.error_message || payload?.error?.message || '';
  let action = '';
  if (/has not been used in project|is disabled|not activated|legacy API, which is not enabled/i.test(message)) {
    action = 'CLOUD CONSOLE FIX: enable this API on the project that owns this key.';
  } else if (/must enable Billing|billing/i.test(message)) {
    action = 'CLOUD CONSOLE FIX: enable billing on this Cloud project.';
  } else if (/blocked|not authorized/i.test(message)) {
    action = 'CLOUD CONSOLE FIX: this key has an API restriction excluding this API.';
  }
  console.error(
    `[mapService] ${label} FAILED\n  status: ${status}\n  message: ${message || '(none)'}\n` +
      `  key: ${redactKey()}${action ? `\n  ACTION: ${action}` : ''}\n` +
      `  raw: ${JSON.stringify(payload).slice(0, 600)}`
  );
};

const toRad = (v) => (v * Math.PI) / 180;

// [lng, lat] GeoJSON pairs -> km
const haversineKm = (c1, c2) => {
  const R = 6371;
  const dLat = toRad(c2[1] - c1[1]);
  const dLon = toRad(c2[0] - c1[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(c1[1])) * Math.cos(toRad(c2[1])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Distance-aware fallback. Previously this returned a flat 10km/20min, so every
// fare was computed from a constant whenever Directions was unavailable.
const estimateRoute = (originCoords, destCoords, waypointCoords = []) => {
  const chain = [originCoords, ...waypointCoords, destCoords];
  let km = 0;
  for (let i = 1; i < chain.length; i++) km += haversineKm(chain[i - 1], chain[i]);
  const roadKm = km * 1.3; // roads are not straight lines
  const minutes = (roadKm / 25) * 60; // ~25 km/h average city speed
  return {
    distance: roadKm,
    duration: minutes,
    distanceText: `${roadKm.toFixed(1)} km`,
    durationText: `${Math.max(1, Math.round(minutes))} mins`,
    isEstimate: true,
  };
};

// Routes API (New) — used when the legacy Directions API is not enabled.
const routesApiRoute = async (originCoords, destCoords, waypointCoords = []) => {
  const toWaypoint = (c) => ({ location: { latLng: { latitude: c[1], longitude: c[0] } } });

  const response = await axios.post(
    ROUTES_NEW_URL,
    {
      origin: toWaypoint(originCoords),
      destination: toWaypoint(destCoords),
      ...(waypointCoords.length ? { intermediates: waypointCoords.map(toWaypoint) } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      polylineQuality: 'HIGH_QUALITY',
      languageCode: 'en',
      regionCode: 'PK',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
      validateStatus: () => true,
    }
  );

  const data = response.data;
  if (response.status === 200 && !data.error && data.routes?.length) {
    const route = data.routes[0];
    const km = (route.distanceMeters || 0) / 1000;
    const minutes = parseFloat(String(route.duration || '0').replace('s', '')) / 60;
    return {
      distance: km,
      duration: minutes,
      distanceText: `${km.toFixed(1)} km`,
      durationText: `${Math.max(1, Math.round(minutes))} mins`,
      polyline: route.polyline?.encodedPolyline || '',
      steps: [],
    };
  }
  logGoogleFailure('Routes API (New)', data);
  return null;
};

exports.getDistance = async (origin, destination) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json`,
      {
        params: {
          origins: `${origin.coordinates[1]},${origin.coordinates[0]}`,
          destinations: `${destination.coordinates[1]},${destination.coordinates[0]}`,
          mode: 'driving',
          key: GOOGLE_MAPS_API_KEY
        },
        validateStatus: () => true
      }
    );

    const data = response.data;
    const element = data?.rows?.[0]?.elements?.[0];
    if (data?.status === 'OK' && element?.status === 'OK') {
      return {
        distance: element.distance.value / 1000, // in km
        duration: element.duration.value / 60, // in minutes
        distanceText: element.distance.text,
        durationText: element.duration.text
      };
    }
    logGoogleFailure('Distance Matrix', data);
  } catch (error) {
    console.error('[mapService] Distance Matrix request error:', error.message);
  }

  // Distance Matrix unavailable — try Routes API, then a distance-aware estimate.
  const viaRoutes = await routesApiRoute(origin.coordinates, destination.coordinates).catch(() => null);
  if (viaRoutes) return viaRoutes;

  return estimateRoute(origin.coordinates, destination.coordinates);
};

exports.getGeocode = async (address) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json`,
      {
        params: {
          address,
          key: GOOGLE_MAPS_API_KEY
        }
      }
    );

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        coordinates: [location.lng, location.lat],
        address: response.data.results[0].formatted_address,
        placeId: response.data.results[0].place_id
      };
    }
    throw new Error('Geocoding failed');
  } catch (error) {
    console.error('Geocode error:', error);
    throw error;
  }
};

exports.findNearbyDrivers = async (location, vehicleType) => {
  try {
    const Driver = require('../models/Driver');
    
    const drivers = await Driver.find({
      'availability.status': 'available',
      isOnline: true,
      status: 'approved',
      'vehicleDetails.type': vehicleType || { $exists: true },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: location.coordinates
          },
          $maxDistance: 10000 // 10km radius
        }
      }
    })
    .populate('userId', 'name phoneNumber rating')
    .limit(20);

    return drivers;
  } catch (error) {
    console.error('Find nearby drivers error:', error);
    return [];
  }
};

exports.calculateRoute = async (origin, destination, waypoints = []) => {
  const waypointCoords = waypoints.map(w => w.coordinates);

  try {
    const params = {
      origin: `${origin.coordinates[1]},${origin.coordinates[0]}`,
      destination: `${destination.coordinates[1]},${destination.coordinates[0]}`,
      mode: 'driving',
      alternatives: 'true',
      departure_time: 'now',
      region: 'pk',
      key: GOOGLE_MAPS_API_KEY
    };

    if (waypointCoords.length > 0) {
      params.waypoints = waypointCoords.map(c => `${c[1]},${c[0]}`).join('|');
    }

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json`,
      { params, validateStatus: () => true }
    );

    const data = response.data;
    if (data?.status === 'OK' && data.routes?.length) {
      // Pick the fastest alternative, and sum ALL legs so multi-stop trips are
      // priced on the whole journey rather than just the first leg.
      const scored = data.routes.map(route => {
        const legs = route.legs || [];
        return {
          route,
          legs,
          seconds: legs.reduce((s, l) => s + (l.duration_in_traffic?.value ?? l.duration?.value ?? 0), 0),
          meters: legs.reduce((s, l) => s + (l.distance?.value ?? 0), 0)
        };
      });
      const best = scored.reduce((a, b) => (b.seconds && b.seconds < a.seconds ? b : a), scored[0]);

      return {
        distance: best.meters / 1000,
        duration: best.seconds / 60,
        polyline: best.route.overview_polyline?.points || '',
        steps: best.legs.flatMap(leg =>
          (leg.steps || []).map(step => ({
            instruction: step.html_instructions,
            distance: step.distance?.text,
            duration: step.duration?.text,
            location: {
              lat: step.start_location?.lat,
              lng: step.start_location?.lng
            }
          }))
        )
      };
    }
    logGoogleFailure('Directions (legacy)', data);
  } catch (error) {
    console.error('[mapService] Directions request error:', error.message);
  }

  // Legacy Directions unavailable — try Routes API (New), then estimate.
  const viaRoutes = await routesApiRoute(
    origin.coordinates,
    destination.coordinates,
    waypointCoords
  ).catch(() => null);
  if (viaRoutes) return viaRoutes;

  console.warn(
    '[mapService] No road route available — using a distance-aware estimate. ' +
      'Enable the Directions API or Routes API to price rides on real routes.'
  );
  return { ...estimateRoute(origin.coordinates, destination.coordinates, waypointCoords), polyline: '', steps: [] };
};

exports.findMatchingRoutes = async (pickup, dropoff, timeWindow) => {
  try {
    const Booking = require('../models/Booking');
    
    // Find carpool bookings that match
    const matching = await Booking.find({
      type: 'carpool',
      status: 'searching',
      'carpool.seatsAvailable': { $gt: 0 },
      'pickup.location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: pickup.coordinates
          },
          $maxDistance: 5000
        }
      }
    });

    // Filter by route similarity
    const filtered = matching.filter(booking => {
      const pickupDist = this.calculateDistance(
        pickup.coordinates,
        booking.pickup.location.coordinates
      );
      const dropoffDist = this.calculateDistance(
        dropoff.coordinates,
        booking.dropoff.location.coordinates
      );
      
      return pickupDist < 3000 && dropoffDist < 3000; // Within 3km
    });

    return filtered;
  } catch (error) {
    console.error('Find matching routes error:', error);
    return [];
  }
};

exports.calculateDistance = (coord1, coord2) => {
  // Haversine formula
  const R = 6371; // Earth's radius in km
  const dLat = this.toRad(coord2[1] - coord1[1]);
  const dLon = this.toRad(coord2[0] - coord1[0]);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.toRad(coord1[1])) * Math.cos(this.toRad(coord2[1])) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

exports.toRad = (value) => {
  return value * Math.PI / 180;
};