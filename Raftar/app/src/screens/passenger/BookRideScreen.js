import React, { useState, useEffect, useRef } from 'react';
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
  Linking,
  Switch,
  InteractionManager
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconFA from 'react-native-vector-icons/FontAwesome5';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import CustomPlacesAutocomplete from '../../components/common/CustomPlacesAutocomplete';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import { createRide } from '../../redux/slices/rideSlice';
import { VEHICLE_TYPES } from '../../utils/constants';
import api from '../../services/api';
import { GOOGLE_MAPS_API_KEY } from '../../config/constants';
import { getDirections } from '../../services/maps';

const { width, height } = Dimensions.get('window');

const BookRideScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { currentRide } = useSelector(state => state.ride);
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  
  const [loading, setLoading] = useState(false);
  const [pickup, setPickup] = useState(route.params?.pickup || null);
  const [dropoff, setDropoff] = useState(route.params?.destination || null);
  const [stops, setStops] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('car');
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [selectedPriceOption, setSelectedPriceOption] = useState(null);
  const [vehicleFares, setVehicleFares] = useState({});
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showFareModal, setShowFareModal] = useState(false);
  const [searchingDriver, setSearchingDriver] = useState(false);
  const [showStopModal, setShowStopModal] = useState(false);

  const handleRemoveStop = (index) => {
    setStops(stops.filter((_, i) => i !== index));
  };
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const mapRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  
  const pickupRef = useRef(null);
  const dropoffRef = useRef(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [isGuestBooking, setIsGuestBooking] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestRelation, setGuestRelation] = useState('');
  const [guestNote, setGuestNote] = useState('');

  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [mapPickerType, setMapPickerType] = useState('pickup');
  const [mapPickerCoords, setMapPickerCoords] = useState(null);
  const [mapPickerAddress, setMapPickerAddress] = useState('Loading address...');
  const pickerMapRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
    animateEntrance();
    getCurrentLocation();
  }, [navigation]);

  useEffect(() => {
    if (pickup && dropoff) {
      InteractionManager.runAfterInteractions(() => {
        calculateFare();
        fetchRoute();
      });
    } else {
      setRouteCoords([]);
    }
  }, [pickup, dropoff, stops]);

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'We need your location to set the pickup point.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
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
        location: {
          coordinates: [loc.coords.longitude, loc.coords.latitude]
        }
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
    } else if (mapPickerType === 'dropoff') {
      setDropoff(data);
      dropoffRef.current?.setAddressText(data.address);
    } else if (mapPickerType === 'stop') {
      setStops([...stops, data]);
      setShowStopModal(false);
    }
    setMapPickerVisible(false);
  };

  const fetchRoute = async () => {
    if (!pickup?.location?.coordinates || !dropoff?.location?.coordinates) return;

    // getDirections picks the fastest of Google's alternative routes, decodes the
    // road polyline, and always resolves (falling back to a flagged straight-line
    // estimate) so the map and the ETA are never left blank.
    const route = await getDirections(pickup, dropoff, stops);
    if (!route) return;

    setRouteCoords(route.coordinates);
    setRouteInfo({
      distanceText: route.distanceText,
      durationText: route.durationText,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
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

  const enhancedVehicleTypes = React.useMemo(() => {
    const vehicleStyles = {
      'bike': { bgLight: '#FFF7E0', bgDark: '#2A200B', iconColor: '#F5A623', icon: 'motorbike', iconType: 'material-community' },
      'rickshaw': { bgLight: '#E1F5EE', bgDark: '#0D271F', iconColor: '#1D9E75', icon: 'rickshaw', iconType: 'material-community' },
      'car': { bgLight: '#E6F1FB', bgDark: '#15212D', iconColor: '#378ADD', icon: 'car', iconType: 'material-community' },
      'car-ac': { bgLight: '#EAF3DE', bgDark: '#1F2A14', iconColor: '#639922', icon: 'car-cool', iconType: 'material-community' },
      'luxury': { bgLight: '#F3EAFB', bgDark: '#241634', iconColor: '#7F4FC9', icon: 'car-estate', iconType: 'material-community' },
    };

    return VEHICLE_TYPES.map(v => ({
      ...v,
      bgColor: isDark ? (vehicleStyles[v.id]?.bgDark || '#222') : (vehicleStyles[v.id]?.bgLight || '#F5F5F5'),
      iconColor: vehicleStyles[v.id]?.iconColor || '#666',
      icon: vehicleStyles[v.id]?.icon || 'car',
      iconType: vehicleStyles[v.id]?.iconType || 'material-community',
    }));
  }, [isDark]);

  const vehicleTypes = VEHICLE_TYPES;

  const calculateFare = async () => {
    if (!pickup || !dropoff) return;
    try {
      const types = VEHICLE_TYPES.map(v => v.id);
      const fares = {};
      
      await Promise.all(types.map(async (type) => {
        const response = await api.post('/pricing/calculate', {
          pickup: pickup.location.coordinates ? { lng: pickup.location.coordinates[0], lat: pickup.location.coordinates[1] } : pickup,
          dropoff: dropoff.location.coordinates ? { lng: dropoff.location.coordinates[0], lat: dropoff.location.coordinates[1] } : dropoff,
          stops: stops.map(s => s.location.coordinates ? { lng: s.location.coordinates[0], lat: s.location.coordinates[1] } : s),
          vehicle: type,
          city: 'Karachi', // defaulting city or extract from address
          isCarpool: false,
          isIntercity: false,
          passengers: 1,
          driversAvailable: 5,
          hour: new Date().getHours()
        });
        fares[type] = response.data.fare ?? 0;
      }));
      
      setVehicleFares(fares);
      setEstimatedFare(fares[selectedVehicle] || 0);
    } catch (error) {
      console.error('Error calculating fare:', error);
    }
  };

  useEffect(() => {
    if (vehicleFares[selectedVehicle]) {
      const base = vehicleFares[selectedVehicle];
      setEstimatedFare(base);
      setSelectedPriceOption(Math.round(base));
    } else {
      const v = vehicleTypes.find(v => v.id === selectedVehicle);
      if (v) {
        setEstimatedFare(v.price);
        setSelectedPriceOption(v.price);
      }
    }
  }, [selectedVehicle, vehicleFares]);

  const getPriceOptions = (base) => {
    if (!base) return [];
    const baseFare = Math.round(base);
    const minFare = Math.round(baseFare * 0.8);
    const maxFare = Math.round(baseFare * 1.2);
    const step = (maxFare - minFare) / 4;
    return [
      Math.round(minFare),
      Math.round(minFare + step),
      Math.round(minFare + 2 * step),
      Math.round(minFare + 3 * step),
      Math.round(maxFare)
    ];
  };

  const handlePriceStep = (direction) => {
    const options = getPriceOptions(estimatedFare);
    if (!options.length) return;
    
    let currentIndex = options.findIndex(p => p === selectedPriceOption);
    if (currentIndex === -1) {
       currentIndex = options.reduce((closestIdx, price, idx) => {
         return Math.abs(price - selectedPriceOption) < Math.abs(options[closestIdx] - selectedPriceOption) ? idx : closestIdx;
       }, 0);
    }
    
    let newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < options.length) {
      setSelectedPriceOption(options[newIndex]);
    }
  };

  const handleBookRide = async (confirmedPrice) => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please select pickup and dropoff locations');
      return;
    }

    if (!pickup.location?.coordinates || !dropoff.location?.coordinates) {
      Alert.alert('Error', 'Invalid location format. Please select addresses from the dropdown suggestions.');
      return;
    }

    if (!confirmedPrice || confirmedPrice <= 0) {
      Alert.alert('Error', 'Please select a valid price');
      return;
    }

    if (isGuestBooking && !guestPhone) {
      Alert.alert('Error', 'Please enter the guest\'s phone number');
      return;
    }

    setLoading(true);
    try {
      const rideData = {
        pickup: {
          address: pickup.address,
          location: {
            type: 'Point',
            coordinates: pickup.location.coordinates
          },
          placeId: pickup.placeId
        },
        dropoff: {
          address: dropoff.address,
          location: {
            type: 'Point',
            coordinates: dropoff.location.coordinates
          },
          placeId: dropoff.placeId
        },
        waypoints: stops.map(s => ({
          address: s.address,
          location: {
            type: 'Point',
            coordinates: s.location.coordinates
          }
        })),
        vehicleType: selectedVehicle,
        type: 'solo',
        fare: {
          type: 'offer',
          amount: confirmedPrice,
          offered: confirmedPrice
        },
        ...(isGuestBooking && {
          guest: {
            isGuestBooking: true,
            name: guestName,
            phoneNumber: guestPhone,
            relation: guestRelation,
            note: guestNote
          }
        })
      };

      const result = await dispatch(createRide(rideData)).unwrap();
      if (result.success) {
        navigation.navigate('RideTracking', { 
          rideId: result.ride._id,
          rideData: result.ride
        });
      }
    } catch (error) {
      Alert.alert('Booking Failed', error.message || 'Unable to book ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material':
        return <Icon name={icon} size={size} color={color} />;
      case 'material-community':
        return <IconMC name={icon} size={size} color={color} />;
      case 'fontawesome':
        return <IconFA name={icon} size={size} color={color} />;
      default:
        return <Icon name={icon} size={size} color={color} />;
    }
  };

  const renderVehicleCard = (vehicle) => (
    <TouchableOpacity
      key={vehicle.id}
      style={[
        styles.vehicleCard,
        selectedVehicle === vehicle.id && styles.vehicleCardSelected
      ]}
      onPress={() => setSelectedVehicle(vehicle.id)}
      activeOpacity={0.9}
    >
      <View style={[
        styles.vehicleCardContent,
        selectedVehicle === vehicle.id && { borderColor: '#FFC107', backgroundColor: isDark ? '#2A200B' : '#FFFDF5' }
      ]}>
        <View style={[
          styles.vehicleIconContainer,
          { backgroundColor: vehicle.bgColor }
        ]}>
          {getIcon(vehicle.icon, vehicle.iconType, 32, vehicle.iconColor)}
        </View>
        <Text style={[
          styles.vehicleLabel,
          selectedVehicle === vehicle.id && { color: isDark ? '#FFF' : '#000' }
        ]}>
          {vehicle.label}
        </Text>
        <Text style={[styles.vehiclePrice, selectedVehicle === vehicle.id && { color: isDark ? '#FFF' : '#000', fontSize: 15 }]}>₨ {vehicleFares[vehicle.id] ? Math.round(vehicleFares[vehicle.id]) : vehicle.price}</Text>
        <View style={styles.vehicleMeta}>
          <View style={styles.vehicleMetaItem}>
            <Icon name="person" size={12} color="#999" />
            <Text style={styles.vehicleMetaText}>{vehicle.capacityLabel}</Text>
          </View>
          <View style={styles.vehicleMetaItem}>
            <Icon name="access-time" size={12} color="#999" />
            <Text style={styles.vehicleMetaText}>{vehicle.time}</Text>
          </View>
        </View>
        {selectedVehicle === vehicle.id && (
          <View style={[styles.selectedBadge, { backgroundColor: '#FFC107' }]}>
            <Icon name="check" size={12} color="#000" />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <Animated.View style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }]
          }
        ]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={24} color={colors.text || '#000'} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text || '#000' }]}>Choose a ride</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Active Ride Banner */}
          {currentRide && (currentRide.status === 'searching' || currentRide.status === 'accepted' || currentRide.status === 'started') && (
            <Animatable.View animation="fadeIn" duration={500}>
              <TouchableOpacity 
                style={styles.activeRideBanner}
                onPress={() => navigation.navigate('RideTracking', { rideId: currentRide._id })}
                activeOpacity={0.8}
              >
                <View style={styles.activeRideBannerContent}>
                  <View style={styles.activeRideIcon}>
                    <Icon name="directions-car" size={20} color="#F9C349" />
                  </View>
                  <View>
                    <Text style={styles.activeRideBannerTitle}>Active Ride</Text>
                    <Text style={styles.activeRideBannerStatus}>{currentRide.status}</Text>
                  </View>
                </View>
                <Icon name="arrow-forward" size={24} color="#F9C349" />
              </TouchableOpacity>
            </Animatable.View>
          )}

          <ScrollView 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Map Section */}
            <Animatable.View animation="fadeIn" duration={600} style={styles.mapContainer} useNativeDriver>
              {locationLoading ? (
                <View style={styles.mapLoading}>
                  <ActivityIndicator size="large" color="#F9C349" />
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
                      strokeWidth={5}
                      strokeColor="#FFC107"
                    />
                  )}
                </MapView>
              )}

              {/* Trip ETA + distance, parsed from the Directions response */}
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
                  {routeInfo.isEstimate && (
                    <Text style={styles.etaApprox}>approx.</Text>
                  )}
                </View>
              )}
            </Animatable.View>

            {/* Stops Section */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={100}
              style={[styles.section, { paddingHorizontal: 20, paddingTop: 10 }]}
              useNativeDriver
            >
              <View style={styles.stopsContainer}>
                {stops.map((stop, index) => (
                  <View key={index} style={styles.stopRow}>
                    <Icon name="stop-circle" size={20} color="#FF9F43" />
                    <Text style={styles.stopText} numberOfLines={1}>{stop.address}</Text>
                    <TouchableOpacity onPress={() => handleRemoveStop(index)}>
                      <Icon name="close" size={20} color="#999" />
                    </TouchableOpacity>
                  </View>
                ))}
                
                {stops.length < 3 && (
                  <TouchableOpacity 
                    style={styles.addStopButton}
                    onPress={() => setShowStopModal(true)}
                  >
                    <Icon name="add-circle-outline" size={20} color="#F5A623" />
                    <Text style={styles.addStopText}>Add Stop</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animatable.View>

            {/* Vehicle Selection */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={200}
              style={styles.section}
              useNativeDriver
            >
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Select Vehicle</Text>
                <TouchableOpacity onPress={() => setShowVehicleModal(true)}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.vehicleScrollContent}
              >
                {enhancedVehicleTypes.map(vehicle => renderVehicleCard(vehicle))}
              </ScrollView>
            </Animatable.View>

            {/* Guest Booking */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={250}
              style={styles.section}
              useNativeDriver
            >
              <TouchableOpacity 
                style={styles.guestToggleContainer}
                onPress={() => setIsGuestBooking(!isGuestBooking)}
                activeOpacity={0.7}
              >
                <View style={styles.guestToggleLeft}>
                  <View style={styles.guestToggleIcon}>
                    <Icon name="person-add" size={20} color="#F5A623" />
                  </View>
                  <Text style={styles.guestToggleText}>Book for someone else</Text>
                </View>
                <Switch
                  value={isGuestBooking}
                  onValueChange={setIsGuestBooking}
                  trackColor={{ false: '#E0E0E0', true: '#FFC107' }}
                  thumbColor={isGuestBooking ? '#FFFFFF' : '#FFFFFF'}
                  ios_backgroundColor="#E0E0E0"
                />
              </TouchableOpacity>

              {isGuestBooking && (
                <Animatable.View animation="fadeIn" duration={300} style={styles.guestInputContainer} useNativeDriver>
                  <View style={styles.guestInputWrapper}>
                    <Icon name="phone" size={20} color="#F9C349" style={styles.guestInputIcon} />
                    <TextInput
                      style={styles.guestInput}
                      placeholder="Guest Phone Number *"
                      placeholderTextColor="#999"
                      keyboardType="phone-pad"
                      value={guestPhone}
                      onChangeText={setGuestPhone}
                    />
                  </View>
                  <View style={styles.guestInputWrapper}>
                    <Icon name="person" size={20} color="#F9C349" style={styles.guestInputIcon} />
                    <TextInput
                      style={styles.guestInput}
                      placeholder="Guest Name (Optional)"
                      placeholderTextColor="#999"
                      value={guestName}
                      onChangeText={setGuestName}
                    />
                  </View>
                  <View style={styles.guestInputWrapper}>
                    <Icon name="people" size={20} color="#F9C349" style={styles.guestInputIcon} />
                    <TextInput
                      style={styles.guestInput}
                      placeholder="Relation (e.g. Mother, Friend)"
                      placeholderTextColor="#999"
                      value={guestRelation}
                      onChangeText={setGuestRelation}
                    />
                  </View>
                  <View style={[styles.guestInputWrapper, styles.guestInputWrapperNote]}>
                    <Icon name="notes" size={20} color="#F9C349" style={styles.guestInputIcon} />
                    <TextInput
                      style={[styles.guestInput, styles.guestInputNote]}
                      placeholder="Comment / Note for Driver"
                      placeholderTextColor="#999"
                      multiline
                      numberOfLines={3}
                      value={guestNote}
                      onChangeText={setGuestNote}
                    />
                  </View>
                </Animatable.View>
              )}
            </Animatable.View>

            {/* Price Selection */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={300}
              style={[styles.section, { marginBottom: 40 }]}
              useNativeDriver
            >
              <Text style={styles.sectionTitle}>Select Your Price</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity 
                  style={styles.priceStepperBtn}
                  onPress={() => handlePriceStep(-1)}
                >
                  <Icon name="remove" size={24} color={colors.text || '#000'} />
                </TouchableOpacity>
                
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.priceScrollContent}
                  style={{ flex: 1, marginHorizontal: 8 }}
                >
                  {getPriceOptions(estimatedFare).map((price, index) => (
                    <View key={index} style={styles.priceOptionWrapper}>
                      <TouchableOpacity
                        style={[
                          styles.priceOptionCard,
                          selectedPriceOption === price && styles.priceOptionSelected
                        ]}
                        onPress={() => setSelectedPriceOption(price)}
                      >
                        <Text style={[
                          styles.priceOptionText,
                          selectedPriceOption === price && styles.priceOptionTextSelected
                        ]}>
                          ₨ {price}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>

                <TouchableOpacity 
                  style={styles.priceStepperBtn}
                  onPress={() => handlePriceStep(1)}
                >
                  <Icon name="add" size={24} color={colors.text || '#000'} />
                </TouchableOpacity>
              </View>

              {selectedPriceOption > 0 && (
                <TouchableOpacity 
                  style={{
                    marginTop: 24,
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                  onPress={() => handleBookRide(selectedPriceOption)}
                  disabled={loading || searchingDriver}
                >
                  <LinearGradient
                    colors={['#FFC107', '#FFB300']}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 16,
                      gap: 8,
                    }}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading || searchingDriver ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Text style={{ fontSize: 18, color: '#000000', fontWeight: '700' }}>Find Driver</Text>
                        <Icon name="arrow-forward" size={20} color="#000000" />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </Animatable.View>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Vehicle Modal */}
          <Modal
            visible={showVehicleModal}
            animationType="slide"
            transparent
            onRequestClose={() => setShowVehicleModal(false)}
          >
            <View style={styles.modalOverlay}>
              <TouchableOpacity 
                style={styles.modalBackdrop}
                activeOpacity={1}
                onPress={() => setShowVehicleModal(false)}
              />
              <Animatable.View 
                animation="slideInUp" 
                duration={400}
                style={styles.modalContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Select Vehicle</Text>
                  <TouchableOpacity 
                    onPress={() => setShowVehicleModal(false)}
                    style={styles.modalClose}
                  >
                    <Icon name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {vehicleTypes.map(vehicle => (
                    <TouchableOpacity
                      key={vehicle.id}
                      style={[
                        styles.modalVehicleItem,
                        selectedVehicle === vehicle.id && styles.modalVehicleSelected
                      ]}
                      onPress={() => {
                        setSelectedVehicle(vehicle.id);
                        setShowVehicleModal(false);
                      }}
                    >
                      <View style={[
                        styles.modalVehicleIcon,
                        { backgroundColor: vehicle.color + '15' }
                      ]}>
                        {getIcon(vehicle.icon, vehicle.iconType, 28, vehicle.color)}
                      </View>
                      <View style={styles.modalVehicleInfo}>
                        <Text style={styles.modalVehicleLabel}>{vehicle.label}</Text>
                        <Text style={styles.modalVehicleCapacity}>
                          {vehicle.capacityLabel} • {vehicle.time}
                        </Text>
                      </View>
                      <Text style={styles.modalVehiclePrice}>₨ {vehicle.price}</Text>
                      {selectedVehicle === vehicle.id && (
                        <Icon name="check-circle" size={24} color={vehicle.color} />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Animatable.View>
            </View>
          </Modal>

          {/* Map Picker Modal */}
          <Modal visible={mapPickerVisible} animationType="slide">
            <View style={styles.pickerModalContainer}>
              <View style={styles.pickerModalHeader}>
                <TouchableOpacity onPress={() => setMapPickerVisible(false)} style={styles.pickerBackBtn}>
                  <Icon name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.pickerModalTitle}>
                  Select {mapPickerType === 'pickup' ? 'Pickup' : mapPickerType === 'stop' ? 'Stop' : 'Dropoff'}
                </Text>
                <View style={{ width: 32 }} />
              </View>
              {mapPickerCoords && (
                <MapView
                  key={`${mapPickerType}-${mapPickerVisible}`}
                  ref={pickerMapRef}
                  style={styles.pickerMap}
                  initialRegion={{
                    latitude: mapPickerCoords.latitude,
                    longitude: mapPickerCoords.longitude,
                    latitudeDelta: 0.002,
                    longitudeDelta: 0.002,
                  }}
                  onRegionChangeComplete={onPickerRegionChangeComplete}
                  showsUserLocation
                />
              )}
              <View style={styles.pickerCenterPin}>
                <Icon name="location-on" size={44} color={mapPickerType === 'pickup' ? "#4ECDC4" : mapPickerType === 'stop' ? "#FF9F43" : "#FF6B6B"} />
              </View>
              <View style={styles.pickerBottomCard}>
                <Text style={styles.pickerAddressLabel}>Selected Location</Text>
                <Text style={styles.pickerAddressText}>{mapPickerAddress}</Text>
                <TouchableOpacity style={styles.pickerConfirmBtn} onPress={confirmMapPicker}>
                  <Text style={styles.pickerConfirmText}>Confirm Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </Animated.View>
        {/* Add Stop Modal */}
      <Modal visible={showStopModal} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.pickerModalHeader}>
            <TouchableOpacity onPress={() => setShowStopModal(false)} style={styles.pickerBackBtn}>
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.pickerModalTitle}>Add Stop</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={{ flex: 1, padding: 20 }}>
            <CustomPlacesAutocomplete
              placeholder="Search for a stop..."
              onPress={(data, details = null) => {
                setStops([...stops, {
                  address: data.description,
                  location: {
                    type: 'Point',
                    coordinates: [details.geometry.location.lng, details.geometry.location.lat]
                  },
                  placeId: data.place_id
                }]);
                setShowStopModal(false);
              }}
              styles={{
                textInputContainer: styles.pickupInputContainer,
                textInput: styles.pickupTextInput,
                container: styles.autocompleteContainer,
                listView: styles.autocompleteList,
              }}
              renderRightButton={() => (
                <TouchableOpacity onPress={() => openMapPicker('stop')} style={styles.mapIconBtn}>
                  <Icon name="map" size={20} color="#FF9F43" />
                </TouchableOpacity>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>

    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (colors, isDark) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background || colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background || colors.background,
    
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    
    paddingBottom: 15,
    backgroundColor: colors.background,
    marginTop:34
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.5,
  },
  notificationButton: {
    padding: 4,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F9C349',
  },
  activeRideBanner: {
    backgroundColor: colors.accent + '18',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F9C349',
  },
  activeRideBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeRideIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F9C34915',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activeRideBannerTitle: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  activeRideBannerStatus: {
    color: '#666',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  mapContainer: {
    height: 350,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.card,
    position: 'relative',
  },
  etaBar: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.card,
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
  mapLoading: {
    flex: 1,
    backgroundColor: colors.card,
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.text,
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
    borderColor: colors.background,
  },
  locationSection: {
    backgroundColor: colors.background,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
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
  locationAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F9C34915',
    borderRadius: 20,
  },
  locationActionText: {
    color: '#F9C349',
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
    backgroundColor: colors.border,
    marginTop: 4,
  },
  locationInputContainer: {
    flex: 1,
  },
  pickupInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
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
    backgroundColor: colors.cardElevated,
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
    zIndex: 999,
  },
  autocompleteList: {
    backgroundColor: colors.background,
    borderRadius: 12,
    marginTop: 4,
    maxHeight: 200,
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  autocompleteRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  autocompleteDescription: {
    color: colors.text,
    fontSize: 14,
  },
  locationDivider: {
    height: 0,
    marginVertical: 0,
  },
  farePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  farePreviewLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  farePreviewIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F9C34915',
    justifyContent: 'center',
    alignItems: 'center',
  },
  farePreviewText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  farePreviewDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distanceText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  section: {
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  seeAll: {
    color: '#F9C349',
    fontSize: 14,
    fontWeight: '500',
  },
  vehicleScrollContent: {
    paddingHorizontal: 2,
    gap: 12,
  },
  vehicleCard: {
    width: 140,
    marginRight: 12,
  },
  vehicleCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  vehicleCardContent: {
    backgroundColor: colors.background,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  vehicleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  stopsContainer: {
    backgroundColor: colors.cardElevated,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stopText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: isDark ? '#2A200B' : '#FFFDF5',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? '#3A2E15' : '#FDECA6',
    borderStyle: 'dashed',
    justifyContent: 'center',
  },
  addStopText: {
    fontSize: 14,
    color: '#F5A623',
    fontWeight: '600',
    marginLeft: 8,
  },
  vehicleLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  vehiclePrice: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  vehicleMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  vehicleMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleMetaText: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  selectedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.cardElevated,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guestToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  guestToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? '#2A200B' : '#FFF7E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  guestToggleText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  guestInputContainer: {
    backgroundColor: colors.cardElevated,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  guestInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  guestInputWrapperNote: {
    alignItems: 'flex-start',
    paddingTop: 12,
    minHeight: 80,
  },
  guestInputIcon: {
    marginRight: 10,
  },
  guestInput: {
    color: colors.text,
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
  },
  guestInputNote: {
    paddingTop: 0,
    minHeight: 60,
  },
  priceScrollContent: {
    paddingHorizontal: 2,
    gap: 12,
  },
  priceOptionWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceOptionCard: {
    backgroundColor: isDark ? '#222' : colors.card,
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceOptionSelected: {
    backgroundColor: '#FFC107',
  },
  priceOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  priceOptionTextSelected: {
    color: colors.text,
    fontWeight: '700',
  },
  priceStepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? '#222' : colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmPriceTick: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.text,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 20,
    maxHeight: height * 0.7,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  modalClose: {
    padding: 4,
  },
  modalVehicleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardElevated,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalVehicleSelected: {
    borderColor: '#F9C349',
    backgroundColor: '#F9C34915',
  },
  modalVehicleIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  modalVehicleInfo: {
    flex: 1,
  },
  modalVehicleLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalVehicleCapacity: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  modalVehiclePrice: {
    color: '#F9C349',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  mapIconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  pickerModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerBackBtn: {
    padding: 4,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  pickerMap: {
    flex: 1,
  },
  pickerCenterPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -44,
    zIndex: 10,
    backgroundColor: colors.background,
    borderRadius: 28,
    padding: 4,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pickerBottomCard: {
    backgroundColor: colors.background,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickerAddressLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  pickerAddressText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
  },
  pickerConfirmBtn: {
    backgroundColor: '#F9C349',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerConfirmText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default BookRideScreen;