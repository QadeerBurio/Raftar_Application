import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ActivityIndicator
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconFA from 'react-native-vector-icons/FontAwesome5';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import CustomPlacesAutocomplete from '../../components/common/CustomPlacesAutocomplete';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import { createRide } from '../../redux/slices/rideSlice';
import { GOOGLE_MAPS_API_KEY } from '../../config/constants';
import { getDirections } from '../../services/maps';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';

const { width, height } = Dimensions.get('window');

const SendParcelScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  const { loading } = useSelector(state => state.ride);
  
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [parcelDetails, setParcelDetails] = useState({
    size: 'bike',
    weight: '',
    description: '',
    receiverName: '',
    receiverPhone: '',
    codAmount: '',
    instructions: '',
    fragile: false,
    urgent: false
  });
  const [selectedPriceOption, setSelectedPriceOption] = useState(null);
  const [estimatedFare, setEstimatedFare] = useState(null);

  useEffect(() => {
    const selectedSize = parcelSizes.find(s => s.id === parcelDetails.size);
    if (selectedSize) {
      setEstimatedFare(selectedSize.price);
      setSelectedPriceOption(selectedSize.price);
    }
  }, [parcelDetails.size]);

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
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdParcelId, setCreatedParcelId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchingDriver, setSearchingDriver] = useState(false);
  const [locationLoading, setLocationLoading] = useState(true);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const mapRef = useRef(null);

  // Map Picker State
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapPickerType, setMapPickerType] = useState('pickup');
  const [mapPickerCoords, setMapPickerCoords] = useState(null);
  const [mapPickerAddress, setMapPickerAddress] = useState('Loading address...');
  const pickupRef = useRef();
  const dropoffRef = useRef();
  const pickerMapRef = useRef(null);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start();
    getCurrentLocation();
  }, []);

  useEffect(() => {
    if (pickup && dropoff) {
      fetchRoute();
    } else {
      setRouteCoords([]);
    }
  }, [pickup, dropoff]);

  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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
        },
        placeId: ''
      });
      pickupRef.current?.setAddressText(addressStr);
    } catch (e) {
      console.log('Location error', e);
    } finally {
      setLocationLoading(false);
    }
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

  const parcelSizes = [
    { id: 'bike', label: 'Bike', icon: 'motorbike', iconType: 'material-community', price: 100, dimensions: 'Small parcels', capacity: 'Small' },
    { id: 'rickshaw', label: 'Rickshaw', icon: 'rickshaw', iconType: 'material-community', price: 150, dimensions: 'Medium parcels', capacity: 'Medium' },
    { id: 'car', label: 'Car', icon: 'car', iconType: 'material-community', price: 200, dimensions: 'Large parcels', capacity: 'Large' }
  ];

  const handleChange = (field, value) => {
    setParcelDetails({ ...parcelDetails, [field]: value });
  };

  const openMapPicker = async (type) => {
    setMapPickerType(type);
    setShowMapPicker(true);
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
    
    setTimeout(() => {
      if (pickerMapRef.current && coords) {
        pickerMapRef.current.animateToRegion({
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 100);
      }
    }, 500);
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
    const newLoc = {
      address: mapPickerAddress,
      location: {
        type: 'Point',
        coordinates: [mapPickerCoords.longitude, mapPickerCoords.latitude]
      },
      placeId: ''
    };
    if (mapPickerType === 'pickup') {
      setPickup(newLoc);
      pickupRef.current?.setAddressText(newLoc.address);
    } else {
      setDropoff(newLoc);
      dropoffRef.current?.setAddressText(newLoc.address);
    }
    setShowMapPicker(false);
  };

  const validateForm = () => {
    if (!pickup) { Alert.alert('Error', 'Please enter pickup address'); return false; }
    if (!dropoff) { Alert.alert('Error', 'Please enter delivery address'); return false; }
    if (!parcelDetails.receiverName || parcelDetails.receiverName.trim().length < 2) { Alert.alert('Error', 'Please enter receiver name'); return false; }
    if (!parcelDetails.receiverPhone || parcelDetails.receiverPhone.length < 10) { Alert.alert('Error', 'Please enter a valid receiver phone number'); return false; }
    if (parcelDetails.weight && isNaN(parseFloat(parcelDetails.weight))) { Alert.alert('Error', 'Please enter a valid weight'); return false; }
    if (parcelDetails.codAmount && isNaN(parseFloat(parcelDetails.codAmount))) { Alert.alert('Error', 'Please enter a valid COD amount'); return false; }
    if (!selectedPriceOption || selectedPriceOption <= 0) { Alert.alert('Error', 'Please select a valid price'); return false; }
    return true;
  };

  const handleCreateParcel = async () => {
    if (!validateForm()) return;
    setIsSubmitting(true);
    try {
      const rideData = {
        pickup: {
          address: pickup.address,
          location: { type: 'Point', coordinates: pickup.location.coordinates },
          placeId: pickup.placeId || ''
        },
        dropoff: {
          address: dropoff.address,
          location: { type: 'Point', coordinates: dropoff.location.coordinates },
          placeId: dropoff.placeId || ''
        },
        vehicleType: parcelDetails.size,
        type: 'parcel',
        fare: {
          type: 'offer',
          amount: selectedPriceOption,
          offered: selectedPriceOption
        },
        parcel: {
          ...parcelDetails,
          size: parcelDetails.size === 'car' ? 'large' : parcelDetails.size === 'rickshaw' ? 'medium' : 'small',
          weight: parseFloat(parcelDetails.weight) || 0,
          codAmount: parseFloat(parcelDetails.codAmount) || 0,
          senderName: user?.name || 'Guest',
          senderPhone: user?.phoneNumber || ''
        }
      };
      const result = await dispatch(createRide(rideData)).unwrap();
      if (result.success) {
        setSearchingDriver(true);
        setTimeout(() => {
          setSearchingDriver(false);
          navigation.navigate('RideTracking', { 
            rideId: result.ride._id,
            rideData: result.ride
          });
        }, 3000);
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create parcel delivery');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material': return <Icon name={icon} size={size} color={color} />;
      case 'material-community': return <IconMC name={icon} size={size} color={color} />;
      case 'ionicon': return <IconIonic name={icon} size={size} color={color} />;
      default: return <Icon name={icon} size={size} color={color} />;
    }
  };

  const renderParcelSize = (size) => {
    const isSelected = parcelDetails.size === size.id;
    return (
      <TouchableOpacity
        key={size.id}
        style={[
          styles.sizeCard,
          isSelected && styles.sizeCardSelected
        ]}
        onPress={() => handleChange('size', size.id)}
        activeOpacity={0.8}
      >
        <View style={[
          styles.sizeCardContent,
          isSelected && { borderColor: colors.accent }
        ]}>
          <View style={[
            styles.sizeIconContainer,
            { backgroundColor: isSelected ? colors.accent + '15' : '#F5F5F5' }
          ]}>
            {getIcon(size.icon, size.iconType, 28, isSelected ? colors.accent : '#999')}
          </View>
          <Text style={[
            styles.sizeLabel,
            isSelected && styles.sizeLabelSelected
          ]}>{size.label}</Text>
          <Text style={[
            styles.sizePrice,
            isSelected && styles.sizePriceSelected
          ]}>₨ {size.price}</Text>
          <Text style={styles.sizeDimensions}>{size.dimensions}</Text>
          {isSelected && (
            <View style={styles.selectedCheck}>
              <Icon name="check" size={14} color="#FFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

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
              activeOpacity={0.7}
            >
              <Icon name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Send Parcel</Text>
            <TouchableOpacity style={styles.historyButton} activeOpacity={0.7}>
              <Icon name="history" size={24} color={colors.text} />
              <View style={styles.historyBadge} />
            </TouchableOpacity>
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
              <TouchableOpacity style={styles.mapOverlayBtn} onPress={() => openMapPicker('pickup')} activeOpacity={0.8}>
                <Icon name="edit-location" size={20} color={colors.accent} />
              </TouchableOpacity>
            </Animatable.View>

            {/* Pickup & Delivery Section */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={100}
              style={styles.section}
            >
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>📍 Pickup & Delivery</Text>
                <TouchableOpacity style={styles.quickFillButton} onPress={getCurrentLocation} activeOpacity={0.7}>
                  <Icon name="my-location" size={18} color={colors.accent} />
                  <Text style={styles.quickFillText}>Current</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.locationInputWrapper}>
                <View style={styles.locationDot}>
                  <View style={[styles.dot, { backgroundColor: '#4ECDC4' }]} />
                  <View style={styles.dotLine} />
                </View>
                <View style={styles.locationInputContainer}>
                  <CustomPlacesAutocomplete
                    ref={pickupRef}
                    placeholder="Pickup Address"
                    onPress={(data, details = null) => {
                      setPickup({
                        address: data.description,
                        location: {
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
                      <TouchableOpacity onPress={() => openMapPicker('pickup')} style={styles.mapIconBtn} activeOpacity={0.7}>
                        <Icon name="map" size={22} color="#4ECDC4" />
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>

              <View style={styles.locationDivider} />

              <View style={styles.locationInputWrapper}>
                <View style={styles.locationDot}>
                  <View style={[styles.dot, { backgroundColor: '#FF6B6B' }]} />
                </View>
                <View style={styles.locationInputContainer}>
                  <CustomPlacesAutocomplete
                    ref={dropoffRef}
                    placeholder="Delivery Address"
                    onPress={(data, details = null) => {
                      setDropoff({
                        address: data.description,
                        location: {
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
                      <TouchableOpacity onPress={() => openMapPicker('dropoff')} style={styles.mapIconBtn} activeOpacity={0.7}>
                        <Icon name="map" size={22} color="#FF6B6B" />
                      </TouchableOpacity>
                    )}
                  />
                </View>
              </View>
            </Animatable.View>

            {/* Parcel Details Section */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={200}
              style={styles.section}
            >
              <Text style={styles.sectionTitle}>📦 Parcel Details</Text>
              
              <Text style={styles.sizeTitle}>Select Vehicle for Delivery</Text>
              <View style={styles.sizeContainer}>
                {parcelSizes.map(renderParcelSize)}
              </View>

              <View style={styles.inputGrid}>
                <View style={styles.inputHalf}>
                  <View style={styles.inputWrapper}>
                    <Icon name="scale" size={20} color={colors.accent} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Weight (kg)"
                      placeholderTextColor={colors.textSecondary}
                      value={parcelDetails.weight}
                      onChangeText={(value) => handleChange('weight', value)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={styles.inputHalf}>
                  <View style={styles.inputWrapper}>
                    <Icon name="attach-money" size={20} color={colors.accent} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="COD Amount"
                      placeholderTextColor={colors.textSecondary}
                      value={parcelDetails.codAmount}
                      onChangeText={(value) => handleChange('codAmount', value)}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.inputWrapper}>
                <Icon name="description" size={20} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe your parcel (e.g., Books, Electronics, Documents)"
                  placeholderTextColor={colors.textSecondary}
                  value={parcelDetails.description}
                  onChangeText={(value) => handleChange('description', value)}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Icon name="info" size={20} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Special instructions for delivery"
                  placeholderTextColor={colors.textSecondary}
                  value={parcelDetails.instructions}
                  onChangeText={(value) => handleChange('instructions', value)}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.optionsRow}>
                <TouchableOpacity 
                  style={[styles.optionButton, parcelDetails.fragile && styles.optionButtonActive]}
                  onPress={() => handleChange('fragile', !parcelDetails.fragile)}
                  activeOpacity={0.7}
                >
                  <Icon name="warning" size={20} color={parcelDetails.fragile ? colors.accent : '#999'} />
                  <Text style={[styles.optionText, parcelDetails.fragile && styles.optionTextActive]}>
                    Fragile
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.optionButton, parcelDetails.urgent && styles.optionButtonActive]}
                  onPress={() => handleChange('urgent', !parcelDetails.urgent)}
                  activeOpacity={0.7}
                >
                  <Icon name="flash-on" size={20} color={parcelDetails.urgent ? colors.accent : '#999'} />
                  <Text style={[styles.optionText, parcelDetails.urgent && styles.optionTextActive]}>
                    Urgent
                  </Text>
                </TouchableOpacity>
              </View>
            </Animatable.View>

            {/* Receiver Details Section */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={300}
              style={styles.section}
            >
              <Text style={styles.sectionTitle}>👤 Receiver Details</Text>
              
              <View style={styles.inputWrapper}>
                <Icon name="person" size={20} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Receiver Name *"
                  placeholderTextColor={colors.textSecondary}
                  value={parcelDetails.receiverName}
                  onChangeText={(value) => handleChange('receiverName', value)}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Icon name="phone" size={20} color={colors.accent} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Receiver Phone *"
                  placeholderTextColor={colors.textSecondary}
                  value={parcelDetails.receiverPhone}
                  onChangeText={(value) => handleChange('receiverPhone', value)}
                  keyboardType="phone-pad"
                />
              </View>
            </Animatable.View>

            {/* Price Selection */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={350}
              style={[styles.section, { marginBottom: 40 }]}
            >
              <Text style={styles.sectionTitle}>Select Your Price</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.priceScrollContent}
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
            </Animatable.View>

            {/* Summary Section */}
            {pickup && dropoff && (
              <Animatable.View 
                animation="fadeInUp" 
                duration={600} 
                delay={400}
                style={styles.summarySection}
              >
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>📊 Delivery Summary</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Parcel Size</Text>
                    <Text style={styles.summaryValue}>
                      {parcelSizes.find(s => s.id === parcelDetails.size)?.label || 'Medium'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Weight</Text>
                    <Text style={styles.summaryValue}>
                      {parcelDetails.weight ? `${parcelDetails.weight} kg` : 'Not specified'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>COD Amount</Text>
                    <Text style={styles.summaryValue}>
                      {parcelDetails.codAmount ? `₨ ${parcelDetails.codAmount}` : 'Not specified'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Fragile</Text>
                    <Text style={[styles.summaryValue, parcelDetails.fragile && styles.summaryValueHighlight]}>
                      {parcelDetails.fragile ? 'Yes' : 'No'}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, styles.summaryRowLast]}>
                    <Text style={styles.summaryLabel}>Urgent</Text>
                    <Text style={[styles.summaryValue, parcelDetails.urgent && styles.summaryValueHighlight]}>
                      {parcelDetails.urgent ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </View>
              </Animatable.View>
            )}

            {/* Send Button */}
            <Animatable.View 
              animation="fadeInUp" 
              duration={600} 
              delay={500}
              style={styles.sendButtonContainer}
            >
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleCreateParcel}
                disabled={isSubmitting || loading || searchingDriver}
                activeOpacity={0.8}
              >
                {isSubmitting || loading || searchingDriver ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.text} size="small" />
                    <Text style={styles.loadingText}>
                      {searchingDriver ? 'Finding Driver...' : 'Sending...'}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Icon name="send" size={24} color={colors.text} />
                    <Text style={styles.sendButtonText}>Send Parcel</Text>
                  </>
                )}
              </TouchableOpacity>
            </Animatable.View>

            <View style={styles.bottomSpacer} />
          </ScrollView>

          {/* Map Picker Modal */}
          <Modal visible={showMapPicker} animationType="slide">
            <View style={styles.pickerModalContainer}>
              <View style={styles.pickerModalHeader}>
                <TouchableOpacity onPress={() => setShowMapPicker(false)} style={styles.pickerBackBtn} activeOpacity={0.7}>
                  <Icon name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.pickerModalTitle}>Select {mapPickerType === 'pickup' ? 'Pickup' : 'Dropoff'}</Text>
                <View style={{ width: 32 }} />
              </View>
              {mapPickerCoords && (
                <MapView
                  key={`${mapPickerType}-${showMapPicker}`}
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
              <View style={styles.pickerCenterPin} pointerEvents="none">
                <Icon name="location-on" size={44} color={mapPickerType === 'pickup' ? "#4ECDC4" : "#FF6B6B"} />
              </View>
              <View style={styles.pickerBottomCard}>
                <Text style={styles.pickerAddressLabel}>Selected Location</Text>
                <Text style={styles.pickerAddressText}>{mapPickerAddress}</Text>
                <TouchableOpacity style={styles.pickerConfirmBtn} onPress={confirmMapPicker} activeOpacity={0.8}>
                  <Text style={styles.pickerConfirmText}>Confirm Location</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

        </Animated.View>
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
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  historyButton: {
    padding: 4,
    position: 'relative',
  },
  historyBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  mapContainer: {
    height: 200,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: insetBg,
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
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
  section: {
    backgroundColor: cardBg,
    marginHorizontal: 20,
    marginBottom: 16,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  quickFillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accent + '15',
    borderRadius: 20,
  },
  quickFillText: {
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
  sizeTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    fontWeight: '500',
  },
  sizeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },
  sizeCard: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  sizeCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  sizeCardContent: {
    backgroundColor: cardBg,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sizeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  sizeLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sizeLabelSelected: {
    color: colors.accent,
  },
  sizePrice: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  sizePriceSelected: {
    color: colors.accent,
  },
  sizeDimensions: {
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  selectedCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: insetBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: 12,
    fontSize: 14,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  optionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: insetBg,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: colors.border,
  },
  optionButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '15',
  },
  optionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  optionTextActive: {
    color: colors.accent,
  },
  fareModeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  fareMode: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
  },
  fareModeSelected: {
    borderColor: colors.accent,
  },
  fareModeContent: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: insetBg,
  },
  fareModeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  fareModeText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  fareAmount: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  offerInput: {
    backgroundColor: cardBg,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 6,
    width: '100%',
    fontSize: 14,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summarySection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: cardBg,
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
  summaryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryRowLast: {
    borderBottomWidth: 0,
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  summaryValueHighlight: {
    color: colors.accent,
  },
  sendButtonContainer: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  sendButtonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
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
  mapIconBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 48,
  },
  pickerModalContainer: {
    flex: 1,
    backgroundColor: cardBg,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: cardBg,
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
    backgroundColor: cardBg,
    borderRadius: 28,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pickerBottomCard: {
    backgroundColor: cardBg,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
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
    backgroundColor: colors.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  pickerConfirmText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  priceScrollContent: {
    paddingHorizontal: 2,
    gap: 12,
    marginTop: 12,
  },
  priceOptionWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  priceOptionCard: {
    backgroundColor: insetBg,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '15',
  },
  priceOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  priceOptionTextSelected: {
    color: colors.text,
  },
  });
};

export default SendParcelScreen;