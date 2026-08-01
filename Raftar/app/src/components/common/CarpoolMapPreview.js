import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { getDirections } from '../../services/maps';

const CarpoolMapPreview = ({ pickup, dropoff, style }) => {
  const [routeCoords, setRouteCoords] = useState([]);
  const mapRef = useRef(null);

  const pLoc = pickup?.location?.coordinates || [0,0];
  const dLoc = dropoff?.location?.coordinates || [0,0];
  
  const region = {
    latitude: (pLoc[1] + dLoc[1]) / 2,
    longitude: (pLoc[0] + dLoc[0]) / 2,
    latitudeDelta: Math.abs(pLoc[1] - dLoc[1]) * 1.5 || 0.05,
    longitudeDelta: Math.abs(pLoc[0] - dLoc[0]) * 1.5 || 0.05,
  };

  useEffect(() => {
    const fetchRoute = async () => {
      if (!pLoc[0] || !dLoc[0]) return;

      const route = await getDirections(pickup, dropoff);
      if (!route?.coordinates?.length) return;

      setRouteCoords(route.coordinates);
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(route.coordinates, {
          edgePadding: { top: 30, right: 30, bottom: 30, left: 30 },
          animated: true,
        });
      }
    };

    fetchRoute();
  }, [pickup, dropoff]);

  if (!pLoc[1] || !dLoc[1]) {
    return (
      <View style={[styles.container, style, styles.center]}>
        <ActivityIndicator color="#FFD700" />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <MapView 
        ref={mapRef}
        style={styles.map} 
        initialRegion={region} 
        scrollEnabled={true} 
        zoomEnabled={true}
        pitchEnabled={false}
      >
        <Marker coordinate={{ latitude: pLoc[1], longitude: pLoc[0] }} pinColor="#4ECDC4" title="Pickup" />
        <Marker coordinate={{ latitude: dLoc[1], longitude: dLoc[0] }} pinColor="#FF6B6B" title="Dropoff" />
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={3}
            strokeColor="#4ECDC4"
          />
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%'
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A2A'
  }
});

export default CarpoolMapPreview;
