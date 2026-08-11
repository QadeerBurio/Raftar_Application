import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  FlatList,
  Linking,
  Image
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconFeather from 'react-native-vector-icons/Feather';
import IconFontAwesome from 'react-native-vector-icons/FontAwesome5';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { VEHICLE_TYPES } from '../../utils/constants';
import CustomPlacesAutocomplete from '../../components/common/CustomPlacesAutocomplete';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Animatable from 'react-native-animatable';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createRide, acceptCounterOffer } from '../../redux/slices/rideSlice';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { GOOGLE_MAPS_API_KEY } from '../../config/constants';
import { getDirections } from '../../services/maps';
import Button from '../../components/common/Button';
import CarpoolMapPreview from '../../components/common/CarpoolMapPreview';

const { width, height } = Dimensions.get('window');

const BookIntercityScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const socket = useSocket();

  const [viewMode, setViewMode] = useState('list');
  const [intercityMode, setIntercityMode] = useState('private');
  const [activeTab, setActiveTab] = useState('pending');

  const [myRides, setMyRides] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState('car');
  const [fareMode, setFareMode] = useState('ai');
  const [offerPrice, setOfferPrice] = useState('');
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [vehicleFares, setVehicleFares] = useState({});
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [searchingDriver, setSearchingDriver] = useState(false);

  const [schedule, setSchedule] = useState(new Date(Date.now() + 3600000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const mapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);

  const pickupRef = useRef(null);
  const dropoffRef = useRef(null);
  const [locationLoading, setLocationLoading] = useState(true);

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerType, setMapPickerType] = useState('pickup');
  const [mapPickerCoords, setMapPickerCoords] = useState(null);
  const [mapPickerAddress, setMapPickerAddress] = useState('Loading address...');
  const pickerMapRef = useRef(null);

  useEffect(() => {
    animateEntrance();
    fetchMyIntercityRides();

    if (socket) {
      const refreshList = () => {
        fetchMyIntercityRides();
      };
      socket.on('counter-offer-received', refreshList);
      socket.on('ride-accepted', refreshList);
      return () => {
        socket.off('counter-offer-received', refreshList);
        socket.off('ride-accepted', refreshList);
      };
    }
  }, [socket]);

  useFocusEffect(
    React.useCallback(() => {
      if (viewMode === 'list') {
        fetchMyIntercityRides();
      }
    }, [viewMode])
  );

  useEffect(() => {
    if (viewMode === 'create' && locationLoading) {
      getCurrentLocation();
    }
  }, [viewMode]);

  useEffect(() => {
    if (pickup && dropoff) {
      calculateFare();
      fetchRoute();
    } else {
      setRouteCoords([]);
    }
  }, [pickup, dropoff]);

  useEffect(() => {
    if (vehicleFares[selectedVehicle]) {
      setEstimatedFare(vehicleFares[selectedVehicle]);
    }
  }, [selectedVehicle, vehicleFares]);

  const fetchMyIntercityRides = async () => {
    setListLoading(true);
    try {
      const [ridesRes, carpoolsRes] = await Promise.all([
        api.get('/rides/active'),
        api.get('/bookings/passenger-carpools?isIntercity=true')
      ]);

      let rides = [];
      let carpools = [];

      if (ridesRes.data?.success) {
        rides = ridesRes.data.rides
          .filter(r => r.type === 'intercity')
          .map(r => ({ ...r, isCarpool: false }));
      }

      if (carpoolsRes.data?.success) {
        const pending = carpoolsRes.data.pendingRequests || [];
        const accepted = carpoolsRes.data.acceptedCarpools || [];
        carpools = [...pending, ...accepted].map(c => ({ ...c, isCarpool: true }));
      }

      const combined = [...rides, ...carpools].sort((a, b) => new Date(b.createdAt || Date.now()) - new Date(a.createdAt || Date.now()));
      setMyRides(combined);
    } catch (error) {
      console.error('Fetch intercity rides error:', error);
    } finally {
      setListLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location access is needed.', [
          { text: 'Cancel' },
          { text: 'Settings', onPress: () => Linking.openSettings() }
        ]);
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
      } catch (e) { }

      setPickup({
        address: addressStr,
        location: { coordinates: [loc.coords.longitude, loc.coords.latitude] },
        placeId: 'current_location'
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
    } catch (e) {
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
      },
      placeId: `map_${Date.now()}`
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

  const animateEntrance = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start();
  };

  const vehicleTypes = VEHICLE_TYPES.filter(v => ['car', 'ac_car', 'luxury_car'].includes(v.id));

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
          isCarpool: false,
          isIntercity: true,
          passengers: 1,
          driversAvailable: 5,
          hour: new Date().getHours()
        });
        fares[v.id] = response.data.fare ?? 0;
      }));
      setVehicleFares(fares);
      if (fares[selectedVehicle]) {
        setEstimatedFare(fares[selectedVehicle]);
      }
    } catch (error) {
      console.error('Error calculating fare:', error);
    }
  };

  const handleBookIntercity = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please select pickup and dropoff locations');
      return;
    }

    if (schedule <= new Date()) {
      Alert.alert('Invalid Date', 'Please select a future date and time for intercity travel.');
      return;
    }

    if (fareMode === 'offer' && (!offerPrice || parseFloat(offerPrice) <= 0)) {
      Alert.alert('Error', 'Please enter a valid offer price');
      return;
    }

    setLoading(true);
    try {
      const rideData = {
        pickup: {
          address: pickup.address,
          location: { type: 'Point', coordinates: pickup.location.coordinates },
          placeId: pickup.placeId
        },
        dropoff: {
          address: dropoff.address,
          location: { type: 'Point', coordinates: dropoff.location.coordinates },
          placeId: dropoff.placeId
        },
        vehicleType: selectedVehicle,
        type: 'intercity',
        scheduledTime: schedule,
        fare: {
          type: fareMode,
          amount: fareMode === 'ai' ? (estimatedFare?.total ?? estimatedFare ?? 0) : parseFloat(offerPrice),
          offered: fareMode === 'offer' ? parseFloat(offerPrice) : null
        }
      };

      const result = await dispatch(createRide(rideData)).unwrap();
      if (result.success) {
        Alert.alert('Success', 'Intercity request posted!', [
          {
            text: 'OK', onPress: () => {
              setViewMode('list');
              fetchMyIntercityRides();
            }
          }
        ]);
      }
    } catch (error) {
      Alert.alert('Booking Failed', error.message || 'Unable to book ride.');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material': return <Icon name={icon} size={size} color={color} />;
      case 'material-community': return <IconMC name={icon} size={size} color={color} />;
      case 'fontawesome': return <IconFontAwesome name={icon} size={size} color={color} />;
      case 'feather': return <IconFeather name={icon} size={size} color={color} />;
      default: return <Icon name={icon} size={size} color={color} />;
    }
  };

  const handleAcceptOffer = async (rideId, driverId, amount) => {
    try {
      await dispatch(acceptCounterOffer({ rideId, driverId, amount })).unwrap();
      Alert.alert('Success', 'Ride accepted!');
      if (socket) {
        socket.emit('join-ride', rideId);
      }
      fetchMyIntercityRides();
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to accept offer');
    }
  };

  const renderMyRide = ({ item }) => {
    const isAccepted = item.status === 'accepted' || item.status === 'started' || item.status === 'confirmed' || item.status === 'in-progress';
    const displayDate = item.isCarpool
      ? (item.carpool?.departureTime || item.createdAt)
      : (item.scheduledTime || item.createdAt);

    const fare = item.isCarpool
      ? (item.fare?.accepted || item.fare?.offered || item.carpool?.pricePerSeat || 0)
      : (item.fare?.accepted || item.fare?.offered || 0);

    const handlePress = () => {
      if (item.isCarpool) {
        if (item.status !== 'searching') {
          navigation.navigate('CarpoolDetails', { carpoolId: item._id });
        }
      } else {
        navigation.navigate('RideTracking', { rideId: item._id });
      }
    };

    return (
      <Animatable.View animation="fadeInUp" duration={400} style={{ marginBottom: 16 }}>
        <TouchableOpacity
          style={[styles.recentRideCard, isAccepted && styles.acceptedRideCard]}
          onPress={handlePress}
          activeOpacity={0.8}
        >
          <View style={styles.rideCardHeader}>
            <View style={styles.rideDateTime}>
              <IconFeather name="calendar" size={14} color={colors.textSecondary} />
              <Text style={styles.rideDateText}>
                {displayDate ? new Date(displayDate).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Date'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[styles.rideStatus, { backgroundColor: item.isCarpool ? '#E1F5EE' : '#E6F1FB', borderColor: item.isCarpool ? '#1D9E75' : '#378ADD', borderWidth: 1 }]}>
                <Text style={[styles.rideStatusText, { color: item.isCarpool ? '#1D9E75' : '#378ADD' }]}>
                  {item.isCarpool ? 'CARPOOL' : 'SOLO'}
                </Text>
              </View>
              <View style={[styles.rideStatus, isAccepted ? styles.acceptedStatus : styles.pendingStatus]}>
                <View style={[styles.statusDot, isAccepted ? styles.acceptedDot : styles.pendingDot]} />
                <Text style={[styles.rideStatusText, isAccepted ? styles.acceptedStatusText : styles.pendingStatusText]}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.rideLocations}>
            <View style={styles.locationRow}>
              <View style={styles.locationIconContainer}>
                <View style={styles.pickupDot} />
              </View>
              <Text style={styles.locationText} numberOfLines={1}>{item.pickup?.address || 'Pickup location'}</Text>
            </View>
            <View style={styles.locationConnector} />
            <View style={styles.locationRow}>
              <View style={styles.locationIconContainer}>
                <View style={styles.dropoffDot} />
              </View>
              <Text style={styles.locationText} numberOfLines={1}>{item.dropoff?.address || 'Dropoff location'}</Text>
            </View>
          </View>

          <CarpoolMapPreview
            pickup={item.pickup}
            dropoff={item.dropoff}
            style={{ height: 120, borderRadius: 12, marginVertical: 12 }}
          />

          <View style={styles.rideFooter}>
            <View style={styles.priceContainer}>
              <Text style={styles.currencySymbol}>Rs.</Text>
              <Text style={styles.priceText}>{fare}</Text>
            </View>
            <View style={styles.vehicleTag}>
              <IconFontAwesome
                name={item.vehicleType === 'bike' ? 'motorcycle' : item.vehicleType === 'rickshaw' ? 'truck' : item.isCarpool ? 'users' : 'car'}
                size={12}
                color={colors.accent}
              />
              <Text style={styles.vehicleTagText}>{(item.vehicleType || (item.isCarpool ? 'Carpool' : 'Car')).toUpperCase()}</Text>
            </View>
          </View>

          {item.bids && item.bids.length > 0 && !isAccepted && !item.isCarpool && (
            <View style={styles.bidsContainer}>
              <Text style={styles.bidsTitle}>Available Offers</Text>
              {item.bids.map((bid, index) => (
                <View key={index} style={styles.bidCard}>
                  <View style={styles.bidInfo}>
                    <Text style={styles.bidAmount}>Rs. {bid.fare}</Text>
                    <Text style={styles.bidLabel}>Driver Offer</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.acceptBidButton}
                    onPress={() => handleAcceptOffer(item._id, bid.driverId?._id || bid.driverId, bid.fare)}
                  >
                    <Text style={styles.acceptBidText}>Accept</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </Animatable.View>
    );
  };

  const pendingList = myRides.filter(r => r.status === 'searching' || r.status === 'scheduled');
  const acceptedList = myRides.filter(r => r.status === 'accepted' || r.status === 'started');

  const renderListView = () => (
    <View style={styles.listContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <IconFeather name="arrow-left" size={22} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Intercity Rides</Text>
        <TouchableOpacity style={styles.headerAction}>
          <IconFeather name="search" size={22} color="#1a1a1a" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.activeTab]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.activeTabText]}>
            Pending {pendingList.length > 0 && `(${pendingList.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'accepted' && styles.activeTab]}
          onPress={() => setActiveTab('accepted')}
        >
          <Text style={[styles.tabText, activeTab === 'accepted' && styles.activeTabText]}>
            Accepted {acceptedList.length > 0 && `(${acceptedList.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {listLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={activeTab === 'pending' ? pendingList : acceptedList}
          renderItem={renderMyRide}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.rideListContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconFeather name="clock" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>No {activeTab} rides</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'pending'
                  ? 'You have no pending intercity rides'
                  : 'You have no accepted intercity rides'}
              </Text>
            </View>
          }
          refreshing={listLoading}
          onRefresh={fetchMyIntercityRides}
        />
      )}

      <TouchableOpacity
        style={styles.floatingBtn}
        onPress={() => setViewMode('mode_select')}
        activeOpacity={0.9}
      >
        <IconFeather name="plus" size={24} color="#fff" />
        <Text style={styles.floatingBtnText}>New Ride</Text>
      </TouchableOpacity>
    </View>
  );

  const renderModeSelect = () => (
    <View style={styles.listContainer}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => setViewMode('list')}>
          <IconFeather name="arrow-left" size={22} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Mode</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.modeSelectContainer}>
        <Animatable.View animation="fadeInUp" duration={600} delay={100}>
          <TouchableOpacity
            style={styles.modeCard}
            onPress={() => setViewMode('create')}
            activeOpacity={0.8}
          >
            <View style={styles.modeCardIcon}>
              <IconFontAwesome name="car" size={40} color={colors.accent} />
            </View>
            <Text style={styles.modeCardTitle}>Private Ride</Text>
            <Text style={styles.modeCardDesc}>Book a complete vehicle for your intercity travel</Text>
            <View style={styles.modeCardArrow}>
              <IconFeather name="arrow-right" size={20} color={colors.accent} />
            </View>
          </TouchableOpacity>
        </Animatable.View>

        <Animatable.View animation="fadeInUp" duration={600} delay={200}>
          <TouchableOpacity
            style={styles.modeCard}
            onPress={() => navigation.navigate('BookCarpool', { isIntercity: true, directCreate: true })}
            activeOpacity={0.8}
          >
            <View style={styles.modeCardIcon}>
              <IconFontAwesome name="users" size={40} color={colors.accent} />
            </View>
            <Text style={styles.modeCardTitle}>Carpool</Text>
            <Text style={styles.modeCardDesc}>Share seats with others to save cost</Text>
            <View style={styles.modeCardArrow}>
              <IconFeather name="arrow-right" size={20} color={colors.accent} />
            </View>
          </TouchableOpacity>
        </Animatable.View>
      </View>
    </View>
  );

  const renderCreateView = () => (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => setViewMode('mode_select')}>
          <IconFeather name="arrow-left" size={22} color="#1a1a1a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Intercity Ride</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Animatable.View animation="fadeIn" duration={600} style={styles.mapContainer}>
          {locationLoading ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: pickup?.location?.coordinates[1] || 33.6844,
                longitude: pickup?.location?.coordinates[0] || 73.0479,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              {pickup?.location?.coordinates && (
                <Marker coordinate={{ latitude: pickup.location.coordinates[1], longitude: pickup.location.coordinates[0] }}>
                  <View style={styles.pickupMarker}>
                    <View style={styles.markerInner} />
                  </View>
                </Marker>
              )}
              {dropoff?.location?.coordinates && (
                <Marker coordinate={{ latitude: dropoff.location.coordinates[1], longitude: dropoff.location.coordinates[0] }}>
                  <View style={styles.dropoffMarker}>
                    <IconFeather name="flag" size={16} color={colors.accent} />
                  </View>
                </Marker>
              )}
              {routeCoords.length > 0 && (
                <Polyline
                  coordinates={routeCoords}
                  strokeWidth={4}
                  strokeColor="#f9c349"
                  lineDashPattern={[1, 0]}
                />
              )}
            </MapView>
          )}
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
                  <Text style={styles.vehicleCapacity}>{vehicle.capacityLabel}</Text>
                  <Text style={styles.vehicleDescription}>{vehicle.description}</Text>
                  {isSelected && (
                    <View style={styles.vehicleSelectedBadge}>
                      <IconFeather name="check-circle" size={20} color={colors.accent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animatable.View>


        <Animatable.View animation="fadeInUp" duration={600} delay={400} style={styles.bookButtonContainer}>
          <TouchableOpacity
            style={styles.bookButton}
            onPress={handleBookIntercity}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.bookButtonText}>Post Intercity Ride</Text>
                <IconFeather name="arrow-right" size={20} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </Animatable.View>
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Map Picker Modal */}
      <Modal visible={mapPickerVisible} animationType="slide" presentationStyle="fullScreen">
        <View style={styles.mapPickerContainer}>
          <View style={styles.mapPickerHeader}>
            <TouchableOpacity onPress={() => setMapPickerVisible(false)}>
              <IconFeather name="x" size={24} color="#1a1a1a" />
            </TouchableOpacity>
            <Text style={styles.mapPickerTitle}>
              Select {mapPickerType === 'pickup' ? 'Pickup' : 'Dropoff'} Location
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <MapView
            ref={pickerMapRef}
            style={styles.mapPickerMap}
            initialRegion={{
              latitude: mapPickerCoords?.latitude || 33.6844,
              longitude: mapPickerCoords?.longitude || 73.0479,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02
            }}
            onRegionChangeComplete={onPickerRegionChangeComplete}
          />

          <View style={styles.mapPickerCenterPin}>
            <IconFeather name="map-pin" size={36} color={mapPickerType === 'pickup' ? colors.accent : '#ff6b6b'} />
          </View>

          <View style={styles.mapPickerBottom}>
            <Text style={styles.mapPickerAddress}>{mapPickerAddress}</Text>
            <View style={styles.mapPickerActions}>
              <TouchableOpacity
                style={[styles.mapPickerActionBtn, styles.mapPickerCancelBtn]}
                onPress={() => setMapPickerVisible(false)}
              >
                <Text style={styles.mapPickerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapPickerActionBtn, styles.mapPickerConfirmBtn]}
                onPress={confirmMapPicker}
              >
                <Text style={styles.mapPickerConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {viewMode === 'list' && renderListView()}
        {viewMode === 'mode_select' && renderModeSelect()}
        {viewMode === 'create' && renderCreateView()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => {
  const cardBg = isDark ? colors.card : '#FFFFFF';
  const insetBg = isDark ? colors.cardElevated : '#F5F5F5';
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: cardBg },
    container: { flex: 1, backgroundColor: cardBg },

    // Header Styles
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 15,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
      marginTop: 34
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#f5f5f5',
      justifyContent: 'center',
      alignItems: 'center'
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
      fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    headerRight: { width: 40 },
    headerAction: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: '#f5f5f5',
      justifyContent: 'center',
      alignItems: 'center',
    },

    // List View Styles
    listContainer: { flex: 1, backgroundColor: cardBg },
    tabContainer: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 20,
      marginBottom: 5,
    },
    tab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 8,
      marginHorizontal: 4,
    },
    activeTab: {
      backgroundColor: colors.accent,
    },
    tabText: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 14,
    },
    activeTabText: {
      color: '#1a1a1a',
      fontWeight: '700',
    },

    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },

    rideListContent: {
      padding: 16,
      paddingBottom: 100,
    },

    recentRideCard: {
      backgroundColor: cardBg,
      borderRadius: 16,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: 1,
      borderColor: '#f0f0f0',
    },
    acceptedRideCard: {
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    rideCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    rideDateTime: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    rideDateText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
    },
    rideStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 6,
    },
    acceptedStatus: {
      backgroundColor: colors.accent + '20',
    },
    pendingStatus: {
      backgroundColor: colors.accent + '20',
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    acceptedDot: {
      backgroundColor: colors.accent,
    },
    pendingDot: {
      backgroundColor: colors.accent,
    },
    rideStatusText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    acceptedStatusText: {
      color: colors.accent,
    },
    pendingStatusText: {
      color: colors.accent,
    },
    rideLocations: {
      marginBottom: 12,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    locationIconContainer: {
      width: 24,
      alignItems: 'center',
    },
    pickupDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.accent,
    },
    dropoffDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#ff6b6b',
    },
    locationConnector: {
      width: 2,
      height: 12,
      backgroundColor: '#e0e0e0',
      marginLeft: 11,
    },
    locationText: {
      flex: 1,
      color: '#1a1a1a',
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 12,
    },
    rideFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
    },
    priceContainer: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    currencySymbol: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '700',
      marginRight: 2,
    },
    priceText: {
      color: '#1a1a1a',
      fontSize: 18,
      fontWeight: '700',
    },
    vehicleTag: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      gap: 6,
    },
    vehicleTagText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },
    bidsContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
    },
    bidsTitle: {
      color: '#1a1a1a',
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    bidCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#f8f8f8',
      padding: 10,
      borderRadius: 10,
      marginBottom: 6,
    },
    bidInfo: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    bidAmount: {
      color: '#1a1a1a',
      fontSize: 15,
      fontWeight: '700',
    },
    bidLabel: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    acceptBidButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 8,
    },
    acceptBidText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyTitle: {
      color: '#1a1a1a',
      fontSize: 18,
      fontWeight: '700',
      marginTop: 16,
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 8,
    },

    // Floating Button
    floatingBtn: {
      position: 'absolute',
      bottom: 24,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 30,
      gap: 8,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    floatingBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },

    // Mode Select Styles
    modeSelectContainer: {
      flex: 1,
      padding: 20,
      justifyContent: 'center',
      gap: 20,
    },
    modeCard: {
      backgroundColor: cardBg,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: '#f0f0f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    modeCardIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.accent + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    modeCardTitle: {
      color: '#1a1a1a',
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 4,
    },
    modeCardDesc: {
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    modeCardArrow: {
      position: 'absolute',
      top: 24,
      right: 24,
    },

    // Create View Styles
    scrollContent: {
      paddingBottom: 40,
    },
    mapContainer: {
      height: 200,
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: '#f5f5f5',
      borderWidth: 1,
      borderColor: '#f0f0f0',
    },
    mapLoading: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    map: {
      width: '100%',
      height: '100%'
    },
    pickupMarker: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(249, 195, 73, 0.3)',
      justifyContent: 'center',
      alignItems: 'center'
    },
    markerInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.accent,
      borderWidth: 2,
      borderColor: '#fff'
    },
    dropoffMarker: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 107, 107, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: '#ff6b6b',
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
      paddingHorizontal: 20,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: '#1a1a1a',
      marginBottom: 16,
    },

    vehicleScroll: {
      flexDirection: 'row',
      paddingBottom: 4,
    },
    vehicleCard: {
      width: 150,
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
    vehicleCapacity: {
      color: '#bbb',
      fontSize: 11,
      marginTop: 2,
    },
    vehicleDescription: {
      color: '#ccc',
      fontSize: 10,
      marginTop: 2,
      textAlign: 'center',
    },
    vehicleSelectedBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
    },

    fareModeContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    fareMode: {
      flex: 1,
      height: 140,
      borderRadius: 16,
      backgroundColor: cardBg,
      borderWidth: 1,
      borderColor: '#f0f0f0',
      overflow: 'hidden',
    },
    fareModeSelected: {
      borderColor: colors.accent,
      borderWidth: 2,
    },
    fareModeContent: {
      flex: 1,
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fareModeContentSelected: {
      backgroundColor: colors.accent + '08',
    },
    fareModeIcon: {
      marginBottom: 8,
    },
    fareModeText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 4,
    },
    fareAmount: {
      fontSize: 18,
      fontWeight: '700',
      color: '#1a1a1a',
    },
    fareSubtext: {
      color: '#bbb',
      fontSize: 12,
    },
    offerInput: {
      borderRadius: 8,
      padding: 8,
      fontSize: 16,
      width: '100%',
      textAlign: 'center',
      backgroundColor: '#f5f5f5',
      color: '#1a1a1a',
      fontWeight: '600',
    },
    offerInputActive: {
      backgroundColor: colors.accent + '15',
      borderWidth: 1,
      borderColor: colors.accent,
    },

    bookButtonContainer: {
      paddingHorizontal: 20,
      marginTop: 10,
    },
    bookButton: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 6,
    },
    bookButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    bottomSpacer: { height: 40 },

    // Map Picker Modal
    mapPickerContainer: {
      flex: 1,
      backgroundColor: cardBg,
    },
    mapPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#f0f0f0',
    },
    mapPickerTitle: {
      color: '#1a1a1a',
      fontSize: 16,
      fontWeight: '700',
    },
    mapPickerMap: {
      flex: 1,
    },
    mapPickerCenterPin: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      marginTop: -18,
      marginLeft: -18,
    },
    mapPickerBottom: {
      backgroundColor: cardBg,
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: '#f0f0f0',
    },
    mapPickerAddress: {
      color: '#1a1a1a',
      fontSize: 15,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
    },
    mapPickerActions: {
      flexDirection: 'row',
      gap: 12,
    },
    mapPickerActionBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    mapPickerCancelBtn: {
      backgroundColor: '#f5f5f5',
    },
    mapPickerCancelText: {
      color: colors.textSecondary,
      fontWeight: '600',
    },
    mapPickerConfirmBtn: {
      backgroundColor: colors.accent,
    },
    mapPickerConfirmText: {
      color: '#fff',
      fontWeight: '700',
    },
  });
};

export default BookIntercityScreen;