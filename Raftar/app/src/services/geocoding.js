// src/services/geocoding.js
//
// Thin compatibility wrapper over services/maps.js. All the endpoint selection,
// legacy/new fallback and error diagnosis lives there; this file only preserves
// the older call signatures used around the app.

import maps from './maps';

class GeocodingService {
  async geocodeAddress(address) {
    const result = await maps.geocodeAddress(address);
    if (!result) throw new Error('Address not found');
    return result;
  }

  async reverseGeocode(lat, lng) {
    const result = await maps.reverseGeocode(lat, lng);
    if (!result) throw new Error('Location not found');
    return result;
  }

  async getAutocompleteSuggestions(input) {
    const predictions = await maps.autocompletePlaces(input);
    return predictions.map((p) => ({
      id: p.placeId,
      description: p.description,
      placeId: p.placeId,
      primaryText: p.primaryText,
      secondaryText: p.secondaryText,
    }));
  }

  async getPlaceDetails(placeId) {
    const details = await maps.getPlaceDetails(placeId);
    if (!details) throw new Error('Place not found');
    return {
      address: details.address,
      location: details.location,
      name: details.name,
      placeId: details.placeId,
    };
  }

  /**
   * Driving distance + duration between two {lat, lng} points.
   * Falls back to a straight-line estimate (flagged via `isEstimate`) when the
   * Directions/Routes APIs are unavailable, so callers always get a number.
   */
  async calculateDistance(origin, destination) {
    const route = await maps.getDirections(origin, destination);
    if (!route) throw new Error('Distance calculation failed');
    return {
      distance: route.distanceKm,
      duration: route.durationMin,
      distanceText: route.distanceText,
      durationText: route.durationText,
      isEstimate: route.isFallback,
    };
  }
}

export default new GeocodingService();
