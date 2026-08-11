import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Image
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconFA from 'react-native-vector-icons/FontAwesome5';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import CustomPlacesAutocomplete from '../../components/common/CustomPlacesAutocomplete';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { createCarpoolBooking, getAvailableCarpools, joinCarpool, createCarpoolRequest } from '../../redux/slices/bookingSlice';
import { GOOGLE_MAPS_API_KEY } from '../../config/constants';
import { getDirections } from '../../services/maps';
import api from '../../services/api';
import socketService from '../../services/socket';
import CarpoolMapPreview from '../../components/common/CarpoolMapPreview';
import { VEHICLE_TYPES } from '../../utils/constants';

const { width, height } = Dimensions.get('window');

const BookCarpoolScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { loading, availableCarpools } = useSelector(state => state.booking);
  
  const isIntercity = route.params?.isIntercity || false;
  
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('car');
  const [searching, setSearching] = useState(false);
  const [selectedCarpool, setSelectedCarpool] = useState(null);
  const [vehicleFares, setVehicleFares] = useState({});

  const vehicleTypes = VEHICLE_TYPES.filter(v => ['car', 'ac_car', 'luxury_car'].includes(v.id));

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material': return <Icon name={icon} size={size} color={color} />;
      case 'material-community': return <IconMC name={icon} size={size} color={color} />;
      case 'fontawesome': return <IconFA name={icon} size={size} color={color} />;
      case 'feather': return <Icon name={icon} size={size} color={color} />; // fallback
      default: return <Icon name={icon} size={size} color={color} />;
    }
  };
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showCarpools, setShowCarpools] = useState(false);
  
  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const mapRef = useRef(null);
  const pickupRef = useRef(null);
  const dropoffRef = useRef(null);
  const pickerMapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerType, setMapPickerType] = useState('pickup');
  const [mapPickerCoords, setMapPickerCoords] = useState(null);
  const [mapPickerAddress, setMapPickerAddress] = useState('Loading address...');

  const [schedule, setSchedule] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // New state for carpool lists
  const [viewMode, setViewMode] = useState(route.params?.directCreate ? 'create' : 'list'); // 'list' or 'create'
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' or 'accepted'
  const [pendingRequests, setPendingRequests] = useState([]);
  const [acceptedCarpools, setAcceptedCarpools] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    animateEntrance();
    getCurrentLocation();
    fetchMyCarpools();
  }, []);

  const fetchMyCarpools = async () => {
    setListLoading(true);
    try {
      const response = await api.get(`/bookings/passenger-carpools?isIntercity=${isIntercity}`);
      if (response.data?.success) {
        setPendingRequests(response.data.pendingRequests || []);
        setAcceptedCarpools(response.data.acceptedCarpools || []);
      }
    } catch (error) {
      console.error('Fetch my carpools error:', error);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    const handleJoinAccepted = (data) => {
      fetchMyCarpools();
      Alert.alert('Request Accepted!', 'A driver has accepted your carpool request.');
    };
    
    socketService.on('join-accepted', handleJoinAccepted);
    
    return () => {
      socketService.off('join-accepted', handleJoinAccepted);
    };
  }, []);

  const calculateFare = async () => {
    if (!pickup || !dropoff) return;
    try {
      const fares = {};
      await Promise.all(vehicleTypes.map(async (v) => {
        const response = await api.post('/pricing/calculate', {
          pickup: pickup.location.coordinates ? { lng: pickup.location.coordinates[0], lat: pickup.location.coordinates[1] } : pickup.location,
          dropoff: dropoff.location.coordinates ? { lng: dropoff.location.coordinates[0], lat: dropoff.location.coordinates[1] } : dropoff.location,
          vehicle: v.id,
          city: 'Karachi', // defaulting city
          isCarpool: true,
          isIntercity: isIntercity,
          passengers: 1,
          driversAvailable: 5,
          hour: schedule ? schedule.getHours() : new Date().getHours()
        });
        fares[v.id] = response.data.fare ?? 0;
      }));
      setVehicleFares(fares);
    } catch (error) {
      console.error('Error calculating fare:', error);
    }
  };

  useEffect(() => {
    if (pickup && dropoff) {
      calculateFare();
      fetchRoute();
      searchCarpools();
    } else {
      setRouteCoords([]);
    }
  }, [pickup, dropoff, schedule]);

  const animateEntrance = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      })
    ]).start();
  };

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location is needed to set pickup.');
        setLocationLoading(false);
        return;
      }
      
      let loc = await Location.getCurrentPositionAsync({});
      let addressStr = 'Current Location';
      try {
        let geo = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        });
        if (geo.length > 0) {
          addressStr = `${geo[0].name || geo[0].street || ''}, ${geo[0].city || ''}`.replace(/^, /, '');
        }
      } catch(e) {}

      setPickup({
        address: addressStr,
        location: { coordinates: [loc.coords.longitude, loc.coords.latitude] }
      });
      pickupRef.current?.setAddressText(addressStr);
    } catch (e) {
      console.log('Location error', e);
    } finally {
      setLocationLoading(false);
    }
  };

  const openMapPicker = async (type) => {
    setMapPickerType(type);
    setMapPickerVisible(true);
    let coords = type === 'pickup' && pickup ? 
      { latitude: pickup.location.coordinates[1], longitude: pickup.location.coordinates[0] } :
      type === 'dropoff' && dropoff ? 
      { latitude: dropoff.location.coordinates[1], longitude: dropoff.location.coordinates[0] } : null;

    if (!coords) {
       try {
         let loc = await Location.getCurrentPositionAsync({});
         coords = loc.coords;
       } catch (e) {
         coords = { latitude: 33.6844, longitude: 73.0479 };
       }
    }
    setMapPickerCoords(coords);
    setMapPickerAddress('Loading address...');
  };

  const onPickerRegionChangeComplete = async (region) => {
    setMapPickerCoords(region);
    try {
      let geo = await Location.reverseGeocodeAsync({
        latitude: region.latitude,
        longitude: region.longitude
      });
      if (geo.length > 0) {
        setMapPickerAddress(`${geo[0].name || geo[0].street || ''}, ${geo[0].city || ''}`.replace(/^, /, ''));
      } else {
        setMapPickerAddress('Unknown Location');
      }
    } catch(e) {
      setMapPickerAddress('Unknown Location');
    }
  };

  const confirmMapPicker = () => {
    if (!mapPickerCoords) return;
    const data = {
      address: mapPickerAddress,
      location: {
        type: 'Point',
        coordinates: [mapPickerCoords.longitude, mapPickerCoords.latitude]
      }
    };
    if (mapPickerType === 'pickup') {
      setPickup(data);
      pickupRef.current?.setAddressText(data.address);
    } else {
      setDropoff(data);
      dropoffRef.current?.setAddressText(data.address);
    }
    setMapPickerVisible(false);
  };

  const fetchRoute = async () => {
    if (!pickup?.location?.coordinates || !dropoff?.location?.coordinates) return;

    // Shared maps service: picks the fastest route, decodes the road polyline,
    // logs the real Google error, and falls back to a flagged estimate.
    const route = await getDirections(pickup, dropoff);
    if (!route) return;

    setRouteCoords(route.coordinates);
    setRouteInfo({
      distanceText: route.distanceText,
      durationText: route.durationText,
      isEstimate: route.isFallback,
    });

    if (mapRef.current && route.coordinates.length) {
      mapRef.current.fitToCoordinates(route.coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  const searchCarpools = async () => {
    if (!pickup || !dropoff) return;
    
    setSearching(true);
    try {
      await dispatch(getAvailableCarpools({
        pickup: JSON.stringify(pickup.location.coordinates),
        dropoff: JSON.stringify(dropoff.location.coordinates),
        vehicleType: selectedVehicle,
        isIntercity
      }));
      setShowCarpools(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to find carpools. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handlePostRequest = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Missing Info', 'Please select both pickup and destination locations.');
      return;
    }
    
    if (schedule <= new Date()) {
      Alert.alert('Invalid Date', 'Please select a future date and time for your carpool.');
      return;
    }

    try {
      setSearching(true);
      await dispatch(createCarpoolRequest({
        pickup,
        dropoff,
        timeWindow: {
          start: schedule,
          end: new Date(schedule.getTime() + 60 * 60 * 1000) // 1 hour window
        },
        vehicleType: selectedVehicle,
        isIntercity
      })).unwrap();

      Alert.alert('Success', 'Carpool request posted!', [
        { text: 'OK', onPress: () => {
          if (route.params?.directCreate) {
            navigation.goBack();
          } else {
            setViewMode('list');
            fetchMyCarpools();
          }
        }}
      ]);
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to post carpool request');
    } finally {
      setSearching(false);
    }
  };

  const handleJoinCarpool = async (carpool) => {
    setSelectedCarpool(carpool);
    setShowJoinModal(true);
  };

  const confirmJoinCarpool = async () => {
    if (!selectedCarpool) return;
    
    try {
      await dispatch(joinCarpool({ 
        carpoolId: selectedCarpool._id,
        pickup,
        dropoff
      })).unwrap();
      
      Alert.alert(
        'Success! 🎉',
        'You have successfully joined the carpool!',
        [
          {
            text: 'View Details',
            onPress: () => {
              setShowJoinModal(false);
              navigation.navigate('CarpoolDetails', { carpoolId: selectedCarpool._id });
            }
          },
          {
            text: 'OK',
            onPress: () => setShowJoinModal(false)
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to join carpool');
      setShowJoinModal(false);
    }
  };

  const renderCarpoolItem = ({ item, index }) => {
    const isFull = item.carpool.seatsAvailable === 0;
    const isExpired = new Date(item.timeWindow.start) < new Date();
    
    return (
      <Animatable.View 
        animation="fadeInUp" 
        duration={400} 
        delay={index * 100}
      >
        <TouchableOpacity
          style={[styles.carpoolCard, isFull && styles.carpoolCardFull]}
          onPress={() => !isFull && !isExpired && handleJoinCarpool(item)}
          disabled={isFull || isExpired}
          activeOpacity={0.8}
        >
          <View style={[
            styles.carpoolCardContent,
            isFull && styles.carpoolCardFullContent
          ]}>
            <View style={styles.carpoolHeader}>
              <View style={styles.carpoolUser}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userInitial}>
                    {item.driverId?.userId?.name?.charAt(0) || 'U'}
                  </Text>
                </View>
                <View>
                  <Text style={styles.carpoolName}>{item.driverId?.userId?.name || 'Driver'}</Text>
                  <View style={styles.ratingContainer}>
                    <Icon name="star" size={12} color={colors.accent} />
                    <Text style={styles.ratingText}>{item.driverId?.stats?.rating || 0}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.seatsBadge, isFull && styles.seatsBadgeFull]}>
                <IconMC name="account-group" size={16} color={isFull ? '#999' : colors.accent} />
                <Text style={[styles.seatsText, isFull && styles.seatsTextFull]}>
                  {item.carpool.seatsAvailable}
                </Text>
              </View>
            </View>
            
            <View style={styles.carpoolRoute}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#4ECDC4' }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {item.pickup.address}
                </Text>
              </View>
              <View style={styles.routeLineContainer}>
                <View style={styles.routeLine} />
                <View style={styles.routeTime}>
                  <Icon name="access-time" size={12} color={colors.textSecondary} />
                  <Text style={styles.routeTimeText}>
                    {item.timeWindow?.start ? new Date(item.timeWindow.start).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    }) : 'N/A'}
                  </Text>
                </View>
              </View>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: '#FF6B6B' }]} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {item.dropoff.address}
                </Text>
              </View>
            </View>
            
            <View style={styles.carpoolFooter}>
              <View style={styles.carpoolMeta}>
                <View style={styles.metaItem}>
                  <Icon name="event" size={14} color={colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {item.timeWindow?.start ? new Date(item.timeWindow.start).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.metaItem}>
                  <Icon name="person" size={14} color={colors.textSecondary} />
                  <Text style={styles.metaText}>
                    {item.passengers?.length || 0} riders
                  </Text>
                </View>
              </View>
              <Text style={[styles.carpoolPrice, isFull && styles.carpoolPriceFull]}>
                ₨ {item.carpool?.pricePerSeat || 'N/A'}
              </Text>
            </View>

            {isFull && (
              <View style={styles.fullBadge}>
                <Text style={styles.fullBadgeText}>FULL</Text>
              </View>
            )}
            {isExpired && !isFull && (
              <View style={styles.expiredBadge}>
                <Text style={styles.expiredBadgeText}>EXPIRED</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const handleCancelCarpool = async (carpoolId) => {
    Alert.alert(
      'Cancel Carpool Request',
      'Are you sure you want to cancel this carpool request?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/bookings/carpool/request/${carpoolId}`);
              if (res.data?.success) {
                Alert.alert('Success', 'Carpool request cancelled.');
                fetchMyCarpools();
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to cancel carpool request');
            }
          }
        }
      ]
    );
  };

  const handleLeaveCarpool = async (carpoolId) => {
    Alert.alert(
      'Leave Carpool',
      'Are you sure you want to leave this carpool?',
      [
        { text: 'No', style: 'cancel' },
        { 
          text: 'Yes, Leave', 
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.post(`/bookings/carpool/${carpoolId}/leave`);
              if (res.data?.success) {
                Alert.alert('Success', 'Left carpool successfully.');
                fetchMyCarpools();
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to leave carpool');
            }
          }
        }
      ]
    );
  };

  const renderMyCarpool = ({ item, index }) => {
    const isAccepted = item.status === 'accepted' || item.status === 'confirmed' || item.status === 'in-progress';
    const driver = item.driverId?.userId || item.driverId;

    return (
      <Animatable.View animation="fadeInUp" duration={400} delay={index * 100}>
        <View style={[styles.recentRideCard, isAccepted && styles.acceptedRideCard]}>
          <View style={styles.recentRideHeader}>
            <Text style={styles.recentRideTime}>
              {item.carpool?.departureTime ? new Date(item.carpool.departureTime).toLocaleString([], { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : 
              item.timeWindow?.start ? new Date(item.timeWindow.start).toLocaleString([], { 
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
              }) : 'Invalid Date'}
            </Text>
            <View style={[
              styles.rideStatus,
              { backgroundColor: item.status === 'searching' ? colors.accent : '#4ECDC4' }
            ]}>
              <Text style={[styles.rideStatusText, item.status === 'searching' && { color: colors.text }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {driver && isAccepted && (
            <View style={styles.driverInfo}>
              <View style={styles.driverAvatar}>
                <Icon name="person" size={18} color="#FFF" />
              </View>
              <View style={styles.driverInfoText}>
                <Text style={styles.driverName}>Driver: {driver.name || 'Unknown'}</Text>
                {driver.phoneNumber && <Text style={styles.driverPhone}>{driver.phoneNumber}</Text>}
              </View>
            </View>
          )}

          <View style={styles.routeInfo}>
            <View style={styles.routeInfoItem}>
              <Icon name="my-location" size={16} color="#4ECDC4" />
              <Text style={styles.routeInfoText} numberOfLines={1}>{item.pickup?.address || 'Pickup'}</Text>
            </View>
            <View style={styles.routeInfoItem}>
              <Icon name="location-on" size={16} color="#FF6B6B" />
              <Text style={styles.routeInfoText} numberOfLines={1}>{item.dropoff?.address || 'Dropoff'}</Text>
            </View>
          </View>

          <CarpoolMapPreview 
            pickup={item.pickup} 
            dropoff={item.dropoff} 
            style={styles.previewMap} 
          />

          {(item.status !== 'completed' && item.status !== 'cancelled') && (
            <View style={styles.recentRideActions}>
              <TouchableOpacity 
                onPress={() => item.driverId && !item.passengerId ? handleLeaveCarpool(item._id) : handleCancelCarpool(item._id)} 
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>
                  {item.driverId && !item.passengerId ? 'Leave Carpool' : 'Cancel Request'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Animatable.View>
    );
  };

  const renderListView = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.listHeaderTitle}>{isIntercity ? 'Intercity Carpools' : 'My Carpools'}</Text>
        <TouchableOpacity style={styles.notificationButton}>
          <Icon name="notifications-none" size={24} color={colors.text} />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]} 
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>Pending</Text>
          {pendingRequests.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingRequests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'accepted' && styles.activeTab]} 
          onPress={() => setActiveTab('accepted')}
        >
          <Text style={[styles.tabText, activeTab === 'accepted' && styles.activeTabText]}>Accepted</Text>
          {acceptedCarpools.length > 0 && (
            <View style={[styles.tabBadge, styles.tabBadgeGreen]}>
              <Text style={styles.tabBadgeText}>{acceptedCarpools.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {listLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'pending' ? pendingRequests : acceptedCarpools}
          renderItem={renderMyCarpool}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <IconMC name="car-parking" size={80} color="#E0E0E0" />
              <Text style={styles.emptyStateTitle}>No {activeTab} carpools</Text>
              <Text style={styles.emptyStateSubtext}>
                {activeTab === 'pending' 
                  ? 'You haven\'t posted any carpool requests yet.' 
                  : 'No accepted carpools yet.'}
              </Text>
            </View>
          }
          refreshing={listLoading}
          onRefresh={fetchMyCarpools}
        />
      )}

      <View style={styles.floatingBtnContainer}>
        <TouchableOpacity 
          style={styles.createNewBtn}
          onPress={() => setViewMode('create')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.accent, '#F5A623']}
            style={styles.createNewGradient}
          >
            <Icon name="add" size={24} color={colors.text} />
            <Text style={styles.createNewText}>Create New Carpool</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {viewMode === 'list' ? renderListView() : (
          <Animated.View style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}>
            {/* Header */}
            <View style={styles.createHeader}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => route.params?.directCreate ? navigation.goBack() : setViewMode('list')}
              >
                <Icon name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.createHeaderTitle}>{isIntercity ? 'Intercity Carpool' : 'Create Request'}</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView 
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Map Section */}
              <Animatable.View animation="fadeIn" duration={600} style={styles.mapContainer}>
                {locationLoading ? (
                  <View style={styles.mapLoading}>
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.mapLoadingText}>Finding your location...</Text>
                  </View>
                ) : (
                  <MapView
                    ref={mapRef}
                    style={styles.map}
                    initialRegion={{
                      latitude: pickup?.location?.coordinates[1] || 33.6844,
                      longitude: pickup?.location?.coordinates[0] || 73.0479,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }}
                  >
                    {pickup?.location?.coordinates && (
                      <Marker
                        coordinate={{
                          latitude: pickup.location.coordinates[1],
                          longitude: pickup.location.coordinates[0],
                        }}
                        title="Pickup"
                      >
                        <View style={styles.pickupMarker}>
                          <View style={styles.markerInner} />
                        </View>
                      </Marker>
                    )}
                    {dropoff?.location?.coordinates && (
                      <Marker
                        coordinate={{
                          latitude: dropoff.location.coordinates[1],
                          longitude: dropoff.location.coordinates[0],
                        }}
                        title="Dropoff"
                      >
                        <View style={styles.dropoffMarker}>
                          <Icon name="flag" size={18} color="#FFF" />
                        </View>
                      </Marker>
                    )}
                    {routeCoords.length > 0 && (
                      <Polyline
                        coordinates={routeCoords}
                        strokeWidth={4}
                        strokeColor="#F9C349"
                      />
                    )}
                  </MapView>
                )}
                <TouchableOpacity style={styles.mapOverlayBtn} onPress={() => openMapPicker('pickup')}>
                  <Icon name="edit-location" size={20} color={colors.accent} />
                </TouchableOpacity>
              </Animatable.View>

              {/* Location Section */}
              <Animatable.View 
                animation="fadeInUp" 
                duration={600} 
                delay={100}
                style={styles.locationSection}
              >
                <View style={styles.locationHeader}>
                  <Text style={styles.locationTitle}>📍 Where are you going?</Text>
                  <TouchableOpacity 
                    style={styles.useCurrentButton}
                    onPress={getCurrentLocation}
                  >
                    <Icon name="my-location" size={18} color={colors.accent} />
                    <Text style={styles.useCurrentText}>Current</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={[styles.locationInputWrapper, { zIndex: 2 }]}>
                  <View style={styles.locationDot}>
                    <View style={[styles.dot, { backgroundColor: '#4ECDC4' }]} />
                    <View style={styles.dotLine} />
                  </View>
                  <View style={styles.locationInputContainer}>
                    <CustomPlacesAutocomplete
                      ref={pickupRef}
                      placeholder="Pickup Location"
                      onPress={(data, details = null) => {
                        setPickup({
                          address: data.description,
                          location: {
                            type: 'Point',
                            coordinates: [
                              details.geometry.location.lng,
                              details.geometry.location.lat
                            ]
                          },
                          placeId: data.place_id
                        });
                      }}
                      styles={{
                        textInputContainer: styles.pickupInputContainer,
                        textInput: styles.pickupTextInput,
                        container: styles.autocompleteContainer,
                        listView: styles.autocompleteList,
                        row: styles.autocompleteRow,
                        description: styles.autocompleteDescription
                      }}
                      placeholderTextColor={colors.textSecondary}
                      renderRightButton={() => (
                        <TouchableOpacity onPress={() => openMapPicker('pickup')} style={styles.mapIconBtn}>
                          <Icon name="map" size={22} color="#4ECDC4" />
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </View>

                <View style={styles.locationDivider} />

                <View style={[styles.locationInputWrapper, { zIndex: 1 }]}>
                  <View style={styles.locationDot}>
                    <View style={[styles.dot, { backgroundColor: '#FF6B6B' }]} />
                  </View>
                  <View style={styles.locationInputContainer}>
                    <CustomPlacesAutocomplete
                      ref={dropoffRef}
                      placeholder="Destination"
                      onPress={(data, details = null) => {
                        setDropoff({
                          address: data.description,
                          location: {
                            type: 'Point',
                            coordinates: [
                              details.geometry.location.lng,
                              details.geometry.location.lat
                            ]
                          },
                          placeId: data.place_id
                        });
                      }}
                      styles={{
                        textInputContainer: styles.dropoffInputContainer,
                        textInput: styles.dropoffTextInput,
                        container: styles.autocompleteContainer,
                        listView: styles.autocompleteList,
                        row: styles.autocompleteRow,
                        description: styles.autocompleteDescription
                      }}
                      placeholderTextColor={colors.textSecondary}
                      renderRightButton={() => (
                        <TouchableOpacity onPress={() => openMapPicker('dropoff')} style={styles.mapIconBtn}>
                          <Icon name="map" size={22} color="#FF6B6B" />
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                </View>
                
                <View style={styles.locationDivider} />
                
                {/* Schedule Section - Attractive Design */}
                <Animatable.View animation="fadeIn" duration={500} style={styles.scheduleSection}>
                  <View style={styles.scheduleHeader}>
                    <View style={styles.scheduleHeaderLeft}>
                      <View style={styles.scheduleIcon}>
                        <Icon name="event" size={20} color={colors.accent} />
                      </View>
                      <Text style={styles.scheduleTitle}>Schedule</Text>
                    </View>
                    <View style={styles.scheduleBadge}>
                      <Text style={styles.scheduleBadgeText}>Set Time</Text>
                    </View>
                  </View>

                  <View style={styles.scheduleCard}>
                    <TouchableOpacity 
                      style={styles.schedulePicker}
                      onPress={() => setShowDatePicker(true)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.schedulePickerLeft}>
                        <Icon name="calendar-today" size={22} color={colors.accent} />
                        <Text style={styles.schedulePickerLabel}>Date</Text>
                      </View>
                      <View style={styles.schedulePickerValue}>
                        <Text style={styles.schedulePickerText}>
                          {schedule.toLocaleDateString([], { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </Text>
                        <Icon name="chevron-right" size={20} color={colors.textSecondary} />
                      </View>
                    </TouchableOpacity>

                    <View style={styles.scheduleDivider} />

                    <TouchableOpacity 
                      style={styles.schedulePicker}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.schedulePickerLeft}>
                        <Icon name="access-time" size={22} color={colors.accent} />
                        <Text style={styles.schedulePickerLabel}>Time</Text>
                      </View>
                      <View style={styles.schedulePickerValue}>
                        <Text style={styles.schedulePickerText}>
                          {schedule.toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            hour12: true 
                          })}
                        </Text>
                        <Icon name="chevron-right" size={20} color={colors.textSecondary} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.scheduleNote}>
                    <Icon name="info-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.scheduleNoteText}>
                      Select a future date and time for your carpool
                    </Text>
                  </View>
                </Animatable.View>

                {showDatePicker && (
                  <DateTimePicker
                    value={schedule}
                    mode="date"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate) {
                        const newDate = new Date(schedule);
                        newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
                        setSchedule(newDate);
                        setShowTimePicker(true);
                      }
                    }}
                  />
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={schedule}
                    mode="time"
                    display="default"
                    onChange={(event, selectedDate) => {
                      setShowTimePicker(false);
                      if (selectedDate) {
                        const newDate = new Date(schedule);
                        newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
                        setSchedule(newDate);
                      }
                    }}
                  />
                )}
              </Animatable.View>

              <Animatable.View animation="fadeInUp" duration={600} delay={200} style={styles.section}>
                <Text style={styles.sectionTitle}>Select Vehicle</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vehicleScroll}>
                  {vehicleTypes.map(vehicle => {
                    const isSelected = selectedVehicle === vehicle.id;
                    return (
                      <TouchableOpacity 
                        key={vehicle.id} 
                        style={[
                          styles.vehicleCard, 
                          isSelected && styles.vehicleCardSelected
                        ]} 
                        onPress={() => setSelectedVehicle(vehicle.id)}
                        activeOpacity={0.8}
                      >
                        <View style={[
                          styles.vehicleIconContainer, 
                          isSelected && styles.vehicleIconSelected,
                          { backgroundColor: isSelected ? vehicle.color + '15' : '#f5f5f5' }
                        ]}>
                          {getIcon(
                            vehicle.icon, 
                            vehicle.iconType, 
                            32, 
                            isSelected ? vehicle.color : '#999'
                          )}
                        </View>
                        <Text style={[
                          styles.vehicleLabel, 
                          isSelected && { color: vehicle.color }
                        ]}>
                          {vehicle.label}
                        </Text>
                        <Text style={[styles.vehiclePrice, isSelected && { color: vehicle.color, fontSize: 14 }]}>
                          ₨ {vehicleFares[vehicle.id] ? Math.round(vehicleFares[vehicle.id]?.total ?? vehicleFares[vehicle.id]) : vehicle.price}
                        </Text>
                        {isSelected && (
                          <View style={styles.vehicleSelectedBadge}>
                            <Icon name="check-circle" size={20} color={colors.accent} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </Animatable.View>

              {/* Available Carpools */}
              {showCarpools && (
                <Animatable.View 
                  animation="fadeInUp" 
                  duration={600} 
                  delay={300}
                  style={styles.section}
                >
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>🚗 Available Carpools</Text>
                    <View style={styles.carpoolCountBadge}>
                      <Text style={styles.carpoolCount}>
                        {availableCarpools.length}
                      </Text>
                    </View>
                  </View>
                  
                  {searching ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={colors.accent} />
                      <Text style={styles.loadingText}>Searching for carpools...</Text>
                    </View>
                  ) : availableCarpools.length > 0 ? (
                    <FlatList
                      data={availableCarpools}
                      renderItem={renderCarpoolItem}
                      keyExtractor={item => item._id}
                      scrollEnabled={false}
                      contentContainerStyle={styles.carpoolsList}
                    />
                  ) : (
                    <View style={styles.noCarpools}>
                      <IconMC name="car-off" size={60} color="#D0D0D0" />
                      <Text style={styles.noCarpoolsText}>No carpools found</Text>
                      <Text style={styles.noCarpoolsSubtext}>
                        We couldn't find a driver going that way right now.
                      </Text>
                    </View>
                  )}
                </Animatable.View>
              )}

              {/* Post Request Button */}
              <Animatable.View animation="fadeInUp" duration={600} delay={400}>
                <TouchableOpacity
                  style={[
                    styles.requestButton,
                    (!pickup || !dropoff || searching) && styles.requestButtonDisabled
                  ]}
                  onPress={handlePostRequest}
                  disabled={!pickup || !dropoff || searching}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={(!pickup || !dropoff) ? ['#E0E0E0', '#D0D0D0'] : [colors.accent, '#F5A623']}
                    style={styles.requestButtonGradient}
                  >
                    <Icon name="add-circle" size={22} color={(!pickup || !dropoff) ? '#999' : '#000'} />
                    <Text style={[
                      styles.requestButtonText,
                      (!pickup || !dropoff) && { color: colors.textSecondary }
                    ]}>
                      Post Carpool Request
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animatable.View>

              <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Map Picker Modal */}
            <Modal
              visible={mapPickerVisible}
              animationType="slide"
              transparent={false}
            >
              <View style={styles.mapPickerContainer}>
                <View style={styles.mapPickerHeader}>
                  <TouchableOpacity onPress={() => setMapPickerVisible(false)} style={styles.mapPickerClose}>
                    <Icon name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={styles.mapPickerTitle}>
                    Select {mapPickerType === 'pickup' ? 'Pickup' : 'Destination'}
                  </Text>
                  <View style={{ width: 40 }} />
                </View>
                {mapPickerCoords && (
                  <View style={styles.mapWrapper}>
                    <MapView
                      ref={pickerMapRef}
                      style={styles.pickerMap}
                      initialRegion={{
                        latitude: mapPickerCoords.latitude,
                        longitude: mapPickerCoords.longitude,
                        latitudeDelta: 0.01,
                        longitudeDelta: 0.01,
                      }}
                      onRegionChangeComplete={onPickerRegionChangeComplete}
                    />
                    <View style={styles.mapMarkerFixed}>
                      <Icon name="location-on" size={44} color={mapPickerType === 'pickup' ? '#4ECDC4' : '#FF6B6B'} />
                    </View>
                  </View>
                )}
                <View style={styles.mapPickerFooter}>
                  <Text style={styles.mapPickerAddressText}>{mapPickerAddress}</Text>
                  <TouchableOpacity style={styles.mapPickerConfirmBtn} onPress={confirmMapPicker}>
                    <Text style={styles.mapPickerConfirmText}>Confirm Location</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

            {/* Join Carpool Modal */}
            <Modal
              visible={showJoinModal}
              animationType="slide"
              transparent
              onRequestClose={() => setShowJoinModal(false)}
            >
              <View style={styles.modalOverlay}>
                <TouchableOpacity 
                  style={styles.modalBackdrop}
                  activeOpacity={1}
                  onPress={() => setShowJoinModal(false)}
                />
                <Animatable.View 
                  animation="slideInUp" 
                  duration={400}
                  style={styles.modalContent}
                >
                  <View style={styles.modalCard}>
                    <View style={styles.modalHeader}>
                      <View style={styles.modalHeaderLeft}>
                        <View style={styles.modalIcon}>
                          <IconMC name="account-group" size={24} color={colors.text} />
                        </View>
                        <View>
                          <Text style={styles.modalTitle}>Join Carpool</Text>
                          <Text style={styles.modalSubtitle}>
                            with {selectedCarpool?.driverId?.userId?.name || 'Driver'}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity 
                        onPress={() => setShowJoinModal(false)}
                        style={styles.modalClose}
                      >
                        <Icon name="close" size={24} color={colors.text} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.modalBody}>
                      <View style={styles.modalRoute}>
                        <View style={styles.modalRoutePoint}>
                          <View style={[styles.modalDot, { backgroundColor: '#4ECDC4' }]} />
                          <Text style={styles.modalRouteText}>
                            {selectedCarpool?.pickup?.address}
                          </Text>
                        </View>
                        <View style={styles.modalRouteLine} />
                        <View style={styles.modalRoutePoint}>
                          <View style={[styles.modalDot, { backgroundColor: '#FF6B6B' }]} />
                          <Text style={styles.modalRouteText}>
                            {selectedCarpool?.dropoff?.address}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.modalDetails}>
                        <View style={styles.modalDetailItem}>
                          <Icon name="access-time" size={18} color={colors.textSecondary} />
                          <Text style={styles.modalDetailText}>
                            {selectedCarpool?.timeWindow?.start ? new Date(selectedCarpool.timeWindow.start).toLocaleString() : 'N/A'}
                          </Text>
                        </View>
                        <View style={styles.modalDetailItem}>
                          <IconMC name="account-group" size={18} color={colors.textSecondary} />
                          <Text style={styles.modalDetailText}>
                            {selectedCarpool?.carpool?.seatsAvailable} seats available
                          </Text>
                        </View>
                        <View style={styles.modalDetailItem}>
                          <Icon name="attach-money" size={18} color={colors.textSecondary} />
                          <Text style={styles.modalDetailText}>
                            ₨ {selectedCarpool?.carpool?.pricePerSeat || 'N/A'} per person
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.modalJoinButton}
                        onPress={confirmJoinCarpool}
                        activeOpacity={0.8}
                      >
                        <LinearGradient
                          colors={[colors.accent, '#F5A623']}
                          style={styles.modalJoinGradient}
                        >
                          <Icon name="check" size={20} color={colors.text} />
                          <Text style={styles.modalJoinText}>Confirm Join</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Animatable.View>
              </View>
            </Modal>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => {
  const cardBg = isDark ? colors.card : '#FFFFFF';
  const insetBg = isDark ? colors.cardElevated : '#F5F5F5';
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: cardBg,
  },
  container: {
    flex: 1,
    backgroundColor: cardBg,
  },
  // List View Styles
  listContainer: {
    flex: 1,
    backgroundColor: cardBg,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: cardBg,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  notificationButton: {
    padding: 4,
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  tabContainer: { 
    flexDirection: 'row', 
    backgroundColor: cardBg,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: { 
    flex: 1, 
    paddingVertical: 12, 
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    borderRadius: 12,
    marginHorizontal: 4,
    position: 'relative',
  },
  activeTab: { 
    backgroundColor: colors.accent + '15',
  },
  tabText: { 
    color: colors.textSecondary, 
    fontSize: 15,
    fontWeight: '500',
  },
  activeTabText: { 
    color: colors.text,
    fontWeight: '600',
  },
  tabBadge: {
    marginLeft: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeGreen: {
    backgroundColor: '#4ECDC4',
  },
  tabBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  // Create View Styles
  createHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: cardBg,
  },
  createHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  backButton: {
    padding: 4,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mapContainer: {
    height: 200,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: insetBg,
    position: 'relative',
  },
  mapLoading: {
    flex: 1,
    backgroundColor: insetBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapLoadingText: {
    color: colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  map: {
    flex: 1,
  },
  mapOverlayBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(78, 205, 196, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  markerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4ECDC4',
  },
  dropoffMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  locationSection: {
    backgroundColor: cardBg,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  useCurrentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accent + '15',
    borderRadius: 20,
  },
  useCurrentText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '500',
  },
  locationInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDot: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  locationInputContainer: {
    flex: 1,
  },
  pickupInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: insetBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickupTextInput: {
    color: colors.text,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    backgroundColor: 'transparent',
  },
  dropoffInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: insetBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropoffTextInput: {
    color: colors.text,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    backgroundColor: 'transparent',
  },
  autocompleteContainer: {
    flex: 1,
    zIndex: 999,
  },
  autocompleteList: {
    backgroundColor: cardBg,
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  autocompleteRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  autocompleteDescription: {
    color: colors.text,
    fontSize: 14,
  },
  locationDivider: {
    height: 0,
    marginVertical: 0,
  },
  // Schedule Section Styles
  scheduleSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  scheduleBadge: {
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scheduleBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '500',
  },
  scheduleCard: {
    backgroundColor: insetBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  schedulePicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: cardBg,
  },
  schedulePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  schedulePickerLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  schedulePickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  schedulePickerText: {
    color: colors.text,
    fontSize: 14,
  },
  scheduleDivider: {
    height: 1,
    backgroundColor: insetBg,
  },
  scheduleNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  scheduleNoteText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: cardBg,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  vehicleScroll: {
    flexDirection: 'row',
    paddingBottom: 4,
  },
  vehicleCard: { 
    width: 140, 
    backgroundColor: cardBg, 
    borderRadius: 16, 
    padding: 16, 
    marginRight: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  vehicleCardSelected: { 
    borderColor: colors.accent,
    borderWidth: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  vehicleIconContainer: { 
    width: 64, 
    height: 64, 
    borderRadius: 32, 
    backgroundColor: '#f5f5f5', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 10,
  },
  vehicleIconSelected: {
    backgroundColor: colors.accent + '15',
  },
  vehicleLabel: { 
    color: '#1a1a1a', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 2,
  },
  vehiclePrice: { 
    color: colors.textSecondary, 
    fontSize: 13,
    fontWeight: '600',
  },
  vehicleSelectedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  carpoolCountBadge: {
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  carpoolCount: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  carpoolsList: {
    gap: 12,
  },
  carpoolCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  carpoolCardFull: {
    opacity: 0.7,
  },
  carpoolCardFullContent: {
    backgroundColor: insetBg,
  },
  carpoolCardContent: {
    padding: 16,
  },
  carpoolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  carpoolUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInitial: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: 'bold',
  },
  carpoolName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  seatsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  seatsBadgeFull: {
    backgroundColor: insetBg,
  },
  seatsText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  seatsTextFull: {
    color: colors.textSecondary,
  },
  carpoolRoute: {
    marginBottom: 12,
    paddingLeft: 4,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingVertical: 4,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: '#E0E0E0',
  },
  routeTime: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: insetBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
    gap: 4,
  },
  routeTimeText: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  routeText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  carpoolFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  carpoolMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  carpoolPrice: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  carpoolPriceFull: {
    color: colors.textSecondary,
  },
  fullBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fullBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  expiredBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#999',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  expiredBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  noCarpools: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  noCarpoolsText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  noCarpoolsSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  requestButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  requestButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  requestButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  requestButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 20,
  },
  // Recent Ride Card Styles
  recentRideCard: {
    backgroundColor: cardBg,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  acceptedRideCard: {
    borderColor: '#4ECDC4',
    borderWidth: 2,
  },
  recentRideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recentRideTime: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rideStatus: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rideStatusText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  driverAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverInfoText: {
    marginLeft: 10,
  },
  driverName: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  driverPhone: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  routeInfo: {
    marginBottom: 12,
    gap: 6,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeInfoText: {
    color: colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  previewMap: {
    height: 160,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  recentRideActions: {
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  floatingBtnContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  createNewBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  createNewGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  createNewText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  emptyStateSubtext: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    maxHeight: height * 0.8,
  },
  modalCard: {
    backgroundColor: cardBg,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalClose: {
    padding: 4,
  },
  modalBody: {
    gap: 20,
  },
  modalRoute: {
    backgroundColor: insetBg,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalRoutePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalRouteLine: {
    width: 2,
    height: 12,
    backgroundColor: '#E0E0E0',
    marginLeft: 3,
  },
  modalRouteText: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
  },
  modalDetails: {
    gap: 8,
  },
  modalDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: insetBg,
    padding: 12,
    borderRadius: 10,
  },
  modalDetailText: {
    color: colors.text,
    fontSize: 14,
  },
  modalJoinButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  modalJoinGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  modalJoinText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  // Map Picker Styles
  mapPickerContainer: {
    flex: 1,
    backgroundColor: cardBg,
  },
  mapPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: cardBg,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mapPickerClose: {
    padding: 4,
  },
  mapPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  mapWrapper: {
    flex: 1,
  },
  pickerMap: {
    flex: 1,
  },
  mapMarkerFixed: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -44,
    zIndex: 10,
    backgroundColor: cardBg,
    borderRadius: 28,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  mapPickerFooter: {
    backgroundColor: cardBg,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mapPickerAddressText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  mapPickerConfirmBtn: {
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapPickerConfirmText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  mapIconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  });
};

export default BookCarpoolScreen;