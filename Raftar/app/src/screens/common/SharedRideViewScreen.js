import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Dimensions
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { io } from 'socket.io-client';
import axios from 'axios';
import { API_URL, GOOGLE_MAPS_API_KEY } from '../../config/constants';
import { getDirections } from '../../services/maps';

const { width } = Dimensions.get('window');

const SharedRideViewScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const route = useRoute();
  const navigation = useNavigation();
  const { token } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ride, setRide] = useState(null);
  
  const [driverLocation, setDriverLocation] = useState(null);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  
  const socketRef = useRef(null);

  useEffect(() => {
    fetchSharedRide();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [token]);

  useEffect(() => {
    if (ride && (ride.status === 'accepted' || ride.status === 'started')) {
      fetchRoute();
      connectSocket();
    }
  }, [ride]);

  const fetchSharedRide = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/rides/shared/${token}`);
      if (response.data.success) {
        setRide(response.data.ride);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load ride details');
      if (err.response?.status === 410) {
        Alert.alert('Ride Ended', 'This ride has already been completed or cancelled.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = () => {
    if (!socketRef.current) {
      socketRef.current = io(API_URL, {
        transports: ['websocket'],
        reconnection: true
      });

      socketRef.current.on('connect', () => {
        console.log('Shared viewer connected to socket');
        socketRef.current.emit('join-shared-ride', token);
      });

      socketRef.current.on('driver-location', (data) => {
        setDriverLocation(data.location);
      });

      socketRef.current.on('passenger-location', (data) => {
        setPassengerLocation(data.location);
      });

      socketRef.current.on('ride-completed', () => {
        Alert.alert('Ride Completed', 'This ride has been completed.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      });

      socketRef.current.on('ride-cancelled', () => {
        Alert.alert('Ride Cancelled', 'This ride has been cancelled.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      });

      socketRef.current.on('error', (msg) => {
        console.error('Socket error:', msg);
        Alert.alert('Connection Error', msg);
      });
    }
  };

  const fetchRoute = async () => {
    if (!ride?.pickup?.location?.coordinates || !ride?.dropoff?.location?.coordinates) return;

    const route = await getDirections(ride.pickup, ride.dropoff, ride.waypoints || []);
    if (!route) return;

    setRouteCoords(route.coordinates);
    setRouteInfo({
      distanceText: route.distanceText,
      durationText: route.durationText,
      isEstimate: route.isFallback,
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading Ride Details...</Text>
      </View>
    );
  }

  if (error || !ride) {
    return (
      <View style={styles.loadingContainer}>
        <Icon name="error-outline" size={48} color="#FF6B6B" />
        <Text style={styles.errorText}>{error || 'Ride not found'}</Text>
      </View>
    );
  }

  const pickupCoords = {
    latitude: ride.pickup.location.coordinates[1],
    longitude: ride.pickup.location.coordinates[0]
  };

  const dropoffCoords = {
    latitude: ride.dropoff.location.coordinates[1],
    longitude: ride.dropoff.location.coordinates[0]
  };

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          ...pickupCoords,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        <Marker coordinate={pickupCoords} title="Pickup">
          <View style={[styles.markerContainer, { backgroundColor: '#4ECDC4' }]}>
            <Icon name="my-location" size={16} color="#FFF" />
          </View>
        </Marker>

        <Marker coordinate={dropoffCoords} title="Dropoff">
          <View style={[styles.markerContainer, { backgroundColor: '#FF6B6B' }]}>
            <Icon name="flag" size={16} color="#FFF" />
          </View>
        </Marker>

        {driverLocation && (
          <Marker coordinate={driverLocation} title="Driver">
            <View style={styles.vehicleMarker}>
              <Icon name="directions-car" size={20} color={colors.accent} />
            </View>
          </Marker>
        )}

        {passengerLocation && (
          <Marker coordinate={passengerLocation} title="Passenger">
            <View style={[styles.vehicleMarker, { backgroundColor: '#4ECDC4' }]}>
              <Icon name="person" size={20} color="#FFF" />
            </View>
          </Marker>
        )}

        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={4}
            strokeColor="#4ECDC4"
          />
        )}
      </MapView>

      <View style={styles.rideInfoCard}>
        <View style={styles.rideInfoHeader}>
          <View>
            <Text style={styles.rideStatus}>LIVE: RIDE IN PROGRESS</Text>
            <Text style={styles.rideFare}>Rs. {ride.fare?.accepted || ride.fare?.offered}</Text>
          </View>
        </View>

        {ride.driver && (
          <View style={styles.driverInfoContainer}>
            <View style={styles.driverInfoHeader}>
              <View style={styles.driverAvatar}>
                <Text style={styles.driverAvatarText}>{ride.driver.name?.charAt(0) || 'D'}</Text>
              </View>
              <View style={styles.driverDetailsText}>
                <Text style={styles.driverName}>{ride.driver.name}</Text>
                <View style={styles.ratingContainer}>
                  <Icon name="star" size={14} color={colors.accent} />
                  <Text style={styles.driverRating}>{ride.driver.rating || '5.0'}</Text>
                </View>
              </View>
            </View>
            <View style={styles.vehicleDetailsRow}>
              <Icon name="directions-car" size={16} color={colors.textSecondary} />
              <Text style={styles.vehicleDetailsText}>
                {ride.driver.vehicleDetails?.color || ''} {ride.driver.vehicleDetails?.brand || ''} {ride.driver.vehicleDetails?.model || 'Vehicle'} • {ride.driver.vehicleDetails?.plateNumber || 'N/A'}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.routeDetails}>
          <View style={styles.detailRow}>
            <Icon name="location-on" size={20} color="#4ECDC4" />
            <Text style={styles.detailText} numberOfLines={1}>{ride.pickup?.address}</Text>
          </View>
          <View style={styles.detailRow}>
            <Icon name="flag" size={20} color="#FF6B6B" />
            <Text style={styles.detailText} numberOfLines={1}>{ride.dropoff?.address}</Text>
          </View>
          {routeInfo && (
            <View style={styles.detailRow}>
              <Icon name="schedule" size={20} color={colors.textSecondary} />
              <Text style={styles.detailText} numberOfLines={1}>
                {`${routeInfo.durationText} · ${routeInfo.distanceText}`}
                {routeInfo.isEstimate ? ' (approx.)' : ''}
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => {
  const cardBg = isDark ? colors.card : '#FFFFFF';
  const insetBg = isDark ? colors.cardElevated : '#F5F5F5';
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: '#FF6B6B',
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  vehicleMarker: {
    backgroundColor: colors.card,
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  rideInfoCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 5.84,
    elevation: 5,
  },
  rideInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  rideStatus: {
    color: '#4ECDC4',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  rideFare: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  driverInfoContainer: {
    backgroundColor: colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    marginBottom: 15,
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  driverAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.cardElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverAvatarText: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: 'bold',
  },
  driverDetailsText: {
    flex: 1,
  },
  driverName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: colors.textSecondary,
    fontSize: 14,
    marginLeft: 4,
  },
  vehicleDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  vehicleDetailsText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginLeft: 8,
  },
  routeDetails: {
    backgroundColor: colors.cardElevated,
    borderRadius: 16,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  detailText: {
    color: '#FFF',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  });
};

export default SharedRideViewScreen;
