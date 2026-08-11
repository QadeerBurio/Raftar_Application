import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  FlatList,
  StatusBar,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import RatingComponent from '../../components/common/RatingComponent';

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

const CarpoolExecutionScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const route = useRoute();
  const navigation = useNavigation();
  const { carpool } = route.params;

  const [driverLocation, setDriverLocation] = useState(null);
  const [passengers, setPassengers] = useState(
    carpool.carpool.passengers.filter(p => p.status !== 'pending' && p.status !== 'rejected')
  );
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setDriverLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const locInterval = setInterval(async () => {
        let l = await Location.getCurrentPositionAsync({});
        const newLoc = { latitude: l.coords.latitude, longitude: l.coords.longitude };
        setDriverLocation(newLoc);
        await api.post('/rides/location', { 
          location: { coordinates: [newLoc.longitude, newLoc.latitude] } 
        }).catch((err) => {
          if (err.response?.status === 404) {
            clearInterval(locInterval);
          }
        });
      }, 5000);
      
      return () => clearInterval(locInterval);
    })();
  }, []);

  const handlePickup = async (passengerId) => {
    try {
      await api.post(`/bookings/carpool/${carpool._id}/pickup/${passengerId}`);
      setPassengers(passengers.map(p => 
        p.user._id === passengerId ? { ...p, status: 'picked_up' } : p
      ));
      Alert.alert('Success', 'Passenger picked up');
    } catch (e) {
      Alert.alert('Error', 'Failed to pick up');
    }
  };

  const handleDropoff = async (passengerId) => {
    try {
      await api.post(`/bookings/carpool/${carpool._id}/dropoff/${passengerId}`);
      setPassengers(passengers.map(p => 
        p.user._id === passengerId ? { ...p, status: 'dropped_off' } : p
      ));
      
      const allDone = passengers.every(p => 
        p.user._id === passengerId ? true : (p.status === 'dropped_off' || p.status === 'pending' || p.status === 'rejected')
      );
      if (allDone) {
        Alert.alert('Carpool Completed', 'All passengers dropped off. Please rate them before leaving.');
      } else {
        Alert.alert('Success', 'Passenger dropped off');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to drop off');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted': return YELLOW_PRIMARY;
      case 'picked_up': return '#4ECDC4';
      case 'dropped_off': return '#45B7D1';
      default: return GRAY_MEDIUM;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'accepted': return 'Waiting for Pickup';
      case 'picked_up': return 'In Car';
      case 'dropped_off': return 'Dropped Off';
      default: return status;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'accepted': return 'clock-time-four';
      case 'picked_up': return 'car';
      case 'dropped_off': return 'check-circle';
      default: return 'circle';
    }
  };

  const renderPassenger = ({ item, index }) => {
    const user = item.user || {};
    return (
      <View style={styles.passengerCard}>
        <View style={styles.passengerHeader}>
          <View style={styles.passengerInfo}>
            {user.profileImage ? (
              <Image source={{ uri: user.profileImage }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <LinearGradient
                  colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                  style={styles.avatarGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.avatarText}>{user.name?.charAt(0) || '?'}</Text>
                </LinearGradient>
              </View>
            )}
            <View style={styles.passengerDetails}>
              <Text style={styles.passengerName}>{user.name || 'Passenger'}</Text>
              <View style={styles.passengerMeta}>
                <Icon name="star" size={12} color={YELLOW_PRIMARY} />
                <Text style={styles.passengerRating}>{user.stats?.rating || user.rating || 0}</Text>
              </View>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
            <IconMC name={getStatusIcon(item.status)} size={12} color={getStatusColor(item.status)} />
            <Text style={[styles.statusBadgeText, { color: getStatusColor(item.status) }]}>
              {getStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.passengerActions}>
          {item.status === 'accepted' && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handlePickup(user._id)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#4ECDC4', '#44B39D']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="person-add" size={18} color={WHITE} />
                <Text style={styles.actionButtonText}>Pick Up</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {item.status === 'picked_up' && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleDropoff(user._id)}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#FF6B6B', '#EE5A24']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="person-remove" size={18} color={WHITE} />
                <Text style={styles.actionButtonText}>Drop Off</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {item.status === 'dropped_off' && (
          <View style={styles.ratingContainer}>
            <RatingComponent
              bookingId={carpool._id}
              tripType="carpool"
              ratedUser={user._id}
              ratedUserRole="passenger"
              onDone={() => {
                const allDone = passengers.every(p => 
                  p.status === 'dropped_off' || p.status === 'pending' || p.status === 'rejected'
                );
                if (allDone) {
                  navigation.goBack();
                } else {
                  Alert.alert('Success', 'Rating submitted');
                }
              }}
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={WHITE} />
      
      <View style={styles.container}>
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
            <Text style={styles.headerTitle}>Carpool Execution</Text>
            <Text style={styles.headerSubtitle}>
              {passengers.filter(p => p.status === 'dropped_off').length} / {passengers.length} completed
            </Text>
          </View>
          <View style={styles.headerRightPlaceholder} />
        </View>

        {/* Map Section */}
        <View style={styles.mapSection}>
          <View style={styles.mapContainer}>
            {driverLocation ? (
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_GOOGLE}
                initialRegion={{
                  latitude: driverLocation.latitude,
                  longitude: driverLocation.longitude,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }}
                showsUserLocation={true}
                showsMyLocationButton={false}
                showsCompass={false}
                onMapReady={() => setMapReady(true)}
              >
                <Marker coordinate={driverLocation}>
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
              </MapView>
            ) : (
              <View style={styles.mapLoading}>
                <ActivityIndicator size="large" color={YELLOW_PRIMARY} />
                <Text style={styles.mapLoadingText}>Loading map...</Text>
              </View>
            )}
            
            {/* Map Overlay Info */}
            <View style={styles.mapOverlay}>
              <View style={styles.mapInfo}>
                <IconMC name="car-multiple" size={16} color={WHITE} />
                <Text style={styles.mapInfoText}>
                  {passengers.filter(p => p.status === 'picked_up' || p.status === 'accepted').length} passengers on board
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Passengers List */}
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Passengers</Text>
            <Text style={styles.listCount}>{passengers.length} total</Text>
          </View>
          
          <FlatList
            data={passengers}
            renderItem={renderPassenger}
            keyExtractor={(item, index) => item.user._id || index.toString()}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconMC name="account-multiple" size={48} color={GRAY_LIGHT} />
                <Text style={styles.emptyTitle}>No Passengers</Text>
                <Text style={styles.emptyText}>No passengers in this carpool</Text>
              </View>
            }
          />
        </View>
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
  mapSection: {
    padding: 16,
    paddingBottom: 8,
  },
  mapContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    backgroundColor: GRAY_LIGHT,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: GRAY_LIGHT,
  },
  mapLoadingText: {
    color: GRAY_MEDIUM,
    fontSize: 14,
    marginTop: 8,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  mapInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
  listContainer: {
    flex: 1,
    backgroundColor: WHITE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  listCount: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 20,
  },
  passengerCard: {
    backgroundColor: GRAY_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passengerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarPlaceholder: {
    marginRight: 12,
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: WHITE,
    fontSize: 18,
    fontWeight: '700',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  passengerActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  actionButtonText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  ratingContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: BLACK,
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    marginTop: 4,
  },
  });
};

export default CarpoolExecutionScreen;