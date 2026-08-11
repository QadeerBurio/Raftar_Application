import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  SafeAreaView,
  StatusBar,
  Image,
  Dimensions,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import { startRide, completeRide, cancelRide } from '../../redux/slices/driverSlice';
import { sendChatMessage } from '../../redux/slices/rideSlice';
import { API_URL, GOOGLE_MAPS_API_KEY, VOIP_CALLING_ENABLED } from '../../config/constants';
import { getDirections } from '../../services/maps';
import RatingComponent from '../../components/common/RatingComponent';
import TurnByTurnComponent from '../../components/common/TurnByTurnComponent';
import MapControls from '../../components/common/MapControls';
import { useSocket } from '../../context/SocketContext';
import CallService from '../../services/CallService';

const SIMULATE_NAVIGATION = true;

const { width, height } = Dimensions.get('window');

// Yellow Theme Colors
const getThemePalette = (colors, isDark) => ({
  YELLOW_PRIMARY: colors.accent,
  YELLOW_SECONDARY: colors.accent,
  WHITE: isDark ? colors.card : '#FFFFFF',
  BLACK: colors.text,
  GRAY_DARK: colors.text,
  GRAY_MEDIUM: colors.textSecondary,
  GRAY_LIGHT: isDark ? colors.cardElevated : '#F5F5F5',
  GRAY_BG: colors.background,
});

const ActiveRideScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const { ride } = route.params;
  const socket = useSocket();

  const [location, setLocation] = useState(null);
  const [driverToPickupCoords, setDriverToPickupCoords] = useState([]);
  const [pickupToDropoffCoords, setPickupToDropoffCoords] = useState([]);
  const [distanceToPickup, setDistanceToPickup] = useState(null);
  const [pickupEta, setPickupEta] = useState(null);
  const [tripEta, setTripEta] = useState(null);
  const [rideState, setRideState] = useState(ride?.status === 'searching' ? 'pending' : (ride?.status || 'accepted'));
  const [loading, setLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [stopState, setStopState] = useState('heading'); // 'heading' or 'arrived'
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(ride?.chat || []);
  
  // Navigation State
  const [heading, setHeading] = useState(0);
  const [simStep, setSimStep] = useState(0);
  const [turnInstruction, setTurnInstruction] = useState('Head straight towards route');
  
  const { user } = useSelector(state => state.auth);

  const mapRef = useRef(null);
  const locationInterval = useRef(null);

  useEffect(() => {
    if (VOIP_CALLING_ENABLED && socket) {
      CallService.init(socket);
    }
  }, [socket]);

  useEffect(() => {
    if (ride?.status && ride.status !== 'searching') {
      setRideState(ride.status);
    }
  }, [ride]);

  useEffect(() => {
    setupLocationAndSocket();
    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, [socket]);

  const setupLocationAndSocket = async () => {
    if (socket) {
      socket.emit('join-ride', ride._id);
    }

    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission to access location was denied');
      return;
    }

    let lastLoc = await Location.getLastKnownPositionAsync({});
    if (lastLoc) {
      setLocation(lastLoc.coords);
      fetchRoutes(lastLoc.coords);
    }

    let loc = await Location.getCurrentPositionAsync({});
    setLocation(loc.coords);
    if (!lastLoc) {
      fetchRoutes(loc.coords);
    }

    locationInterval.current = setInterval(async () => {
      try {
        if (SIMULATE_NAVIGATION) return; // Skip real GPS updates if simulating
        const currentLoc = await Location.getCurrentPositionAsync({});
        setLocation(currentLoc.coords);
        if (socket) {
          socket.emit('driver-location', {
            rideId: ride._id,
            location: {
              latitude: currentLoc.coords.latitude,
              longitude: currentLoc.coords.longitude,
            }
          });
        }
      } catch (err) {
        console.log('Location interval error:', err);
      }
    }, 5000);
  };

  useEffect(() => {
    setSimStep(0);
    setTurnInstruction('Follow the route');
  }, [rideState]);

  // Simulation Effect
  useEffect(() => {
    if (!SIMULATE_NAVIGATION) return;
    
    let path = [];
    if (rideState === 'accepted' || rideState === 'pending') {
      path = driverToPickupCoords;
    } else if (rideState === 'started') {
      path = pickupToDropoffCoords;
    }
    
    if (path.length > 0) {
      const simTimer = setInterval(() => {
        setSimStep(prev => {
          const nextStep = prev + 1;
          if (nextStep < path.length) {
            const currentPoint = path[prev];
            const nextPoint = path[nextStep];
            
            // Calculate heading
            const dy = nextPoint.latitude - currentPoint.latitude;
            const dx = nextPoint.longitude - currentPoint.longitude;
            let newHeading = (Math.atan2(dy, Math.cos(currentPoint.latitude * Math.PI / 180) * dx) * 180) / Math.PI;
            
            // Normalize heading
            newHeading = (newHeading + 360) % 360;

            setLocation({
              latitude: currentPoint.latitude,
              longitude: currentPoint.longitude,
            });
            setHeading(newHeading);
            
            // Generate mock turn instruction
            if (nextStep % 15 === 0) {
              const directions = ['Turn left in 200m', 'Turn right on Main St', 'Keep straight', 'Destination on the right'];
              setTurnInstruction(directions[Math.floor(Math.random() * directions.length)]);
            }
            
            if (socket) {
              socket.emit('driver-location', {
                rideId: ride._id,
                location: { latitude: currentPoint.latitude, longitude: currentPoint.longitude, heading: newHeading }
              });
            }
            
            // Animate map camera to follow
            if (mapRef.current) {
               mapRef.current.animateCamera({
                 center: { latitude: currentPoint.latitude, longitude: currentPoint.longitude },
                 heading: newHeading,
                 pitch: 45,
                 altitude: 500,
                 zoom: 17
               }, { duration: 2000 });
            }
            
            return nextStep;
          } else {
             setTurnInstruction(rideState === 'started' ? 'Arriving at destination' : 'Arriving at pickup');
             clearInterval(simTimer);
             return prev;
          }
        });
      }, 2000);
      return () => clearInterval(simTimer);
    }
  }, [driverToPickupCoords, pickupToDropoffCoords, rideState]);

  useEffect(() => {
    const handleBidAccepted = (data) => {
      if (data.rideId === ride._id) {
        Alert.alert('Success', 'Passenger accepted your offer!');
        setRideState('accepted');
      }
    };

    const handleRideCancelled = (data) => {
      if (data.rideId === ride._id) {
        Alert.alert('Ride Cancelled', 'The passenger has cancelled this ride.');
        navigation.reset({
          index: 0,
          routes: [{ name: 'DriverHome' }],
        });
      }
    };

    const handleNewMessage = (data) => {
      if (data.senderId !== user.id) {
        setMessages(prev => [...prev, data]);
      }
    };

    const handlePassengerComing = () => {
      Alert.alert('Passenger is coming', 'The passenger has acknowledged your arrival and is on their way out.');
    };

    if (socket) {
      socket.on('bid-accepted', handleBidAccepted);
      socket.on('ride-cancelled', handleRideCancelled);
      socket.on('new-message', handleNewMessage);
      socket.on('passenger-coming', handlePassengerComing);
    }

    return () => {
      if (socket) {
        socket.off('bid-accepted', handleBidAccepted);
        socket.off('ride-cancelled', handleRideCancelled);
        socket.off('new-message', handleNewMessage);
        socket.off('passenger-coming', handlePassengerComing);
      }
    };
  }, [socket, ride._id]);

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const fetchRoutes = async (drvLoc) => {
    if (!ride.pickup?.location?.coordinates || !ride.dropoff?.location?.coordinates) return;

    const [startLng, startLat] = ride.pickup.location.coordinates;
    const drvLat = drvLoc.latitude;
    const drvLng = drvLoc.longitude;

    setDistanceToPickup(getDistance(drvLat, drvLng, startLat, startLng));

    // Leg 1: driver -> pickup. Leg 2: pickup -> dropoff (via any stops).
    const [toPickup, toDropoff] = await Promise.all([
      getDirections(drvLoc, ride.pickup),
      getDirections(ride.pickup, ride.dropoff, ride.waypoints || []),
    ]);

    if (toPickup) {
      setDriverToPickupCoords(toPickup.coordinates);
      setPickupEta({ durationText: toPickup.durationText, distanceText: toPickup.distanceText });
      if (mapRef.current && rideState === 'accepted' && toPickup.coordinates.length) {
        mapRef.current.fitToCoordinates(toPickup.coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
    }

    if (toDropoff) {
      setPickupToDropoffCoords(toDropoff.coordinates);
      setTripEta({ durationText: toDropoff.durationText, distanceText: toDropoff.distanceText });
    }
  };

  const handleStatusAction = async () => {
    if (rideState === 'accepted') {
      if (distanceToPickup && distanceToPickup > 200) {
        Alert.alert(
          'Confirm Arrival',
          'You are more than 200m away from the pickup location. Are you sure you have arrived?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Arrived', onPress: () => {
                setRideState('arrived');
                if (socket) {
                  socket.emit('driver-arrived', { rideId: ride._id });
                }
              }
            }
          ]
        );
      } else {
        setRideState('arrived');
        if (socket) {
          socket.emit('driver-arrived', { rideId: ride._id });
        }
      }
    } else if (rideState === 'arrived') {
      setLoading(true);
      try {
        await dispatch(startRide(ride._id)).unwrap();
        setRideState('started');
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to start ride');
      } finally {
        setLoading(false);
      }
    } else if (rideState === 'started') {
      const hasStops = ride.waypoints && ride.waypoints.length > 0;
      if (hasStops && currentStopIndex < ride.waypoints.length) {
        if (stopState === 'heading') {
          setStopState('arrived');
        } else {
          setStopState('heading');
          setCurrentStopIndex(prev => prev + 1);
        }
      } else {
        setLoading(true);
        try {
          await dispatch(completeRide(ride._id)).unwrap();
          setRideState('completed');
          if (locationInterval.current) clearInterval(locationInterval.current);
        } catch (err) {
          Alert.alert('Error', err.message || 'Failed to complete ride');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await dispatch(cancelRide(ride._id)).unwrap();
              navigation.reset({
                index: 0,
                routes: [{ name: 'DriverHome' }],
              });
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to cancel ride');
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    const msg = {
      rideId: ride._id,
      senderId: user.id,
      message: message.trim(),
      type: 'text',
      timestamp: new Date()
    };
    await dispatch(sendChatMessage(msg));
    setMessages(prev => [...prev, msg]);
    setMessage('');
  };

  const getRideStatusText = () => {
    switch (rideState) {
      case 'pending': return 'Waiting for Passenger...';
      case 'accepted': return 'Heading to Pickup';
      case 'arrived': return ride.type === 'parcel' ? 'Pick Up Parcel' : 'Start Ride';
      case 'started': 
        if (ride.waypoints && currentStopIndex < ride.waypoints.length) {
          return stopState === 'heading' ? `Heading to Stop ${currentStopIndex + 1}` : `Arrived at Stop ${currentStopIndex + 1}`;
        }
        return ride.type === 'parcel' ? 'Delivering Parcel' : 'Heading to Destination';
      case 'completed': return 'Completed';
      default: return rideState;
    }
  };

  const getStatusColor = () => {
    switch (rideState) {
      case 'pending': return GRAY_MEDIUM;
      case 'accepted': return '#A29BFE';
      case 'arrived': return '#4ECDC4';
      case 'started': return YELLOW_PRIMARY;
      case 'completed': return '#4ECDC4';
      default: return GRAY_MEDIUM;
    }
  };

  const pickupCoords = ride.pickup?.location?.coordinates ? 
    { latitude: ride.pickup.location.coordinates[1], longitude: ride.pickup.location.coordinates[0] } : null;
    
  const dropoffCoords = ride.dropoff?.location?.coordinates ? 
    { latitude: ride.dropoff.location.coordinates[1], longitude: ride.dropoff.location.coordinates[0] } : null;

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={YELLOW_PRIMARY} />
        <Text style={styles.loadingText}>Getting location...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={WHITE} />
      
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'DriverHome' }],
                });
              }
            }}
            activeOpacity={0.7}
          >
            <IconIonic 
              name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} 
              size={24} 
              color={BLACK} 
            />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Active Ride</Text>
            <View style={styles.headerStatus}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
              <Text style={[styles.headerSubtitle, { color: getStatusColor() }]}>
                {getRideStatusText()}
              </Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={handleCancel}
            activeOpacity={0.7}
          >
            <Icon name="close" size={22} color={GRAY_MEDIUM} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          {/* Turn-by-turn Overlay */}
          <TurnByTurnComponent 
            instruction={turnInstruction}
            distance={rideState === 'accepted' ? (distanceToPickup ? `${(distanceToPickup/1000).toFixed(1)} km` : '') : ''}
            eta={rideState === 'accepted' ? pickupEta?.durationText : tripEta?.durationText}
          />

          {/* Map Controls */}
          <MapControls 
            onZoomIn={() => mapRef.current?.animateToRegion({ ...location, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 500)}
            onZoomOut={() => mapRef.current?.animateToRegion({ ...location, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 500)}
            onCenterMap={() => mapRef.current?.animateCamera({ center: location, heading: heading, pitch: 45, zoom: 17 })}
          />
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            showsUserLocation={false}
            showsMyLocationButton={false}
            showsCompass={false}
          >
            <Marker coordinate={location} title="You" rotation={heading} flat={true}>
              <View style={styles.driverMarker}>
                <LinearGradient
                  colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                  style={styles.driverMarkerGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Icon name="directions-car" size={20} color={WHITE} />
                </LinearGradient>
              </View>
            </Marker>

            {pickupCoords && (
              <Marker coordinate={pickupCoords} title="Pickup">
                <View style={styles.pickupMarker}>
                  <View style={styles.pickupMarkerInner} />
                </View>
              </Marker>
            )}

            {dropoffCoords && (
              <Marker coordinate={dropoffCoords} title="Dropoff">
                <View style={styles.dropoffMarker}>
                  <Icon name="flag" size={14} color={WHITE} />
                </View>
              </Marker>
            )}

            {(rideState === 'pending' || rideState === 'accepted') && driverToPickupCoords.length > 0 && (
              <Polyline
                coordinates={driverToPickupCoords}
                strokeWidth={3}
                strokeColor="#A29BFE"
                lineDashPattern={[8, 6]}
              />
            )}

            {(rideState === 'pending' || rideState === 'accepted' || rideState === 'arrived') && pickupToDropoffCoords.length > 0 && (
              <Polyline
                coordinates={pickupToDropoffCoords}
                strokeWidth={3}
                strokeColor={GRAY_LIGHT}
                lineDashPattern={[10, 10]}
              />
            )}

            {(rideState === 'started' || rideState === 'completed') && pickupToDropoffCoords.length > 0 && (
              <Polyline
                coordinates={pickupToDropoffCoords}
                strokeWidth={4}
                strokeColor={YELLOW_PRIMARY}
              />
            )}
          </MapView>

          {/* Map Overlay Info — driving ETA when available, straight-line distance otherwise */}
          <View style={styles.mapOverlay}>
            <View style={styles.mapInfo}>
              <IconMC name="map-marker-distance" size={14} color={WHITE} />
              <Text style={styles.mapInfoText}>
                {pickupEta
                  ? `${pickupEta.durationText} · ${pickupEta.distanceText} to pickup`
                  : distanceToPickup
                  ? `${(distanceToPickup / 1000).toFixed(1)} km to pickup`
                  : 'Loading distance...'}
              </Text>
            </View>
            {tripEta && (
              <View style={styles.mapInfo}>
                <IconMC name="flag-checkered" size={14} color={WHITE} />
                <Text style={styles.mapInfoText}>
                  {`Trip: ${tripEta.durationText} · ${tripEta.distanceText}`}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Bottom Card */}
        <View style={styles.bottomCard}>
          {rideState === 'completed' ? (
            <View style={styles.completedContainer}>
              <View style={styles.completedIcon}>
                <LinearGradient
                  colors={['#4ECDC4', '#44B39D']}
                  style={styles.completedIconGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Icon name="check" size={32} color={WHITE} />
                </LinearGradient>
              </View>
              <Text style={styles.completedTitle}>
                {ride.type === 'parcel' ? 'Parcel Delivered' : 'Ride Completed'}
              </Text>
              <View style={styles.completedFare}>
                <Text style={styles.completedFareLabel}>Total Fare</Text>
                <Text style={styles.completedFareValue}>Rs. {ride.fare?.final || ride.fare?.accepted || 0}</Text>
              </View>
              <RatingComponent
                bookingId={ride?._id}
                tripType={ride?.type || 'ride'}
                ratedUser={ride?.passengerId?._id || ride?.passengerId}
                ratedUserRole="passenger"
                onDone={() => navigation.navigate('DriverHome')}
              />
            </View>
          ) : (
            <>
              {/* Passenger Info */}
              <View style={styles.passengerInfo}>
                <View style={styles.passengerLeft}>
                  <View style={styles.avatarContainer}>
                    <LinearGradient
                      colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                      style={styles.avatarGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <Text style={styles.avatarText}>
                        {ride.passengerId?.name?.charAt(0) || '?'}
                      </Text>
                    </LinearGradient>
                  </View>
                  <View style={styles.passengerDetails}>
                    <Text style={styles.passengerName}>
                      {ride.type === 'parcel' ? (ride.parcel?.receiverName || 'Receiver') : ride.passengerId?.name}
                    </Text>
                    <View style={styles.passengerMeta}>
                      <Icon name="star" size={12} color={YELLOW_PRIMARY} />
                      <Text style={styles.passengerRating}>{ride.passengerId?.rating || '5.0'}</Text>
                      <View style={styles.metaDot} />
                      <IconMC name="cash" size={12} color={GRAY_MEDIUM} />
                      <Text style={styles.passengerFare}>Rs. {ride.fare?.accepted || ride.fare?.offered || 0}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity 
                    style={styles.contactButton}
                    onPress={() => setIsChatOpen(true)}
                    activeOpacity={0.7}
                  >
                    <Icon name="chat" size={20} color={GRAY_DARK} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.contactButton}
                    onPress={async () => {
                      if (VOIP_CALLING_ENABLED) {
                        const calleeId = ride.passengerId?._id || ride.passengerId;
                        const calleeName = ride.passengerId?.name || 'Passenger';
                        navigation.navigate('InCall');
                        await CallService.startCall(ride._id, calleeId, calleeName);
                      } else {
                        Alert.alert('Notice', 'In-app calling is disabled');
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Icon name="phone" size={20} color={GRAY_DARK} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Guest Info */}
              {ride.guest?.isGuestBooking && rideState !== 'pending' && (
                <View style={styles.guestContainer}>
                  <View style={styles.guestHeader}>
                    <Icon name="person-pin" size={16} color={YELLOW_PRIMARY} />
                    <Text style={styles.guestTitle}>Guest Booking</Text>
                  </View>
                  {!!ride.guest.name && (
                    <Text style={styles.guestDetail}>
                      {ride.guest.name} {ride.guest.relation ? `(${ride.guest.relation})` : ''}
                    </Text>
                  )}
                  {!!ride.guest.phoneNumber && (
                    <TouchableOpacity 
                      style={styles.guestPhone}
                      onPress={() => Linking.openURL(`tel:${ride.guest.phoneNumber}`)}
                    >
                      <Icon name="phone" size={14} color="#4ECDC4" />
                      <Text style={styles.guestPhoneText}>Call {ride.guest.phoneNumber}</Text>
                    </TouchableOpacity>
                  )}
                  {!!ride.guest.note && (
                    <View style={styles.guestNote}>
                      <Icon name="info-outline" size={14} color={GRAY_MEDIUM} />
                      <Text style={styles.guestNoteText}>{ride.guest.note}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Addresses */}
              <View style={styles.addresses}>
                <View style={styles.addressRow}>
                  <View style={[styles.addressDot, { backgroundColor: '#4ECDC4' }]} />
                  <Text style={styles.addressText} numberOfLines={1}>{ride.pickup?.address}</Text>
                </View>
                
                {ride.waypoints && ride.waypoints.map((wp, idx) => (
                  <React.Fragment key={idx}>
                    <View style={styles.addressConnector}>
                      <View style={styles.addressLine} />
                    </View>
                    <View style={styles.addressRow}>
                      <View style={[styles.addressDot, { backgroundColor: '#FF9F43' }]} />
                      <Text style={[styles.addressText, idx < currentStopIndex && { textDecorationLine: 'line-through', color: GRAY_MEDIUM }]} numberOfLines={1}>{wp.address}</Text>
                    </View>
                  </React.Fragment>
                ))}

                <View style={styles.addressConnector}>
                  <View style={styles.addressLine} />
                </View>
                <View style={styles.addressRow}>
                  <View style={[styles.addressDot, { backgroundColor: '#FF6B6B' }]} />
                  <Text style={styles.addressText} numberOfLines={1}>{ride.dropoff?.address}</Text>
                </View>
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleStatusAction}
                disabled={rideState === 'pending' || loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={rideState === 'pending' ? [GRAY_LIGHT, GRAY_LIGHT] : [YELLOW_PRIMARY, YELLOW_SECONDARY]}
                  style={styles.actionGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color={rideState === 'pending' ? GRAY_MEDIUM : WHITE} size="small" />
                  ) : (
                    <>
                      <Icon 
                        name={
                          rideState === 'accepted' ? 'my-location' :
                          rideState === 'arrived' ? 'play-arrow' :
                          'flag'
                        } 
                        size={20} 
                        color={rideState === 'pending' ? GRAY_MEDIUM : WHITE} 
                      />
                      <Text style={[styles.actionText, rideState === 'pending' && styles.actionTextDisabled]}>
                        {rideState === 'pending' ? 'Waiting for Passenger...' :
                         rideState === 'accepted' ? 'Arrived at Pickup' :
                         rideState === 'arrived' ? (ride.type === 'parcel' ? 'Pick Up Parcel' : 'Start Ride') :
                         rideState === 'started' && ride.waypoints && currentStopIndex < ride.waypoints.length ? (stopState === 'heading' ? 'Arrived at Stop' : 'Complete Stop') :
                         (ride.type === 'parcel' ? 'Deliver Parcel' : 'Complete Ride')}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Chat Modal */}
        <Modal
          visible={isChatOpen}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setIsChatOpen(false)}
        >
          <KeyboardAvoidingView
            style={styles.chatModalContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.chatContent}>
              <View style={styles.chatHeader}>
                <Text style={styles.chatTitle}>Chat</Text>
                <TouchableOpacity onPress={() => setIsChatOpen(false)} activeOpacity={0.7}>
                  <Icon name="close" size={24} color={BLACK} />
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                style={styles.chatMessages}
                contentContainerStyle={styles.chatMessagesContent}
                showsVerticalScrollIndicator={false}
              >
                {messages.map((msg, index) => (
                  <View
                    key={index}
                    style={[
                      styles.messageBubble,
                      msg.senderId === user.id ? styles.sentMessage : styles.receivedMessage
                    ]}
                  >
                    <Text style={styles.messageText}>{msg.message}</Text>
                    <Text style={styles.messageTime}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              
              <View style={styles.chatInput}>
                <TextInput
                  style={styles.chatInputField}
                  placeholder="Type a message..."
                  placeholderTextColor={GRAY_MEDIUM}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                />
                <TouchableOpacity 
                  style={styles.sendButton}
                  onPress={handleSendMessage}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                    style={styles.sendGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Icon name="send" size={20} color={WHITE} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => {
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = getThemePalette(colors, isDark);
  const cardBg = isDark ? colors.card : '#FFFFFF';
  const insetBg = isDark ? colors.cardElevated : '#F5F5F5';
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WHITE,
  },
  container: {
    flex: 1,
    backgroundColor: GRAY_BG,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: WHITE,
  },
  loadingText: {
    color: GRAY_MEDIUM,
    fontSize: 14,
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 16,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: BLACK,
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  cancelButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: {
    height: height * 0.4,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  mapInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  mapInfoText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '500',
  },
  driverMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarkerGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WHITE,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  pickupMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ECDC4',
  },
  dropoffMarker: {
    backgroundColor: '#FF6B6B',
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: WHITE,
  },
  bottomCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  passengerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  passengerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatarGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: WHITE,
    fontSize: 20,
    fontWeight: '700',
  },
  passengerDetails: {
    flex: 1,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  passengerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  passengerRating: {
    fontSize: 13,
    color: GRAY_MEDIUM,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: GRAY_MEDIUM,
    marginHorizontal: 2,
  },
  passengerFare: {
    fontSize: 13,
    color: GRAY_MEDIUM,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestContainer: {
    backgroundColor: YELLOW_PRIMARY + '08',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: YELLOW_PRIMARY + '20',
  },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  guestTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: YELLOW_PRIMARY,
  },
  guestDetail: {
    fontSize: 14,
    color: GRAY_DARK,
    marginBottom: 4,
  },
  guestPhone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  guestPhoneText: {
    fontSize: 14,
    color: '#4ECDC4',
    fontWeight: '500',
  },
  guestNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  guestNoteText: {
    fontSize: 13,
    color: GRAY_MEDIUM,
    flex: 1,
    fontStyle: 'italic',
  },
  addresses: {
    backgroundColor: GRAY_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addressText: {
    fontSize: 14,
    color: GRAY_DARK,
    flex: 1,
  },
  addressConnector: {
    alignItems: 'center',
    paddingLeft: 3,
  },
  addressLine: {
    width: 2,
    height: 12,
    backgroundColor: '#D0D0D0',
    marginVertical: 2,
  },
  actionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  actionTextDisabled: {
    color: GRAY_MEDIUM,
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 10,
    flex: 1,
    justifyContent: 'center',
  },
  completedIcon: {
    marginBottom: 16,
  },
  completedIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4ECDC4',
    marginBottom: 8,
  },
  completedFare: {
    alignItems: 'center',
    marginBottom: 20,
  },
  completedFareLabel: {
    fontSize: 14,
    color: GRAY_MEDIUM,
  },
  completedFareValue: {
    fontSize: 32,
    fontWeight: '700',
    color: YELLOW_PRIMARY,
    marginTop: 4,
  },
  chatModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chatContent: {
    height: '50%',
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 8,
  },
  sentMessage: {
    backgroundColor: YELLOW_PRIMARY,
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    backgroundColor: GRAY_LIGHT,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    color: BLACK,
  },
  messageTime: {
    fontSize: 10,
    color: GRAY_MEDIUM,
    marginTop: 4,
  },
  chatInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: GRAY_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  chatInputField: {
    flex: 1,
    color: BLACK,
    paddingHorizontal: 4,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendGradient: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  });
};

export default ActiveRideScreen;