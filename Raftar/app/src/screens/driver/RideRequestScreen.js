import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Dimensions,
  Image,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Button from '../../components/common/Button';
import { getRideRequests, acceptRide, counterOffer, removeRideRequest } from '../../redux/slices/driverSlice';
import { getVehicleType } from '../../utils/constants';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { getDirections } from '../../services/maps';

const { width } = Dimensions.get('window');

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

const RideRequestScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { rideRequests, loading, profile } = useSelector(state => state.driver);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showCounterOffer, setShowCounterOffer] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [activeRide, setActiveRide] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [routePolylines, setRoutePolylines] = useState({});

  const socket = useSocket();

  useFocusEffect(
    React.useCallback(() => {
      fetchRideRequests();
      checkActiveRide();
    }, [])
  );

  useEffect(() => {
    if (socket) {
      const handleNewRide = (ride) => {
        console.log('[RideRequests] Received new ride via socket:', ride._id);
        fetchRideRequests();
      };
      
      const handleRideTaken = (data) => {
        console.log("DRIVER RECEIVED ride-taken:", JSON.stringify(data));
        dispatch(removeRideRequest(data.rideId));
      };

      socket.on('new-ride-request', handleNewRide);
      socket.on('ride-taken', handleRideTaken);
      
      return () => {
        socket.off('new-ride-request', handleNewRide);
        socket.off('ride-taken', handleRideTaken);
      };
    }
  }, [socket]);

  useEffect(() => {
    const fetchPolylines = async () => {
      if (!rideRequests || rideRequests.length === 0) return;
      const newPolylines = { ...routePolylines };
      let updated = false;
      
      for (const ride of rideRequests) {
        if (!newPolylines[ride._id] && ride.pickup && ride.dropoff) {
          try {
            const res = await getDirections(ride.pickup, ride.dropoff, ride.waypoints || []);
            if (res && res.coordinates) {
              newPolylines[ride._id] = res.coordinates;
              updated = true;
            }
          } catch (err) {
            console.log('Error fetching polyline for request', ride._id);
          }
        }
      }
      
      if (updated) {
        setRoutePolylines(newPolylines);
      }
    };
    fetchPolylines();
  }, [rideRequests]);

  const checkActiveRide = async () => {
    try {
      const response = await api.get('/drivers/current-ride');
      if (response.data?.success && response.data.ride) {
        const status = response.data.ride.status;
        if (['searching', 'accepted', 'arrived', 'started'].includes(status)) {
          setActiveRide(response.data.ride);
        } else {
          setActiveRide(null);
        }
      } else {
        setActiveRide(null);
      }
    } catch (error) {
      console.log('Error checking active ride:', error);
    }
  };

  const getBannerTitle = (status) => {
    if (status === 'searching') return 'Pending Offer';
    if (status === 'accepted') return 'Ride Accepted';
    return 'Active Ride in Progress';
  };

  const getBannerColor = (status) => {
    if (status === 'searching') return '#A29BFE';
    return YELLOW_PRIMARY;
  };

  const getBannerTextColor = (status) => {
    if (status === 'searching') return WHITE;
    return BLACK;
  };

  const fetchRideRequests = async () => {
    await dispatch(getRideRequests());
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRideRequests();
    await checkActiveRide();
    setRefreshing(false);
  };

  const handleAccept = async (item) => {
    Alert.alert(
      'Accept Ride',
      `Accept ride request from ${item.passengerId?.name || 'Passenger'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            try {
              const amount = item.fare?.offered || item.fare?.accepted || 0;
              await dispatch(counterOffer({ rideId: item._id, amount })).unwrap();
              if (socket) {
                console.log("Driver joining room ride-" + item._id);
                socket.emit('join-ride', item._id);
              }
              navigation.navigate('ActiveRide', { ride: { ...item, status: 'searching' } });
              fetchRideRequests();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to send offer');
            }
          }
        }
      ]
    );
  };

  const handleDecline = (rideId) => {
    Alert.alert(
      'Decline Ride',
      'Are you sure you want to decline this ride request?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', onPress: () => dispatch(removeRideRequest(rideId)) }
      ]
    );
  };

  const handleCounterOffer = async (rideId) => {
    if (!counterAmount || parseFloat(counterAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      await dispatch(counterOffer({ rideId, amount: parseFloat(counterAmount) })).unwrap();
      if (socket) {
        console.log("Driver joining room ride-" + rideId);
        socket.emit('join-ride', rideId);
      }
      navigation.navigate('ActiveRide', { ride: { ...selectedRequest, status: 'searching' } });
      setShowCounterOffer(false);
      setCounterAmount('');
      fetchRideRequests();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to send counter offer');
    }
  };

  const formatDistance = (distance) => {
    if (distance < 1) {
      return `${(distance * 1000).toFixed(0)} m`;
    }
    return `${distance.toFixed(1)} km`;
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleExpand = (id) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  const renderRideRequest = (item) => {
    const isExpanded = expandedCard === item._id;
    
    return (
      <Animatable.View 
        key={item._id} 
        animation="fadeInUp" 
        duration={500} 
        delay={200}
        style={styles.requestCard}
      >
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => toggleExpand(item._id)}
        >
          <View style={styles.requestHeader}>
            <View style={styles.riderInfo}>
              <View style={styles.avatarContainer}>
                <LinearGradient
                  colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                  style={styles.avatarGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.avatarText}>
                    {item.type === 'parcel' ? '📦' : (item.passengerId?.name?.charAt(0) || '?')}
                  </Text>
                </LinearGradient>
                <View style={styles.onlineDot} />
              </View>
              <View style={styles.riderDetails}>
                <Text style={styles.riderName}>
                  {item.type === 'parcel' ? 'Parcel Delivery' : item.passengerId?.name || 'Unknown Rider'}
                </Text>
                <View style={styles.riderMeta}>
                  <Icon name="star" size={12} color={YELLOW_PRIMARY} />
                  <Text style={styles.riderRating}>
                    {item.type === 'parcel' 
                      ? `${item.parcel?.weight || 0}kg • ${item.parcel?.size || 'Medium'}` 
                      : `${item.passengerId?.stats?.rating || item.passengerId?.rating || 0}`}
                  </Text>
                  <View style={styles.metaDot} />
                  <Icon name="schedule" size={12} color={GRAY_MEDIUM} />
                  <Text style={styles.riderTime}>{formatTime(item.createdAt)}</Text>
                </View>
              </View>
            </View>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>{formatDistance(item.distance || 0)}</Text>
            </View>
          </View>

          <View style={styles.routeInfo}>
            <View style={styles.routePoint}>
              <View style={styles.routeIconGreen}>
                <Icon name="my-location" size={14} color={WHITE} />
              </View>
              <Text style={styles.routeText} numberOfLines={1}>
                {item.pickup?.address || 'Pickup location'}
              </Text>
            </View>
            
            {item.waypoints && item.waypoints.length > 0 && item.waypoints.map((wp, idx) => (
              <React.Fragment key={idx}>
                <View style={styles.routeConnector}>
                  <View style={styles.routeLine} />
                  <View style={styles.routeDot} />
                </View>
                <View style={styles.routePoint}>
                  <View style={[styles.routeIconGreen, { backgroundColor: '#FF9F43' }]}>
                    <Icon name="stop-circle" size={14} color={WHITE} />
                  </View>
                  <Text style={styles.routeText} numberOfLines={1}>
                    {wp.address || wp}
                  </Text>
                </View>
              </React.Fragment>
            ))}

            <View style={styles.routeConnector}>
              <View style={styles.routeLine} />
              <View style={styles.routeDot} />
            </View>
            <View style={styles.routePoint}>
              <View style={styles.routeIconRed}>
                <Icon name="location-on" size={14} color={WHITE} />
              </View>
              <Text style={styles.routeText} numberOfLines={1}>
                {item.dropoff?.address || 'Dropoff location'}
              </Text>
            </View>
          </View>

            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: item.pickup?.location?.coordinates?.[1] || item.pickup?.coordinates?.[1] || 37.78825,
                  longitude: item.pickup?.location?.coordinates?.[0] || item.pickup?.coordinates?.[0] || -122.4324,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                scrollEnabled={true}
                zoomEnabled={true}
              >
                {routePolylines[item._id] && routePolylines[item._id].length > 0 && (
                  <Polyline
                    coordinates={routePolylines[item._id]}
                    strokeColor="#4A90E2"
                    strokeWidth={4}
                  />
                )}
                <Marker
                  coordinate={{
                    latitude: item.pickup?.location?.coordinates?.[1] || item.pickup?.coordinates?.[1] || 37.78825,
                    longitude: item.pickup?.location?.coordinates?.[0] || item.pickup?.coordinates?.[0] || -122.4324,
                  }}
                >
                  <View style={styles.mapMarkerGreen}>
                    <Icon name="my-location" size={12} color={WHITE} />
                  </View>
                </Marker>
                <Marker
                  coordinate={{
                    latitude: item.dropoff?.location?.coordinates?.[1] || item.dropoff?.coordinates?.[1] || 37.7749,
                    longitude: item.dropoff?.location?.coordinates?.[0] || item.dropoff?.coordinates?.[0] || -122.4194,
                  }}
                >
                  <View style={styles.mapMarkerRed}>
                    <Icon name="location-on" size={12} color={WHITE} />
                  </View>
                </Marker>
              </MapView>
            </View>

          {isExpanded && (
            <Animatable.View animation="fadeIn" duration={300}>
              <View style={styles.expandedContent}>
                <View style={styles.rideDetailsGrid}>
                  <View style={styles.detailItem}>
                    <IconMC name="car-sports" size={20} color={YELLOW_PRIMARY} />
                    <Text style={styles.detailLabel}>Vehicle</Text>
                    <Text style={styles.detailValue}>
                      {item.type === 'parcel' ? 'Parcel' : (getVehicleType(item.vehicleType)?.label || 'Economy')}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Icon name="people" size={20} color={YELLOW_PRIMARY} />
                    <Text style={styles.detailLabel}>Seats</Text>
                    <Text style={styles.detailValue}>{item.seats || 1}</Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Icon name="attach-money" size={20} color={YELLOW_PRIMARY} />
                    <Text style={styles.detailLabel}>Fare</Text>
                    <Text style={styles.detailValue}>Rs. {item.fare?.offered || item.fare?.accepted || 0}</Text>
                  </View>
                </View>

                {item.type === 'parcel' && item.parcel?.description && (
                  <View style={styles.parcelNote}>
                    <Icon name="note" size={16} color={GRAY_MEDIUM} />
                    <Text style={styles.parcelNoteText}>{item.parcel.description}</Text>
                  </View>
                )}

                {item.type === 'intercity' && item.scheduledTime && (
                  <View style={styles.scheduledBadge}>
                    <Icon name="event" size={16} color={YELLOW_PRIMARY} />
                    <Text style={styles.scheduledText}>
                      Scheduled: {new Date(item.scheduledTime).toLocaleString([], { 
                        month: 'short', 
                        day: 'numeric', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </Text>
                  </View>
                )}
              </View>
            </Animatable.View>
          )}
        </TouchableOpacity>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={() => handleDecline(item._id)}
          >
            <Icon name="close" size={20} color={GRAY_MEDIUM} />
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.counterButton}
            onPress={() => {
              setSelectedRequest(item);
              setShowCounterOffer(true);
            }}
          >
            <Icon name="trending-up" size={20} color={YELLOW_PRIMARY} />
            <Text style={styles.counterButtonText}>Counter</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAccept(item)}
          >
            <LinearGradient
              colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
              style={styles.acceptGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Icon name="check" size={20} color={WHITE} />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Animatable.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={YELLOW_PRIMARY} />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={WHITE} />
      
      <View style={styles.container}>
        {/* Header with Back Arrow */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <IconIonic 
              name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} 
              size={24} 
              color={BLACK} 
            />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ride Requests</Text>
            <Text style={styles.headerSubtitle}>
              {rideRequests.length} ride{rideRequests.length !== 1 ? 's' : ''} available
            </Text>
          </View>
          <TouchableOpacity style={styles.filterButton}>
            <Icon name="filter-list" size={24} color={GRAY_DARK} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={YELLOW_PRIMARY}
              colors={[YELLOW_PRIMARY]}
            />
          }
        >
          {/* Active Ride Banner */}
          {activeRide && (
            <Animatable.View animation="fadeInUp" duration={400}>
              <TouchableOpacity 
                style={[styles.activeRideBanner, { backgroundColor: getBannerColor(activeRide.status) }]} 
                onPress={() => navigation.navigate('ActiveRide', { ride: activeRide })}
                activeOpacity={0.9}
              >
                <View style={styles.activeRideBannerContent}>
                  <View style={styles.activeRideLeft}>
                    <View style={styles.activeRideIcon}>
                      <Icon name="directions-car" size={20} color={getBannerTextColor(activeRide.status)} />
                    </View>
                    <View>
                      <Text style={[styles.activeRideBannerTitle, { color: getBannerTextColor(activeRide.status) }]}>
                        {getBannerTitle(activeRide.status)}
                      </Text>
                      <Text style={[styles.activeRideBannerSubtitle, { color: getBannerTextColor(activeRide.status) }]}>
                        {activeRide.passengerId?.name || 'Unknown'} • {activeRide.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Icon name="chevron-right" size={24} color={getBannerTextColor(activeRide.status)} />
                </View>
              </TouchableOpacity>
            </Animatable.View>
          )}

          {rideRequests.length > 0 ? (
            rideRequests.map(renderRideRequest)
          ) : (
            <Animatable.View animation="fadeIn" duration={600} style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <IconMC name="car-search" size={64} color={GRAY_LIGHT} />
              </View>
              <Text style={styles.emptyTitle}>No Requests</Text>
              <Text style={styles.emptyText}>
                There are currently no ride or parcel requests in your area.
              </Text>
              <TouchableOpacity style={styles.emptyRefreshButton} onPress={onRefresh}>
                <Text style={styles.emptyRefreshText}>Refresh</Text>
                <Icon name="refresh" size={18} color={WHITE} />
              </TouchableOpacity>
            </Animatable.View>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Counter Offer Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showCounterOffer}
          onRequestClose={() => {
            setShowCounterOffer(false);
            setCounterAmount('');
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              
              <Text style={styles.modalTitle}>Counter Offer</Text>
              <Text style={styles.modalSubtitle}>
                Original fare: Rs. {selectedRequest?.fare?.offered || selectedRequest?.fare?.accepted || 0}
              </Text>
              
              <View style={styles.modalInputContainer}>
                <Text style={styles.modalInputLabel}>Your Offer Amount</Text>
                <View style={styles.modalInputWrapper}>
                  <Text style={styles.modalCurrencySymbol}>Rs.</Text>
                  <TextInput
                    style={styles.modalInputField}
                    value={counterAmount}
                    onChangeText={setCounterAmount}
                    placeholder="Enter amount"
                    placeholderTextColor={GRAY_MEDIUM}
                    keyboardType="numeric"
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => {
                    setShowCounterOffer(false);
                    setCounterAmount('');
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalSendButton}
                  onPress={() => handleCounterOffer(selectedRequest?._id)}
                >
                  <LinearGradient
                    colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                    style={styles.modalSendGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.modalSendText}>Send Offer</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
    backgroundColor: WHITE,
    marginTop:20
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
    fontWeight: '500',
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
  headerSubtitle: {
    fontSize: 13,
    color: GRAY_MEDIUM,
    marginTop: 1,
  },
  filterButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRideBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  activeRideBannerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeRideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activeRideIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRideBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  activeRideBannerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  requestCard: {
    backgroundColor: WHITE,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
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
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4ECDC4',
    borderWidth: 2,
    borderColor: WHITE,
  },
  riderDetails: {
    flex: 1,
  },
  riderName: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  riderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  riderRating: {
    fontSize: 13,
    color: GRAY_MEDIUM,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: GRAY_MEDIUM,
    marginHorizontal: 4,
  },
  riderTime: {
    fontSize: 12,
    color: GRAY_MEDIUM,
  },
  distanceBadge: {
    backgroundColor: GRAY_LIGHT,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distanceText: {
    fontSize: 12,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  routeInfo: {
    marginTop: 12,
    paddingLeft: 4,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeIconGreen: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeIconRed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeText: {
    fontSize: 14,
    color: GRAY_DARK,
    flex: 1,
  },
  routeConnector: {
    alignItems: 'center',
    marginLeft: 11,
    paddingVertical: 2,
  },
  routeLine: {
    width: 2,
    height: 12,
    backgroundColor: '#E0E0E0',
  },
  routeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    marginTop: 2,
  },
  expandedContent: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  mapContainer: {
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapMarkerGreen: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WHITE,
  },
  mapMarkerRed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: WHITE,
  },
  rideDetailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    backgroundColor: GRAY_LIGHT,
    borderRadius: 12,
    marginBottom: 8,
  },
  detailItem: {
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 11,
    color: GRAY_MEDIUM,
    marginTop: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: BLACK,
    marginTop: 1,
  },
  parcelNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: GRAY_LIGHT,
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  parcelNoteText: {
    fontSize: 13,
    color: GRAY_DARK,
    flex: 1,
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: YELLOW_PRIMARY + '15',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  scheduledText: {
    fontSize: 13,
    color: YELLOW_PRIMARY,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  declineButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: GRAY_MEDIUM,
  },
  counterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: YELLOW_PRIMARY,
    gap: 6,
  },
  counterButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: YELLOW_PRIMARY,
  },
  acceptButton: {
    flex: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  acceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BLACK,
  },
  emptyText: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyRefreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: YELLOW_PRIMARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  emptyRefreshText: {
    fontSize: 14,
    fontWeight: '600',
    color: WHITE,
  },
  bottomSpacer: {
    height: 30,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: BLACK,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    marginBottom: 20,
  },
  modalInputContainer: {
    marginBottom: 24,
  },
  modalInputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
    marginBottom: 8,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GRAY_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  modalCurrencySymbol: {
    fontSize: 18,
    fontWeight: '600',
    color: GRAY_DARK,
    marginRight: 8,
  },
  modalInputField: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: BLACK,
    paddingVertical: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500',
    color: GRAY_MEDIUM,
  },
  modalSendButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalSendGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSendText: {
    fontSize: 16,
    fontWeight: '600',
    color: WHITE,
  },
  });
};

export default RideRequestScreen;