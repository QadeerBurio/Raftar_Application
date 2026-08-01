// src/services/maps.js
//
// Single entry point for every Google Maps Platform call the app makes.
//
// Two things this module exists to solve:
//  1. The project used to call the Places API (New) / Routes API endpoints only.
//     If a Google Cloud project has the *legacy* Places + Directions APIs enabled
//     instead (or vice versa), every one of those calls returns 403 and the UI
//     silently degrades. Every helper here tries one flavour, and on a
//     "this API is not enabled" error transparently retries the other, then
//     remembers which flavour worked for the rest of the session.
//  2. Failures used to be swallowed. Every non-OK Google response is now logged
//     in full, with a plain-English diagnosis of whether the cause is a disabled
//     API, a key restriction, or billing — i.e. something to fix in Cloud Console
//     rather than in code.

import { GOOGLE_MAPS_API_KEY } from '../config/constants';

const LEGACY_BASE = 'https://maps.googleapis.com/maps/api';
const PLACES_NEW_BASE = 'https://places.googleapis.com/v1';
const ROUTES_NEW_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const REGION_CODE = 'pk';

// Which API flavour actually works in this Cloud project. Discovered on the
// first call, then reused so we stop paying for a doomed request every time.
let placesFlavour = null; // 'legacy' | 'new'
let routesFlavour = null; // 'legacy' | 'new'

/* -------------------------------------------------------------------------- */
/* Key + diagnostics                                                          */
/* -------------------------------------------------------------------------- */

export const redactKey = (key = GOOGLE_MAPS_API_KEY) => {
  if (!key) return '<MISSING>';
  if (key.length <= 12) return `${key.slice(0, 4)}...`;
  return `${key.slice(0, 8)}...${key.slice(-4)} (len ${key.length})`;
};

export const hasApiKey = () => Boolean(GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.trim());

let keyLogged = false;
const logKeyOnce = () => {
  if (keyLogged) return;
  keyLogged = true;
  if (!hasApiKey()) {
    console.error(
      '[Maps] GOOGLE_MAPS_API_KEY is EMPTY. Set it in app/src/config/constants.js — ' +
        'every Maps request will fail until you do.'
    );
  } else {
    console.log(`[Maps] Using Google Maps API key ${redactKey()}`);
  }
};

// Turns a Google error into "is this my code, or my Cloud Console?"
const diagnose = (status, message = '') => {
  const m = String(message);
  if (/has not been used in project|is disabled|SERVICE_DISABLED|not activated on your API project|legacy API, which is not enabled/i.test(m)) {
    return {
      kind: 'API_NOT_ENABLED',
      hint: 'CLOUD CONSOLE FIX: this API is not enabled on the project that owns this key. Enable it in APIs & Services > Library.',
    };
  }
  if (/must enable Billing|billing/i.test(m)) {
    return {
      kind: 'BILLING_DISABLED',
      hint: 'CLOUD CONSOLE FIX: billing is not enabled on this Cloud project. Maps Platform requires an active billing account.',
    };
  }
  if (/API_KEY_SERVICE_BLOCKED|blocked|not authorized to use this API/i.test(m)) {
    return {
      kind: 'KEY_API_RESTRICTION',
      hint: 'CLOUD CONSOLE FIX: this key has an API restriction that excludes this API. Edit the key > API restrictions > add this API.',
    };
  }
  if (/API_KEY_HTTP_REFERRER_BLOCKED|referer|referrer/i.test(m)) {
    return {
      kind: 'KEY_REFERRER_RESTRICTION',
      hint: 'CLOUD CONSOLE FIX: this key is restricted to HTTP referrers, which a mobile app cannot send. Use an unrestricted key or an Android/iOS app restriction.',
    };
  }
  if (/API_KEY_ANDROID_APP_BLOCKED|API_KEY_IOS_APP_BLOCKED|android|ios app/i.test(m)) {
    return {
      kind: 'KEY_APP_RESTRICTION',
      hint: 'CLOUD CONSOLE FIX: this key is restricted to specific app package names / SHA-1 fingerprints that do not match this build. Web-service calls (Places/Directions REST) cannot pass an app restriction at all — use a separate unrestricted key for them.',
    };
  }
  if (status === 'OVER_QUERY_LIMIT') {
    return { kind: 'QUOTA', hint: 'CLOUD CONSOLE FIX: quota exceeded or billing cap hit.' };
  }
  if (status === 'ZERO_RESULTS') {
    return { kind: 'ZERO_RESULTS', hint: 'No results for this query — not an error.' };
  }
  return { kind: 'UNKNOWN', hint: '' };
};

// Logs the raw Google payload plus the diagnosis. Returns the diagnosis so
// callers can decide whether falling back to the other API flavour is worth it.
const logGoogleFailure = (label, raw) => {
  const status = raw?.status || raw?.error?.status || 'UNKNOWN';
  const message = raw?.error_message || raw?.error?.message || '';
  const d = diagnose(status, message);

  if (d.kind === 'ZERO_RESULTS') {
    console.log(`[Maps] ${label}: ZERO_RESULTS`);
    return d;
  }

  console.error(
    `[Maps] ${label} FAILED\n` +
      `  status : ${status}\n` +
      `  message: ${message || '(none)'}\n` +
      `  key    : ${redactKey()}\n` +
      `  cause  : ${d.kind}${d.hint ? `\n  ACTION : ${d.hint}` : ''}\n` +
      `  raw    : ${JSON.stringify(raw).slice(0, 800)}`
  );
  return d;
};

// A disabled/blocked API is worth retrying on the other flavour; a bad query is not.
const shouldTryOtherFlavour = (d) =>
  ['API_NOT_ENABLED', 'KEY_API_RESTRICTION', 'BILLING_DISABLED', 'UNKNOWN'].includes(d.kind);

/* -------------------------------------------------------------------------- */
/* Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

// Google's encoded polyline algorithm -> [{latitude, longitude}]
export const decodePolyline = (encoded, precision = 5) => {
  if (!encoded || typeof encoded !== 'string') return [];
  const factor = Math.pow(10, precision);
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / factor, longitude: lng / factor });
  }
  return points;
};

const toRad = (v) => (v * Math.PI) / 180;

export const haversineKm = (a, b) => {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

export const formatDistance = (km) =>
  km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

export const formatDuration = (minutes) => {
  if (minutes == null) return null;
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
};

/* -------------------------------------------------------------------------- */
/* Places — autocomplete                                                      */
/* -------------------------------------------------------------------------- */

const autocompleteLegacy = async (input, sessionToken) => {
  const url =
    `${LEGACY_BASE}/place/autocomplete/json?input=${encodeURIComponent(input)}` +
    `&components=country:${REGION_CODE}` +
    (sessionToken ? `&sessiontoken=${sessionToken}` : '') +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const raw = await (await fetch(url)).json();
  if (raw.status === 'OK') {
    return {
      ok: true,
      predictions: (raw.predictions || []).map((p) => ({
        placeId: p.place_id,
        description: p.description,
        primaryText: p.structured_formatting?.main_text || p.description,
        secondaryText: p.structured_formatting?.secondary_text || '',
      })),
    };
  }
  if (raw.status === 'ZERO_RESULTS') return { ok: true, predictions: [] };
  return { ok: false, diagnosis: logGoogleFailure('Places autocomplete (legacy)', raw) };
};

const autocompleteNew = async (input, sessionToken) => {
  const res = await fetch(`${PLACES_NEW_BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY },
    body: JSON.stringify({
      input,
      includedRegionCodes: [REGION_CODE],
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  const raw = await res.json();
  if (res.ok && !raw.error) {
    return {
      ok: true,
      predictions: (raw.suggestions || [])
        .filter((s) => s.placePrediction)
        .map((s) => ({
          placeId: s.placePrediction.placeId,
          description: s.placePrediction.text?.text || '',
          primaryText:
            s.placePrediction.structuredFormat?.mainText?.text ||
            s.placePrediction.text?.text ||
            '',
          secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || '',
        })),
    };
  }
  return { ok: false, diagnosis: logGoogleFailure('Places autocomplete (New)', raw) };
};

export const autocompletePlaces = async (input, sessionToken) => {
  logKeyOnce();
  if (!hasApiKey() || !input?.trim()) return [];

  const order =
    placesFlavour === 'new' ? ['new', 'legacy'] : placesFlavour === 'legacy' ? ['legacy', 'new'] : ['legacy', 'new'];

  let lastDiagnosis = null;
  for (const flavour of order) {
    const result =
      flavour === 'legacy'
        ? await autocompleteLegacy(input, sessionToken)
        : await autocompleteNew(input, sessionToken);

    if (result.ok) {
      if (placesFlavour !== flavour) {
        console.log(`[Maps] Places API flavour locked to "${flavour}" for this session.`);
        placesFlavour = flavour;
      }
      return result.predictions;
    }
    lastDiagnosis = result.diagnosis;
    if (!shouldTryOtherFlavour(result.diagnosis)) break;
  }

  if (lastDiagnosis?.hint) {
    console.error(`[Maps] Autocomplete unavailable on BOTH Places flavours. ${lastDiagnosis.hint}`);
  }
  return [];
};

/* -------------------------------------------------------------------------- */
/* Places — details                                                           */
/* -------------------------------------------------------------------------- */

const normalizeDetails = ({ address, lat, lng, placeId, name }) => ({
  placeId,
  name,
  address,
  location: { lat, lng },
  // Legacy-shaped alias so existing `details.geometry.location` consumers keep working.
  geometry: { location: { lat, lng } },
});

const placeDetailsLegacy = async (placeId, sessionToken) => {
  const url =
    `${LEGACY_BASE}/place/details/json?place_id=${encodeURIComponent(placeId)}` +
    `&fields=place_id,name,formatted_address,geometry` +
    (sessionToken ? `&sessiontoken=${sessionToken}` : '') +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const raw = await (await fetch(url)).json();
  if (raw.status === 'OK' && raw.result) {
    const loc = raw.result.geometry?.location || {};
    return {
      ok: true,
      details: normalizeDetails({
        placeId: raw.result.place_id || placeId,
        name: raw.result.name,
        address: raw.result.formatted_address,
        lat: loc.lat,
        lng: loc.lng,
      }),
    };
  }
  return { ok: false, diagnosis: logGoogleFailure('Place details (legacy)', raw) };
};

const placeDetailsNew = async (placeId) => {
  const res = await fetch(`${PLACES_NEW_BASE}/places/${encodeURIComponent(placeId)}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
    },
  });
  const raw = await res.json();
  if (res.ok && raw.id) {
    return {
      ok: true,
      details: normalizeDetails({
        placeId: raw.id,
        name: raw.displayName?.text,
        address: raw.formattedAddress,
        lat: raw.location?.latitude,
        lng: raw.location?.longitude,
      }),
    };
  }
  return { ok: false, diagnosis: logGoogleFailure('Place details (New)', raw) };
};

export const getPlaceDetails = async (placeId, sessionToken) => {
  logKeyOnce();
  if (!hasApiKey() || !placeId) return null;

  const order = placesFlavour === 'new' ? ['new', 'legacy'] : ['legacy', 'new'];

  for (const flavour of order) {
    const result =
      flavour === 'legacy'
        ? await placeDetailsLegacy(placeId, sessionToken)
        : await placeDetailsNew(placeId);
    if (result.ok) {
      placesFlavour = flavour;
      return result.details;
    }
    if (!shouldTryOtherFlavour(result.diagnosis)) break;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* Geocoding                                                                  */
/* -------------------------------------------------------------------------- */

// Geocoding API is a separate SKU that is often left disabled. When it is, we
// fall back to Places Text Search / Find Place, which returns the same geometry.
export const geocodeAddress = async (address) => {
  logKeyOnce();
  if (!hasApiKey() || !address?.trim()) return null;

  const raw = await (
    await fetch(
      `${LEGACY_BASE}/geocode/json?address=${encodeURIComponent(address)}&region=${REGION_CODE}&key=${GOOGLE_MAPS_API_KEY}`
    )
  ).json();

  if (raw.status === 'OK' && raw.results?.length) {
    const r = raw.results[0];
    return {
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formattedAddress: r.formatted_address,
      placeId: r.place_id,
    };
  }
  logGoogleFailure('Geocoding', raw);

  // Fallback: Find Place From Text (Places SKU).
  const fpRaw = await (
    await fetch(
      `${LEGACY_BASE}/place/findplacefromtext/json?input=${encodeURIComponent(address)}` +
        `&inputtype=textquery&fields=place_id,formatted_address,geometry&key=${GOOGLE_MAPS_API_KEY}`
    )
  ).json();

  if (fpRaw.status === 'OK' && fpRaw.candidates?.length) {
    const c = fpRaw.candidates[0];
    console.log('[Maps] Geocoding unavailable — served from Places Find Place fallback.');
    return {
      lat: c.geometry.location.lat,
      lng: c.geometry.location.lng,
      formattedAddress: c.formatted_address,
      placeId: c.place_id,
    };
  }
  logGoogleFailure('Find Place fallback', fpRaw);
  return null;
};

export const reverseGeocode = async (lat, lng) => {
  logKeyOnce();
  if (!hasApiKey()) return null;

  const raw = await (
    await fetch(`${LEGACY_BASE}/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`)
  ).json();

  if (raw.status === 'OK' && raw.results?.length) {
    return {
      address: raw.results[0].formatted_address,
      placeId: raw.results[0].place_id,
      components: raw.results[0].address_components,
    };
  }
  logGoogleFailure('Reverse geocoding', raw);
  return null;
};

/* -------------------------------------------------------------------------- */
/* Directions / Routes                                                        */
/* -------------------------------------------------------------------------- */

const asLatLng = (p) => {
  if (!p) return null;
  // Accepts {latitude,longitude}, {lat,lng}, GeoJSON {location:{coordinates:[lng,lat]}}, [lng,lat]
  if (Array.isArray(p) && p.length === 2) return { latitude: p[1], longitude: p[0] };
  if (p.location?.coordinates?.length === 2) {
    return { latitude: p.location.coordinates[1], longitude: p.location.coordinates[0] };
  }
  if (p.coordinates?.length === 2) return { latitude: p.coordinates[1], longitude: p.coordinates[0] };
  if (typeof p.latitude === 'number') return { latitude: p.latitude, longitude: p.longitude };
  if (typeof p.lat === 'number') return { latitude: p.lat, longitude: p.lng };
  return null;
};

const buildRouteResult = ({ coordinates, distanceKm, durationMin, source, isFallback = false }) => ({
  coordinates,
  distanceKm,
  durationMin,
  distanceText: formatDistance(distanceKm),
  durationText: formatDuration(durationMin),
  source,
  isFallback,
});

// Straight line + average city speed. Keeps the map and the ETA populated when
// Directions/Routes are unavailable, and flags itself so the UI can say "approx".
const straightLineRoute = (origin, destination, waypoints) => {
  const chain = [origin, ...waypoints, destination];
  let km = 0;
  for (let i = 1; i < chain.length; i++) km += haversineKm(chain[i - 1], chain[i]);
  const roadKm = km * 1.3; // roads are not straight
  const avgSpeedKmh = 25;
  return buildRouteResult({
    coordinates: chain,
    distanceKm: roadKm,
    durationMin: (roadKm / avgSpeedKmh) * 60,
    source: 'estimate',
    isFallback: true,
  });
};

const directionsLegacy = async (origin, destination, waypoints) => {
  const wp = waypoints.length
    ? `&waypoints=${waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|')}`
    : '';

  const url =
    `${LEGACY_BASE}/directions/json?origin=${origin.latitude},${origin.longitude}` +
    `&destination=${destination.latitude},${destination.longitude}${wp}` +
    `&mode=driving&alternatives=true&departure_time=now&region=${REGION_CODE}` +
    `&key=${GOOGLE_MAPS_API_KEY}`;

  const raw = await (await fetch(url)).json();

  if (raw.status === 'OK' && raw.routes?.length) {
    // Google returns the recommended route first, but with alternatives=true we
    // can do better: pick the one with the lowest traffic-aware duration.
    const scored = raw.routes.map((route) => {
      const legs = route.legs || [];
      const seconds = legs.reduce(
        (sum, l) => sum + (l.duration_in_traffic?.value ?? l.duration?.value ?? 0),
        0
      );
      const meters = legs.reduce((sum, l) => sum + (l.distance?.value ?? 0), 0);
      return { route, seconds, meters };
    });
    const best = scored.reduce((a, b) => (b.seconds && b.seconds < a.seconds ? b : a), scored[0]);

    const coordinates = decodePolyline(best.route.overview_polyline?.points);
    if (coordinates.length) {
      return {
        ok: true,
        result: buildRouteResult({
          coordinates,
          distanceKm: best.meters / 1000,
          durationMin: best.seconds / 60,
          source: 'directions-legacy',
        }),
      };
    }
  }
  return { ok: false, diagnosis: logGoogleFailure('Directions (legacy)', raw) };
};

const directionsNew = async (origin, destination, waypoints) => {
  const toWaypoint = (p) => ({ location: { latLng: { latitude: p.latitude, longitude: p.longitude } } });

  const res = await fetch(ROUTES_NEW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask':
        'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: toWaypoint(origin),
      destination: toWaypoint(destination),
      ...(waypoints.length ? { intermediates: waypoints.map(toWaypoint) } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      polylineQuality: 'HIGH_QUALITY',
      computeAlternativeRoutes: false, // Routes API already returns the best first
      languageCode: 'en',
      regionCode: REGION_CODE.toUpperCase(),
    }),
  });
  const raw = await res.json();

  if (res.ok && !raw.error && raw.routes?.length) {
    const route = raw.routes[0];
    const coordinates = decodePolyline(route.polyline?.encodedPolyline);
    if (coordinates.length) {
      return {
        ok: true,
        result: buildRouteResult({
          coordinates,
          distanceKm: (route.distanceMeters || 0) / 1000,
          durationMin: parseFloat(String(route.duration || '0').replace('s', '')) / 60,
          source: 'routes-new',
        }),
      };
    }
  }
  return { ok: false, diagnosis: logGoogleFailure('Routes API (New)', raw) };
};

/**
 * Best driving route between two points, with optional stops.
 * Always resolves — never throws — so callers can render unconditionally.
 * Check `.isFallback` to know whether the geometry is a real road route.
 *
 * @returns {Promise<{coordinates, distanceKm, durationMin, distanceText, durationText, source, isFallback}>}
 */
export const getDirections = async (originInput, destinationInput, waypointsInput = []) => {
  logKeyOnce();

  const origin = asLatLng(originInput);
  const destination = asLatLng(destinationInput);
  const waypoints = (waypointsInput || []).map(asLatLng).filter(Boolean);

  if (!origin || !destination) return null;
  if (!hasApiKey()) return straightLineRoute(origin, destination, waypoints);

  const order = routesFlavour === 'new' ? ['new', 'legacy'] : ['legacy', 'new'];

  let lastDiagnosis = null;
  for (const flavour of order) {
    const attempt =
      flavour === 'legacy'
        ? await directionsLegacy(origin, destination, waypoints)
        : await directionsNew(origin, destination, waypoints);

    if (attempt.ok) {
      if (routesFlavour !== flavour) {
        console.log(`[Maps] Directions flavour locked to "${flavour}" for this session.`);
        routesFlavour = flavour;
      }
      return attempt.result;
    }
    lastDiagnosis = attempt.diagnosis;
    if (!shouldTryOtherFlavour(attempt.diagnosis)) break;
  }

  console.warn(
    '[Maps] No road route available from either Directions (legacy) or Routes API (New) — ' +
      'falling back to a straight-line estimate. ' +
      (lastDiagnosis?.hint || 'Enable one of those APIs to get real routes and ETAs.')
  );
  return straightLineRoute(origin, destination, waypoints);
};

export default {
  autocompletePlaces,
  getPlaceDetails,
  geocodeAddress,
  reverseGeocode,
  getDirections,
  decodePolyline,
  haversineKm,
  formatDistance,
  formatDuration,
  redactKey,
  hasApiKey,
};
