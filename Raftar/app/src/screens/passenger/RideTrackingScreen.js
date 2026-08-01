import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Modal,
  Share
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSelector, useDispatch } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getRideDetails, cancelRide, sendChatMessage, acceptCounterOffer } from '../../redux/slices/rideSlice';
import { useSocket } from '../../context/SocketContext';
import { GOOGLE_MAPS_API_KEY, VOIP_CALLING_ENABLED, API_URL } from '../../config/constants';
import { getDirections } from '../../services/maps';
import RatingComponent from '../../components/common/RatingComponent';
import CallService from '../../services/CallService';
import api from '../../services/api';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';

const RideTrackingScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const route = useRoute();
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const socket = useSocket();
  const { rideId } = route.params;
  const { user } = useSelector(state => state.auth);
  const { currentRide, loading } = useSelector(state => state.ride);
  
  const [driverLocation, setDriverLocation] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [counterOffers, setCounterOffers] = useState([]);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [rideCompletedData, setRideCompletedData] = useState(null);
  const mapRef = useRef(null);
  
  const [isLocallyShared, setIsLocallyShared] = useState(false);
  const isShared = !!currentRide?.shareToken || isLocallyShared;
  const [loadingShare, setLoadingShare] = useState(false);
  const passengerLocationInterval = useRef(null);

  useEffect(() => {
    if (VOIP_CALLING_ENABLED && socket) {
      CallService.init(socket);
    }
  }, [socket]);

  useEffect(() => {
    fetchRideDetails();
    
    // Back handler for ghost rides
    const backAction = () => {
      if (currentRide?.status === 'searching') {
        Alert.alert(
          'Cancel Request?',
          'Do you want to cancel your ride request before leaving?',
          [
            { text: 'Keep Waiting', style: 'cancel', onPress: () => {} },
            { 
              text: 'Cancel Ride', 
              style: 'destructive',
              onPress: async () => {
                await dispatch(cancelRide(rideId));
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  navigation.reset({ index: 0, routes: [{ name: 'PassengerHome' }] });
                }
              }
            }
          ]
        );
        return true; // Prevent default behavior
      }
      return false; // Allow default behavior
    };
    
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => {
      backHandler.remove();
    };
  }, [currentRide?.status]);

  useEffect(() => {
    // Other initializations can go here
  }, []);

  useEffect(() => {
    if (currentRide && (currentRide.status === 'searching' || currentRide.status === 'accepted' || currentRide.status === 'started')) {
      fetchRoute();
    }
  }, [currentRide?.status]);

  useEffect(() => {
    if (mapRef.current && currentRide) {
      const points = [];
      if (routeCoords.length > 0) {
        points.push(...routeCoords);
      } else {
        if (currentRide.pickup?.location) {
          points.push({
            latitude: currentRide.pickup.location.coordinates[1],
            longitude: currentRide.pickup.location.coordinates[0],
          });
        }
        if (currentRide.dropoff?.location) {
          points.push({
            latitude: currentRide.dropoff.location.coordinates[1],
            longitude: currentRide.dropoff.location.coordinates[0],
          });
        }
      }
      
      if (driverLocation?.coordinates) {
        points.push({
          latitude: driverLocation.coordinates[1],
          longitude: driverLocation.coordinates[0],
        });
      }

      if (currentRide?.status === 'searching' && counterOffers.length > 0) {
        counterOffers.forEach(offer => {
          if (offer.driver?.location?.coordinates && offer.driver.location.coordinates.length >= 2) {
            points.push({
              latitude: offer.driver.location.coordinates[1],
              longitude: offer.driver.location.coordinates[0],
            });
          }
        });
      }

      if (points.length > 1) {
        // Small delay to allow layout to settle before fitting
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.fitToCoordinates(points, {
              edgePadding: { top: 80, right: 50, bottom: 400, left: 50 },
              animated: true,
            });
          }
        }, 300);
      }
    }
  }, [routeCoords, currentRide?.pickup, currentRide?.dropoff, counterOffers.length]);

  useEffect(() => {
    if (isShared && currentRide && (currentRide.status === 'searching' || currentRide.status === 'accepted' || currentRide.status === 'started')) {
      startPassengerLocationUpdates();
    } else {
      stopPassengerLocationUpdates();
    }
    return () => stopPassengerLocationUpdates();
  }, [isShared, currentRide?.status]);

  const startPassengerLocationUpdates = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    if (!passengerLocationInterval.current) {
      passengerLocationInterval.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({});
          if (socket) {
            socket.emit('passenger-location', {
              rideId,
              location: {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude
              }
            });
          }
        } catch (err) {
          console.log('Passenger location update error', err);
        }
      }, 5000);
    }
  };

  const stopPassengerLocationUpdates = () => {
    if (passengerLocationInterval.current) {
      clearInterval(passengerLocationInterval.current);
      passengerLocationInterval.current = null;
    }
  };

  const fetchRoute = async () => {
    if (!currentRide?.pickup?.location?.coordinates || !currentRide?.dropoff?.location?.coordinates) return;

    const route = await getDirections(
      currentRide.pickup,
      currentRide.dropoff,
      currentRide.waypoints || []
    );
    if (!route) return;

    setRouteCoords(route.coordinates);
    setRouteInfo({
      distanceText: route.distanceText,
      durationText: route.durationText,
      isEstimate: route.isFallback,
    });

    if (mapRef.current && route.coordinates.length) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 80, right: 50, bottom: 400, left: 50 },
        animated: true,
      });
    }
  };

  const fetchRideDetails = async () => {
    await dispatch(getRideDetails(rideId));
  };

  useEffect(() => {
    if (!socket || !rideId) return;

    socket.emit('join-ride', rideId);
    console.log(`Passenger: "Joined room ride-${rideId}"`);

    const handleDriverLocation = (data) => {
      setDriverLocation(data.location);
    };
    
    const handleNewMessage = (data) => {
      if (data.senderId !== user.id) {
        setMessages(prev => [...prev, data]);
      }
    };
    
    const handleRideCompleted = (data) => {
      console.log('Passenger: "Received ride-completed event"');
      setRideCompletedData(data);
      dispatch({ type: 'ride/getRideDetails/fulfilled', payload: { ride: data.ride } });
    };
    
    const handleRideAccepted = (data) => {
      console.log(`Passenger: "Received ride-accepted event"`);
      dispatch({ type: 'ride/getRideDetails/fulfilled', payload: { ride: data.ride } });
      dispatch(getRideDetails(rideId));
      if (data.driver?.location) {
        setDriverLocation(data.driver.location);
      }
    };

    const handleCounterOfferReceived = (data) => {
      console.log(`Passenger: "Received counter-offer from driver: Rs. ${data.amount}"`);
      setCounterOffers(prev => {
        // Prevent duplicates from same driver
        const exists = prev.find(offer => offer.driver?.id === data.driver?.id);
        if (exists) {
          return prev.map(offer => offer.driver?.id === data.driver?.id ? data : offer);
        }
        return [data, ...prev];
      });
    };

    const handleRideUpdate = (data) => {
      console.log('[RideTrackingScreen] Received ride-update event');
    };

    const handleRideCancelled = (data) => {
      if (data.rideId === rideId) {
        Alert.alert('Ride Cancelled', 'The driver has cancelled this ride.');
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.reset({
            index: 0,
            routes: [{ name: 'PassengerHome' }],
          });
        }
      }
    };

    const handleNearbyDrivers = (data) => {
      if (data.drivers && Array.isArray(data.drivers)) {
        setNearbyDrivers(data.drivers);
      }
    };

    socket.on('driver-location', handleDriverLocation);
    socket.on('new-message', handleNewMessage);
    socket.on('ride-completed', handleRideCompleted);
    socket.on('ride-accepted', handleRideAccepted);
    socket.on('counter-offer-received', handleCounterOfferReceived);
    socket.on('ride-update', handleRideUpdate);
    socket.on('ride-cancelled', handleRideCancelled);
    socket.on('nearby-drivers', handleNearbyDrivers);

    return () => {
      socket.off('driver-location', handleDriverLocation);
      socket.off('new-message', handleNewMessage);
      socket.off('ride-completed', handleRideCompleted);
      socket.off('ride-accepted', handleRideAccepted);
      socket.off('counter-offer-received', handleCounterOfferReceived);
      socket.off('ride-update', handleRideUpdate);
      socket.off('ride-cancelled', handleRideCancelled);
      socket.off('nearby-drivers', handleNearbyDrivers);
    };
  }, [socket, rideId, dispatch]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    
    const msg = {
      rideId,
      senderId: user.id,
      message: message.trim(),
      type: 'text',
      timestamp: new Date()
    };
    
    await dispatch(sendChatMessage(msg));
    setMessages(prev => [...prev, msg]);
    setMessage('');
  };

  const handleShareRide = async () => {
    try {
      setLoadingShare(true);
      const response = await api.post(`/rides/${rideId}/share`);
      setLoadingShare(false);
      
      if (response.data?.success) {
        setIsLocallyShared(true);
        // Generate dynamic deep link for Expo Go / Production
        const deepLink = Linking.createURL(`share/${response.data.shareToken}`);
        // Wrap in HTTP redirect so WhatsApp/SMS makes it clickable
        const clickableLink = `${API_URL}/rides/redirect?to=${encodeURIComponent(deepLink)}`;
        
        await Share.share({
          message: `Track my Raftar ride live: ${clickableLink}`,
        });
        // Dispatch to update currentRide in Redux to include shareToken
        dispatch(getRideDetails(rideId));
      }
    } catch (err) {
      setLoadingShare(false);
      Alert.alert('Error', err.response?.data?.error || 'Could not generate share link');
    }
  };

  const handleRejectCounterOffer = (offer) => {
    setCounterOffers(prev => prev.filter(o => o.driver?.id !== offer.driver?.id));
  };

  const handleAcceptCounterOffer = async (offer) => {
    try {
      await dispatch(acceptCounterOffer({ 
        rideId, 
        driverId: offer.driver.id, // the user ID of the driver
        amount: offer.amount 
      })).unwrap();
      Alert.alert('Success', 'Counter offer accepted!');
      setCounterOffers([]);
      fetchRideDetails();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to accept offer');
    }
  };

  const handleSOS = () => {
    Alert.alert(
      'SOS Alert',
      'This will alert emergency contacts and send your location. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send SOS', 
          style: 'destructive',
          onPress: () => {
            setSosTriggered(true);
            socket.emit('sos-alert', { rideId, location: currentRide?.pickup?.location });
            // Send emergency notifications
          }
        }
      ]
    );
  };

  const handleCancelRide = () => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this ride?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            await dispatch(cancelRide(rideId));
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.reset({ index: 0, routes: [{ name: 'PassengerHome' }] });
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f9c043" />
      </View>
    );
  }
  if (rideCompletedData) {
    return (
      <View style={styles.container}>
        <View style={styles.completedOverlay}>
          <View style={styles.completedCard}>
            <Icon name="check-circle" size={60} color="#4ECDC4" style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={styles.completedTitle}>Ride Completed!</Text>
            
            <View style={styles.completedDetails}>
              <View style={styles.completedRow}>
                <Text style={styles.completedLabel}>Total Fare</Text>
                <Text style={styles.completedFare}>Rs. {rideCompletedData.fare}</Text>
              </View>
              
              <View style={styles.completedDivider} />
              
              <View style={styles.completedRoute}>
                <View style={styles.completedRoutePoint}>
                  <View style={[styles.dot, { backgroundColor: '#4ECDC4' }]} />
                  <Text style={styles.completedRouteText} numberOfLines={1}>{rideCompletedData.pickup?.address || currentRide?.pickup?.address}</Text>
                </View>
                <View style={styles.completedRouteLine} />
                <View style={styles.completedRoutePoint}>
                  <View style={[styles.dot, { backgroundColor: '#FF6B6B' }]} />
                  <Text style={styles.completedRouteText} numberOfLines={1}>{rideCompletedData.dropoff?.address || currentRide?.dropoff?.address}</Text>
                </View>
              </View>
            </View>
            <RatingComponent
              bookingId={currentRide?._id}
              tripType={currentRide?.type || 'ride'}
              ratedUser={currentRide?.driverId?.userId || currentRide?.driverId}
              ratedUserRole="driver"
              onDone={() => navigation.navigate('PassengerHome')}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.floatingBackButton}
        onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.reset({
              index: 0,
              routes: [{ name: 'PassengerHome' }],
            });
          }
        }}
      >
        <Icon name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: currentRide?.pickup?.location?.coordinates[1] || 0,
          longitude: currentRide?.pickup?.location?.coordinates[0] || 0,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {driverLocation?.coordinates && driverLocation.coordinates.length >= 2 && (
          <Marker
            key="driver-marker"
            coordinate={{
              latitude: driverLocation.coordinates[1],
              longitude: driverLocation.coordinates[0],
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={100}
            tracksViewChanges={false}
          >
            <View style={styles.driverCarMarker}>
              <Icon name="directions-car" size={20} color={colors.text} />
            </View>
          </Marker>
        )}
        
        {currentRide?.pickup?.location && (
          <Marker
            key="pickup-marker"
            coordinate={{
              latitude: currentRide.pickup.location.coordinates[1],
              longitude: currentRide.pickup.location.coordinates[0],
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.customPin}>
              <View style={[styles.pinIconWrapper, { backgroundColor: '#4ECDC4' }]}>
                <View style={styles.pinInnerDot} />
              </View>
              <View style={[styles.pinTriangle, { borderTopColor: '#4ECDC4' }]} />
            </View>
          </Marker>
        )}
        
        {currentRide?.dropoff?.location && (
          <Marker
            key="dropoff-marker"
            coordinate={{
              latitude: currentRide.dropoff.location.coordinates[1],
              longitude: currentRide.dropoff.location.coordinates[0],
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.customPin}>
              <View style={[styles.pinIconWrapper, { backgroundColor: '#FF6B6B' }]}>
                <Icon name="flag" size={14} color="#FFF" />
              </View>
              <View style={[styles.pinTriangle, { borderTopColor: '#FF6B6B' }]} />
            </View>
          </Marker>
        )}

        {currentRide?.waypoints && currentRide.waypoints.map((wp, idx) => (
          <Marker
            key={`waypoint-${idx}`}
            coordinate={{
              latitude: wp.location.coordinates[1],
              longitude: wp.location.coordinates[0],
            }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.customPin}>
              <View style={[styles.pinIconWrapper, { backgroundColor: '#FF9F43' }]}>
                <Icon name="stop" size={14} color="#FFF" />
              </View>
              <View style={[styles.pinTriangle, { borderTopColor: '#FF9F43' }]} />
            </View>
          </Marker>
        ))}

        {currentRide?.status === 'searching' && counterOffers.map((offer, idx) => {
          if (!offer.driver?.location?.coordinates || offer.driver.location.coordinates.length < 2) return null;
          return (
            <Marker
              key={`offer-${offer.driver.id || idx}`}
              coordinate={{
                latitude: offer.driver.location.coordinates[1],
                longitude: offer.driver.location.coordinates[0],
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={90}
              tracksViewChanges={false}
            >
              <View style={[styles.driverCarMarker, { borderColor: '#f9c043' }]}>
                <Icon name="directions-car" size={16} color={colors.text} />
              </View>
            </Marker>
          );
        })}

        {currentRide?.status === 'searching' && nearbyDrivers.map((driver, idx) => {
          if (!driver.location?.coordinates || driver.location.coordinates.length < 2) return null;
          // Avoid duplicating markers if the driver has already sent a counter-offer
          if (counterOffers.some(offer => offer.driver?.id === driver._id || offer.driver?.driverId === driver._id)) return null;
          return (
            <Marker
              key={`nearby-${driver._id || idx}`}
              coordinate={{
                latitude: driver.location.coordinates[1],
                longitude: driver.location.coordinates[0],
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={80}
              tracksViewChanges={false}
            >
              <View style={[styles.driverCarMarker, { opacity: 0.6 }]}>
                <Icon name="directions-car" size={16} color={colors.text} />
              </View>
            </Marker>
          );
        })}
        
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="#f9c043"
          />
        )}
      </MapView>

      {/* Trip ETA + distance from the Directions response */}
      {routeInfo && (
        <View style={styles.etaBar}>
          <View style={styles.etaItem}>
            <Icon name="schedule" size={16} color={colors.textSecondary} />
            <Text style={styles.etaValue}>{routeInfo.durationText}</Text>
          </View>
          <View style={styles.etaDivider} />
          <View style={styles.etaItem}>
            <Icon name="straighten" size={16} color={colors.textSecondary} />
            <Text style={styles.etaValue}>{routeInfo.distanceText}</Text>
          </View>
          {routeInfo.isEstimate && <Text style={styles.etaApprox}>approx.</Text>}
        </View>
      )}

      {/* Counter Offers */}
      {currentRide?.status === 'searching' && counterOffers.length > 0 && (
        <ScrollView style={styles.counterOffersContainer} horizontal showsHorizontalScrollIndicator={false}>
          {counterOffers.map((offer, index) => (
            <View key={index} style={styles.counterOfferCard}>
              <Text style={styles.counterOfferTitle}>Counter Offer Received</Text>
              <Text style={styles.counterOfferName}>{offer.driver?.name} (⭐ {offer.driver?.rating})</Text>
              <Text style={styles.counterOfferVehicle}>
                {offer.driver?.vehicle?.type} {offer.driver?.vehicle?.model} • {offer.driver?.vehicle?.plateNumber}
              </Text>
              
              <View style={styles.fareComparison}>
                <View style={styles.fareBox}>
                  <Text style={styles.fareLabel}>Your offer:</Text>
                  <Text style={styles.originalFareAmount}>Rs. {currentRide?.fare?.offered || 0}</Text>
                </View>
                <Icon name="arrow-forward" size={20} color={colors.textSecondary} />
                <View style={styles.fareBox}>
                  <Text style={styles.fareLabel}>Driver's counter:</Text>
                  <Text style={styles.counterOfferAmount}>Rs. {offer.amount}</Text>
                </View>
              </View>

              <View style={styles.counterOfferActions}>
                <TouchableOpacity 
                  style={styles.rejectOfferButton} 
                  onPress={() => handleRejectCounterOffer(offer)}
                >
                  <Text style={styles.rejectOfferText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.acceptOfferButton} 
                  onPress={() => handleAcceptCounterOffer(offer)}
                >
                  <Text style={styles.acceptOfferText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Ride Info Card */}
      <View style={styles.rideInfoCard}>
        <View style={styles.rideInfoHeader}>
          <View>
            <Text style={styles.rideStatus}>
              {currentRide?.type === 'parcel' 
                ? (currentRide.status === 'started' ? 'PICKED UP' : 
                   currentRide.status === 'completed' ? 'DELIVERED' : 
                   currentRide.status === 'searching' ? 'SEARCHING FOR DRIVER' :
                   currentRide?.status?.toUpperCase())
                : currentRide?.status?.toUpperCase()}
            </Text>
            <Text style={styles.rideFare}>
              Rs. {currentRide?.fare?.accepted || currentRide?.fare?.offered}
            </Text>
          </View>
          <View style={styles.rideActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleShareRide} disabled={loadingShare}>
              {loadingShare ? <ActivityIndicator size="small" color={colors.text} /> : <Icon name="share" size={24} color={colors.text} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleSOS}>
              <Icon name="warning" size={24} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.rideDetails}>
          {currentRide?.driverId && (
            <View style={styles.driverInfoContainer}>
              <View style={styles.driverInfoHeader}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>{currentRide.driverId.userId?.name?.charAt(0) || 'D'}</Text>
                </View>
                <View style={styles.driverDetailsText}>
                  <Text style={styles.driverName}>{currentRide.driverId.userId?.name || 'Driver'}</Text>
                  <View style={styles.ratingContainer}>
                    <Icon name="star" size={14} color="#f9c043" />
                    <Text style={styles.driverRating}>{currentRide.driverId.stats?.rating || '5.0'}</Text>
                  </View>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity style={styles.contactButton} onPress={() => setIsChatOpen(!isChatOpen)}>
                    <Icon name="chat" size={20} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.contactButton} onPress={async () => {
                    if (VOIP_CALLING_ENABLED) {
                      const calleeId = currentRide.driverId.userId?._id || currentRide.driverId.userId;
                      const calleeName = currentRide.driverId.userId?.name || 'Driver';
                      navigation.navigate('InCall'); // Pre-navigate to show calling state
                      await CallService.startCall(rideId, calleeId, calleeName);
                    } else {
                      Alert.alert('Notice', 'In-app calling is disabled right now');
                    }
                  }}>
                    <Icon name="phone" size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.vehicleDetailsRow}>
                <Icon name="directions-car" size={16} color={colors.textSecondary} />
                <Text style={styles.vehicleDetailsText}>
                  {currentRide.driverId.vehicleDetails?.color || ''} {currentRide.driverId.vehicleDetails?.brand || ''} {currentRide.driverId.vehicleDetails?.model || 'Vehicle'} • {currentRide.driverId.vehicleDetails?.plateNumber || 'N/A'}
                </Text>
              </View>
              <View style={styles.driverDivider} />
            </View>
          )}

          <View style={styles.detailRow}>
            <Icon name="location-on" size={20} color="#4ECDC4" />
            <Text style={styles.detailText}>{currentRide?.pickup?.address}</Text>
          </View>
          
          {currentRide?.waypoints && currentRide.waypoints.map((wp, idx) => (
            <View key={idx} style={styles.detailRow}>
              <Icon name="stop-circle" size={20} color="#FF9F43" />
              <Text style={styles.detailText}>{wp.address}</Text>
            </View>
          ))}

          <View style={styles.detailRow}>
            <Icon name="flag" size={20} color="#FF6B6B" />
            <Text style={styles.detailText}>{currentRide?.dropoff?.address}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.cancelButton, currentRide?.status === 'completed' && styles.disabledButton]}
          onPress={handleCancelRide}
          disabled={currentRide?.status === 'completed'}
        >
          <Text style={styles.cancelButtonText}>Cancel Ride</Text>
        </TouchableOpacity>
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
          <View style={styles.chatContentWrapper}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Chat</Text>
              <TouchableOpacity onPress={() => setIsChatOpen(false)}>
                <Icon name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.chatMessages}
              contentContainerStyle={{ flexGrow: 1, paddingBottom: 10 }}
              keyboardShouldPersistTaps="handled"
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
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              ))}
            </ScrollView>
            
            <View style={styles.chatInput}>
              <TextInput
                style={styles.input}
                placeholder="Type a message..."
                placeholderTextColor={colors.textSecondary}
                value={message}
                onChangeText={setMessage}
                multiline
              />
              <TouchableOpacity onPress={handleSendMessage}>
                <Icon name="send" size={24} color="#f9c043" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
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
  map: {
    flex: 1,
  },
  etaBar: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 4,
  },
  etaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  etaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  etaDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    marginHorizontal: 12,
    backgroundColor: colors.border,
  },
  etaApprox: {
    marginLeft: 8,
    fontSize: 11,
    color: colors.textSecondary,
  },
  driverCarMarker: {
    backgroundColor: cardBg,
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#111',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  customPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinIconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pinInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: cardBg,
  },
  pinTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  floatingBackButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rideInfoCard: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#f9c043', // Changed to Yellow
    borderRadius: 15,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  rideInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  rideStatus: {
    color: colors.text, // Better contrast on yellow
    fontSize: 16,
    fontWeight: 'bold',
  },
  rideFare: {
    color: colors.text, // Better contrast on yellow
    fontSize: 20,
    fontWeight: 'bold',
  },
  rideActions: {
    flexDirection: 'row',
  },
  actionButton: {
    marginLeft: 15,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 20,
    padding: 6,
  },
  driverInfoContainer: {
    marginBottom: 15,
  },
  driverInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  driverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#000', // Contrast with yellow card
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverAvatarText: {
    color: '#f9c043',
    fontSize: 18,
    fontWeight: 'bold',
  },
  driverDetailsText: {
    flex: 1,
  },
  driverName: {
    color: colors.text, // Contrast with yellow
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverRating: {
    color: colors.text, // Contrast with yellow
    fontSize: 12,
    marginLeft: 4,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000', // Contrast with yellow
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  vehicleDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)', // Subtle contrast on yellow
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  vehicleDetailsText: {
    color: colors.text, // Contrast with yellow
    fontSize: 12,
    marginLeft: 8,
  },
  driverDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)', // Subtle line on yellow
    marginBottom: 10,
  },
  rideDetails: {
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    color: colors.text, // Contrast with yellow
    marginLeft: 10,
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#000', // Contrast with yellow
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.5,
  },
  chatModalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  chatContentWrapper: {
    height: '50%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 15,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  chatTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  chatMessages: {
    flex: 1,
    marginBottom: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  sentMessage: {
    backgroundColor: '#f9c043',
    alignSelf: 'flex-end',
  },
  receivedMessage: {
    backgroundColor: colors.cardElevated,
    alignSelf: 'flex-start',
  },
  messageText: {
    color: '#FFF',
    fontSize: 14,
  },
  messageTime: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 5,
  },
  chatInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    color: '#FFF',
    paddingHorizontal: 10,
    maxHeight: 100,
  },
  counterOffersContainer: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    maxHeight: 250,
    paddingHorizontal: 10,
  },
  counterOfferCard: {
    backgroundColor: '#f9c043', // Yellow card
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 10,
    width: 280,
    elevation: 5,
  },
  counterOfferTitle: {
    color: colors.text, // Contrast on yellow
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  counterOfferName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  counterOfferVehicle: {
    color: '#444',
    fontSize: 12,
    marginBottom: 10,
  },
  fareComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.1)', // Translucent dark on yellow
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  fareBox: {
    alignItems: 'center',
  },
  fareLabel: {
    color: colors.text,
    fontSize: 10,
    marginBottom: 4,
  },
  originalFareAmount: {
    color: '#555',
    fontSize: 16,
    textDecorationLine: 'line-through',
  },
  counterOfferAmount: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  counterOfferActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rejectOfferButton: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 5,
  },
  rejectOfferText: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
  },
  acceptOfferButton: {
    flex: 1,
    backgroundColor: '#000', // Black button on yellow card
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 5,
  },
  acceptOfferText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  completedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  completedCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '85%',
    alignItems: 'center',
  },
  completedTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  completedDetails: {
    backgroundColor: colors.cardElevated,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  completedRow: {
    alignItems: 'center',
    marginBottom: 10,
  },
  completedLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 5,
  },
  completedFare: {
    color: '#f9c043',
    fontSize: 32,
    fontWeight: 'bold',
  },
  completedDivider: {
    height: 1,
    backgroundColor: '#444',
    marginVertical: 15,
  },
  completedRoute: {
    marginTop: 5,
  },
  completedRoutePoint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  completedRouteLine: {
    width: 2,
    height: 15,
    backgroundColor: '#444',
    marginLeft: 4,
    marginVertical: 4,
  },
  completedRouteText: {
    color: '#FFF',
    fontSize: 14,
    flex: 1,
  },
  completedDoneButton: {
    backgroundColor: '#f9c043',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  completedDoneButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  }
  });
};

export default RideTrackingScreen;