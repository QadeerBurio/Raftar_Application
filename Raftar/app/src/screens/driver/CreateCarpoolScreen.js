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
  SafeAreaView,
  StatusBar,
  Dimensions,
  Modal,
  Platform,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import DateTimePicker from '@react-native-community/datetimepicker';
import CustomPlacesAutocomplete from '../../components/common/CustomPlacesAutocomplete';
import { createCarpoolBooking } from '../../redux/slices/bookingSlice';
import { GOOGLE_MAPS_API_KEY } from '../../config/constants';

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

const CreateCarpoolScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);
  
  const isIntercity = route.params?.isIntercity || false;
  
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [seats, setSeats] = useState(4);
  const [pricePerSeat, setPricePerSeat] = useState(100);
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [isCreating, setIsCreating] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const pickupRef = useRef(null);
  const dropoffRef = useRef(null);

  useEffect(() => {
    getCurrentLocation();
  }, []);

  const getCurrentLocation = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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
          type: 'Point',
          coordinates: [loc.coords.longitude, loc.coords.latitude]
        },
        placeId: ''
      });
      pickupRef.current?.setAddressText(addressStr);
    } catch (e) {
      console.log('Location error', e);
    }
  };

  const handleCreateCarpool = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter pickup and dropoff locations');
      return;
    }

    setIsCreating(true);
    try {
      const departureTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 
                                     time.getHours(), time.getMinutes());
      if (departureTime <= new Date()) {
        setIsCreating(false);
        Alert.alert('Invalid Date', 'Please select a future date and time for your carpool.');
        return;
      }
                                     
      const bookingData = {
        pickup: {
          address: pickup.address,
          location: pickup.location,
          placeId: pickup.placeId
        },
        dropoff: {
          address: dropoff.address,
          location: dropoff.location,
          placeId: dropoff.placeId
        },
        seats,
        pricePerSeat,
        timeWindow: {
          start: departureTime,
          end: new Date(departureTime.getTime() + 60 * 60 * 1000)
        },
        isIntercity
      };
      
      const result = await dispatch(createCarpoolBooking(bookingData)).unwrap();
      
      if (result.success) {
        Alert.alert(
          'Success! 🚗',
          `Your ${isIntercity ? 'intercity ' : ''}carpool has been created successfully!`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to create carpool');
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const onChangeDate = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDate(selectedDate);
    }
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
  };

  const onChangeTime = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      setTime(selectedTime);
    }
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
  };

  const incrementSeats = () => {
    if (seats < 6) setSeats(seats + 1);
  };

  const decrementSeats = () => {
    if (seats > 1) setSeats(seats - 1);
  };

  const incrementPrice = () => {
    setPricePerSeat(pricePerSeat + 50);
  };

  const decrementPrice = () => {
    if (pricePerSeat > 50) setPricePerSeat(pricePerSeat - 50);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={WHITE} />
      
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
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
            <Text style={styles.headerTitle}>Create Carpool</Text>
            <Text style={styles.headerSubtitle}>
              {isIntercity ? 'Intercity Trip' : 'Share your ride'}
            </Text>
          </View>
          <View style={styles.headerRightPlaceholder} />
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Location Section */}
          <Animatable.View animation="fadeInUp" duration={600} delay={100} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="route" size={20} color={YELLOW_PRIMARY} />
              <Text style={styles.sectionTitle}>Route Details</Text>
            </View>
            
            <View style={[styles.locationInputWrapper, { zIndex: 2 }]}>
              <View style={styles.locationDotContainer}>
                <View style={[styles.locationDot, styles.pickupDot]} />
                <View style={styles.locationLine} />
              </View>
              <View style={styles.locationInputContainer}>
                <CustomPlacesAutocomplete
                  ref={pickupRef}
                  placeholder="Enter pickup location"
                  onPress={(data, details = null) => {
                    setPickup({
                      address: data.description,
                      location: { 
                        type: 'Point',
                        coordinates: [details.geometry.location.lng, details.geometry.location.lat] 
                      },
                      placeId: data.place_id
                    });
                  }}
                  styles={{
                    textInput: styles.locationTextInput,
                    container: styles.autocompleteContainer,
                    listView: styles.autocompleteList,
                    row: styles.autocompleteRow,
                    description: styles.autocompleteDescription,
                  }}
                  placeholderTextColor={GRAY_MEDIUM}
                />
              </View>
            </View>

            <View style={[styles.locationInputWrapper, { zIndex: 1 }]}>
              <View style={styles.locationDotContainer}>
                <View style={[styles.locationDot, styles.dropoffDot]} />
              </View>
              <View style={styles.locationInputContainer}>
                <CustomPlacesAutocomplete
                  ref={dropoffRef}
                  placeholder="Enter destination"
                  onPress={(data, details = null) => {
                    setDropoff({
                      address: data.description,
                      location: { 
                        type: 'Point',
                        coordinates: [details.geometry.location.lng, details.geometry.location.lat] 
                      },
                      placeId: data.place_id
                    });
                  }}
                  styles={{
                    textInput: styles.locationTextInput,
                    container: styles.autocompleteContainer,
                    listView: styles.autocompleteList,
                    row: styles.autocompleteRow,
                    description: styles.autocompleteDescription,
                  }}
                  placeholderTextColor={GRAY_MEDIUM}
                />
              </View>
            </View>
          </Animatable.View>

          {/* Ride Details Section */}
          <Animatable.View animation="fadeInUp" duration={600} delay={200} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="settings" size={20} color={YELLOW_PRIMARY} />
              <Text style={styles.sectionTitle}>Ride Settings</Text>
            </View>
            
            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <View style={[styles.detailIcon, { backgroundColor: '#4ECDC4' + '15' }]}>
                  <Icon name="people" size={20} color="#4ECDC4" />
                </View>
                <Text style={styles.detailLabel}>Available Seats</Text>
              </View>
              <View style={styles.selector}>
                <TouchableOpacity 
                  onPress={decrementSeats} 
                  style={styles.selectorButton}
                  activeOpacity={0.7}
                >
                  <Icon name="remove" size={20} color={WHITE} />
                </TouchableOpacity>
                <Text style={styles.selectorText}>{seats}</Text>
                <TouchableOpacity 
                  onPress={incrementSeats} 
                  style={styles.selectorButton}
                  activeOpacity={0.7}
                >
                  <Icon name="add" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <View style={[styles.detailIcon, { backgroundColor: YELLOW_PRIMARY + '15' }]}>
                  <Icon name="attach-money" size={20} color={YELLOW_PRIMARY} />
                </View>
                <Text style={styles.detailLabel}>Price Per Seat</Text>
              </View>
              <View style={styles.selector}>
                <TouchableOpacity 
                  onPress={decrementPrice} 
                  style={styles.selectorButton}
                  activeOpacity={0.7}
                >
                  <Icon name="remove" size={20} color={WHITE} />
                </TouchableOpacity>
                <Text style={styles.selectorText}>Rs. {pricePerSeat}</Text>
                <TouchableOpacity 
                  onPress={incrementPrice} 
                  style={styles.selectorButton}
                  activeOpacity={0.7}
                >
                  <Icon name="add" size={20} color={WHITE} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.detailRow}>
              <View style={styles.detailLeft}>
                <View style={[styles.detailIcon, { backgroundColor: '#FF6B6B' + '15' }]}>
                  <Icon name="calendar-today" size={20} color="#FF6B6B" />
                </View>
                <Text style={styles.detailLabel}>Departure</Text>
              </View>
              <View style={styles.dateTimeDisplay}>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
                  <Text style={styles.dateText}>{formatDate(date)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowTimePicker(true)} activeOpacity={0.7}>
                  <Text style={styles.timeText}>{formatTime(time)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.intercityToggle}>
              <View style={styles.toggleLabel}>
                <IconMC name="bus" size={20} color={isIntercity ? YELLOW_PRIMARY : GRAY_MEDIUM} />
                <Text style={[styles.toggleText, isIntercity && styles.toggleTextActive]}>
                  Intercity Trip
                </Text>
              </View>
              <View style={[styles.toggleBadge, isIntercity && styles.toggleBadgeActive]}>
                <Text style={[styles.toggleBadgeText, isIntercity && styles.toggleBadgeTextActive]}>
                  {isIntercity ? 'Yes' : 'No'}
                </Text>
              </View>
            </View>
          </Animatable.View>

          {/* Summary Section */}
          <Animatable.View animation="fadeInUp" duration={600} delay={300} style={styles.summarySection}>
            <Text style={styles.summaryTitle}>Trip Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Earnings</Text>
                <Text style={styles.summaryValue}>Rs. {seats * pricePerSeat}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Seats Available</Text>
                <Text style={styles.summaryValue}>{seats}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Price per Seat</Text>
                <Text style={styles.summaryValue}>Rs. {pricePerSeat}</Text>
              </View>
            </View>
          </Animatable.View>

          {/* Create Button */}
          <Animatable.View animation="fadeInUp" duration={600} delay={400} style={styles.createButtonContainer}>
            <TouchableOpacity 
              style={styles.createButton} 
              onPress={handleCreateCarpool} 
              disabled={isCreating}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                style={styles.createButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isCreating ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <>
                    <Icon name="directions-car" size={24} color={WHITE} />
                    <Text style={styles.createButtonText}>Publish Carpool</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animatable.View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
      
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={onChangeDate}
          minimumDate={new Date()}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          display="default"
          onChange={onChangeTime}
        />
      )}
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
    marginTop:23
  },
  scrollContent: {
    paddingBottom: 40,
    paddingTop: 16,
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
  headerRightPlaceholder: {
    width: 40,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: WHITE,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  locationInputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDotContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 12,
    paddingTop: 14,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: WHITE,
  },
  pickupDot: {
    backgroundColor: '#4ECDC4',
  },
  dropoffDot: {
    backgroundColor: '#FF6B6B',
  },
  locationLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E0E0E0',
    marginTop: 4,
  },
  locationInputContainer: {
    flex: 1,
  },
  locationTextInput: {
    backgroundColor: GRAY_LIGHT,
    color: BLACK,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  autocompleteContainer: {
    flex: 1,
  },
  autocompleteList: {
    backgroundColor: WHITE,
    borderRadius: 12,
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    zIndex: 1000,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  autocompleteRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  autocompleteDescription: {
    color: BLACK,
    fontSize: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: GRAY_LIGHT,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailLabel: {
    color: GRAY_DARK,
    fontSize: 14,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectorButton: {
    width: 26,
    height: 26,
    borderRadius: 16,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  selectorText: {
    color: BLACK,
    fontSize: 16,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  dateTimeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    color: BLACK,
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: {
    color: BLACK,
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: WHITE,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  intercityToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: GRAY_LIGHT,
    padding: 14,
    borderRadius: 12,
    marginTop: 2,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleText: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: BLACK,
  },
  toggleBadge: {
    backgroundColor: WHITE,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBadgeActive: {
    backgroundColor: YELLOW_PRIMARY,
    borderColor: YELLOW_PRIMARY,
  },
  toggleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: GRAY_MEDIUM,
  },
  toggleBadgeTextActive: {
    color: WHITE,
  },
  summarySection: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 10,
  },
  summaryCard: {
    backgroundColor: WHITE,
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: GRAY_MEDIUM,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: insetBg,
    marginVertical: 6,
  },
  createButtonContainer: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  createButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: YELLOW_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  createButtonText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
  });
};

export default CreateCarpoolScreen;