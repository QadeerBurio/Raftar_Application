import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import SidebarMenu from '../../components/common/SidebarMenu';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { toggleOnlineStatus, getDriverStats, getDriverProfile } from '../../redux/slices/driverSlice';
import { useSocket } from '../../context/SocketContext';

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

const DriverDashboardScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { driver, stats, loading } = useSelector(state => state.driver);
  const { user } = useSelector(state => state.auth);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [recentRides, setRecentRides] = useState([]);
  const [earnings, setEarnings] = useState(null);
  const [activeRide, setActiveRide] = useState(null);
  const [rideRequests, setRideRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const socket = useSocket();
  const mapRef = useRef(null);

  useEffect(() => {
    fetchDriverStats();
    getLocation();
    fetchRideRequests();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchRecentRides();
      checkActiveRide();
      fetchRideRequests();
    }, [])
  );

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log('Error getting location:', error);
    }
  };

  const fetchRideRequests = async () => {
    try {
      // Simulated ride requests near driver location
      const mockRequests = [
        {
          id: '1',
          passengerName: 'Sarah Johnson',
          rating: 4.8,
          pickup: { latitude: 37.78825, longitude: -122.4324 },
          dropoff: { latitude: 37.7749, longitude: -122.4194 },
          distance: '2.3 km',
          fare: 'Rs. 450',
          time: '5 min ago',
          status: 'pending',
          passengerImage: 'https://randomuser.me/api/portraits/women/1.jpg',
        },
        {
          id: '2',
          passengerName: 'Michael Chen',
          rating: 4.9,
          pickup: { latitude: 37.7749, longitude: -122.4194 },
          dropoff: { latitude: 37.7833, longitude: -122.4167 },
          distance: '1.8 km',
          fare: 'Rs. 380',
          time: '10 min ago',
          status: 'pending',
          passengerImage: 'https://randomuser.me/api/portraits/men/2.jpg',
        },
        {
          id: '3',
          passengerName: 'Emily Rodriguez',
          rating: 4.7,
          pickup: { latitude: 37.7833, longitude: -122.4167 },
          dropoff: { latitude: 37.7933, longitude: -122.4267 },
          distance: '3.1 km',
          fare: 'Rs. 520',
          time: '15 min ago',
          status: 'pending',
          passengerImage: 'https://randomuser.me/api/portraits/women/3.jpg',
        },
      ];
      setRideRequests(mockRequests);
    } catch (error) {
      console.log('Error fetching ride requests:', error);
    }
  };

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

  const fetchRecentRides = async () => {
    try {
      const response = await api.get('/history/driver');
      if (response.data?.success) {
        setRecentRides(response.data.history.slice(0, 3));
      }
      const earningsRes = await api.get('/drivers/earnings');
      if (earningsRes.data?.success) {
        setEarnings(earningsRes.data.earnings);
      }
    } catch (error) {
      console.log('Error fetching driver dashboard data:', error);
    }
  };

  const getBannerTitle = (status) => {
    if (status === 'searching') return '🔍 Pending Offer';
    if (status === 'accepted') return '✅ Ride Accepted';
    return '🚗 Active Ride in Progress';
  };

  const getBannerColor = (status) => {
    if (status === 'searching') return '#A29BFE';
    return YELLOW_PRIMARY;
  };

  const getBannerTextColor = (status) => {
    if (status === 'searching') return WHITE;
    return BLACK;
  };

  useEffect(() => {
    if (!socket) return;
    
    const handleBidAccepted = (data) => {
      Alert.alert('Success', 'Passenger accepted your offer!');
      navigation.navigate('ActiveRide', { ride: data.ride });
    };

    const handleJoinRequest = (data) => {
      Alert.alert('New Carpool Request', 'A passenger wants to join your carpool!', [
        { text: 'Manage', onPress: () => navigation.navigate('ManageCarpools') },
        { text: 'Cancel', style: 'cancel' }
      ]);
    };

    const handleCarpoolRequest = (data) => {
      Alert.alert(
        'Passenger Carpool Request',
        'A passenger is looking for a carpool along your route!',
        [
          { text: 'View Requests', onPress: () => navigation.navigate('DriverCarpoolRequests') },
          { text: 'Dismiss', style: 'cancel' }
        ]
      );
    };

    socket.on('bid-accepted', handleBidAccepted);
    socket.on('join-request', handleJoinRequest);
    socket.on('carpool-request', handleCarpoolRequest);
    return () => {
      socket.off('bid-accepted', handleBidAccepted);
      socket.off('join-request', handleJoinRequest);
      socket.off('carpool-request', handleCarpoolRequest);
    };
  }, [navigation, socket]);

  const fetchDriverStats = async () => {
    await dispatch(getDriverStats());
  };

  const handleToggleOnline = async () => {
    try {
      const profileAction = await dispatch(getDriverProfile());
      
      if (profileAction.error) {
        navigation.navigate('DriverRegistration');
        return;
      }
      
      const currentDriver = profileAction.payload.driver;
      
      if (currentDriver.status === 'pending') {
        Alert.alert('Verification Pending', 'Your profile is under review by the admin. Please wait for approval.');
        return;
      }
      
      if (currentDriver.status === 'rejected') {
        Alert.alert('Verification Rejected', 'Your profile was rejected. Please contact support.');
        return;
      }
      
      if (currentDriver.status === 'approved' || currentDriver.status === 'active') {
        if (!driver?.isOnline) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Location permission is required to go online.');
            return;
          }
          const location = await Location.getCurrentPositionAsync({});
          const coords = [location.coords.longitude, location.coords.latitude];
          
          await api.post('/rides/location', {
            location: { coordinates: coords }
          });
          
          await dispatch(toggleOnlineStatus(true));
          
          window.locationInterval = setInterval(async () => {
            const loc = await Location.getCurrentPositionAsync({});
            await api.post('/rides/location', {
              location: { coordinates: [loc.coords.longitude, loc.coords.latitude] }
            }).catch(() => {});
          }, 10000);
        } else {
          if (window.locationInterval) clearInterval(window.locationInterval);
          await dispatch(toggleOnlineStatus(false));
        }
      } else {
        Alert.alert('Notice', `Your profile status is: ${currentDriver.status}`);
      }
    } catch (error) {
      console.error('[DriverDashboard] Error toggling online:', error);
      Alert.alert('Error', 'Failed to toggle online status');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDriverStats();
    await fetchRecentRides();
    await checkActiveRide();
    await fetchRideRequests();
    setRefreshing(false);
  };

  const handleMarkerPress = (request) => {
    setSelectedRequest(request);
    setModalVisible(true);
  };

  const handleAcceptRequest = (request) => {
    Alert.alert(
      'Accept Ride',
      `Accept ride request from ${request.passengerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Accept', 
          onPress: () => {
            setModalVisible(false);
            navigation.navigate('ActiveRide', { ride: request });
          }
        }
      ]
    );
  };

  const statsCards = [
    {
      title: 'Today\'s Earnings',
      value: `Rs. ${earnings?.today?.toLocaleString() || 0}`,
      icon: 'cash',
      iconType: 'material-community',
      color: '#4ECDC4',
    },
    {
      title: 'Weekly Earnings',
      value: `Rs. ${earnings?.weekly?.toLocaleString() || 0}`,
      icon: 'trending-up',
      iconType: 'material',
      color: YELLOW_PRIMARY,
    },
    {
      title: 'Wallet Balance',
      value: `Rs. ${stats?.walletBalance?.toLocaleString() || 0}`,
      icon: 'wallet',
      iconType: 'material-community',
      color: '#45B7D1',
    },
    {
      title: 'Rating',
      value: `⭐ ${driver?.rating || stats?.profile?.rating || 0}`,
      icon: 'star',
      iconType: 'material',
      color: '#FF6B6B',
    }
  ];

  const quickActions = [
    {
      title: 'Ride Requests',
      icon: 'car-sports',
      iconType: 'material-community',
      screen: 'RideRequest',
      color: YELLOW_PRIMARY,
      badge: rideRequests.length
    },
    {
      title: 'Earnings',
      icon: 'monetization-on',
      iconType: 'material',
      screen: 'Earnings',
      color: '#4ECDC4'
    },

    {
      title: 'Manage Carpools',
      icon: 'people',
      iconType: 'material',
      screen: 'ManageCarpools',
      color: '#A29BFE'
    },
    {
      title: 'Intercity',
      icon: 'bus',
      iconType: 'material-community',
      screen: 'DriverIntercity',
      color: '#B39DDB'
    }
  ];

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material':
        return <Icon name={icon} size={size} color={color} />;
      case 'material-community':
        return <IconMC name={icon} size={size} color={color} />;
      default:
        return <Icon name={icon} size={size} color={color} />;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={YELLOW_PRIMARY} />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={colors.statusBarStyle} backgroundColor={colors.background} />
      
      <View style={styles.container}>
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
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>{getGreeting()},</Text>
              <Text style={styles.driverName}>{user?.name || 'Driver'}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={() => navigation.navigate('Notifications')}
                activeOpacity={0.7}
              >
                <IconIonic name="notifications-outline" size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.avatarButton}
                onPress={() => setSidebarVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.avatarText}>
                  {(user?.name || 'D').charAt(0).toUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Online Status Toggle */}
          <View style={styles.statusContainer}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusIndicator, driver?.isOnline && styles.statusOnline]} />
              <View>
                <Text style={styles.statusLabel}>Status</Text>
                <Text style={[styles.statusValue, driver?.isOnline ? styles.onlineText : styles.offlineText]}>
                  {driver?.isOnline ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.statusButton, driver?.isOnline ? styles.onlineButton : styles.offlineButton]}
              onPress={handleToggleOnline}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={driver?.isOnline ? ['#FF6B6B', '#EE5A24'] : [YELLOW_PRIMARY, YELLOW_SECONDARY]}
                style={styles.statusButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.statusButtonText}>
                  {driver?.isOnline ? 'Go Offline' : 'Go Online'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Active Ride Banner */}
          {activeRide && (
            <TouchableOpacity 
              style={[styles.activeRideBanner, { backgroundColor: getBannerColor(activeRide.status) }]} 
              onPress={() => navigation.navigate('ActiveRide', { ride: activeRide })}
              activeOpacity={0.9}
            >
              <View style={styles.activeRideBannerContent}>
                <View style={styles.activeRideLeft}>
                  <View style={styles.activeRideIcon}>
                    <Icon name="directions-car" size={24} color={getBannerTextColor(activeRide.status)} />
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
                <Icon name="chevron-right" size={28} color={getBannerTextColor(activeRide.status)} />
              </View>
            </TouchableOpacity>
          )}



          {/* Quick Actions */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsGrid}>
            {quickActions.map((action, index) => (
              <View key={index} style={styles.actionCardWrapper}>
                <TouchableOpacity
                  style={styles.actionCard}
                  onPress={() => navigation.navigate(action.screen)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: action.color + '15' }]}>
                    {getIcon(action.icon, action.iconType, 28, action.color)}
                    {action.badge && (
                      <View style={styles.actionBadge}>
                        <Text style={styles.actionBadgeText}>{action.badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.actionTitle}>{action.title}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Recent Activity */}
          <View style={styles.recentActivityContainer}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {recentRides.length > 0 ? (
              recentRides.map((ride, index) => (
                <View key={index} style={styles.activityItem}>
                  <View style={styles.activityIcon}>
                    <Icon name="history" size={20} color={YELLOW_PRIMARY} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>
                      {ride.type === 'carpool' ? '🚗 Carpool' : '🚕 Ride'} - {ride.status}
                    </Text>
                    <Text style={styles.activityDetail}>
                      {ride.pickup?.address?.substring(0, 30) || 'N/A'} → {ride.dropoff?.address?.substring(0, 30) || 'N/A'}
                    </Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {new Date(ride.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.noActivityContainer}>
                <IconMC name="calendar-clock" size={48} color={GRAY_MEDIUM} />
                <Text style={styles.noActivityText}>No recent rides</Text>
                <Text style={styles.noActivitySubtext}>Your ride history will appear here</Text>
              </View>
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </View>

      {/* Ride Request Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            
            {selectedRequest && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalPassengerInfo}>
                    <Image 
                      source={{ uri: selectedRequest.passengerImage }} 
                      style={styles.modalPassengerImage}
                    />
                    <View>
                      <Text style={styles.modalPassengerName}>{selectedRequest.passengerName}</Text>
                      <View style={styles.modalRatingContainer}>
                        <Icon name="star" size={14} color={YELLOW_PRIMARY} />
                        <Text style={styles.modalRating}>{selectedRequest.rating}</Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    onPress={() => setModalVisible(false)}
                    style={styles.modalCloseButton}
                  >
                    <Icon name="close" size={24} color={GRAY_MEDIUM} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.modalDetails}>
                  <View style={styles.modalDetailRow}>
                    <View style={styles.modalDetailIconContainer}>
                      <Icon name="my-location" size={20} color={YELLOW_PRIMARY} />
                    </View>
                    <View style={styles.modalDetailTextContainer}>
                      <Text style={styles.modalDetailLabel}>Pickup</Text>
                      <Text style={styles.modalDetailValue}>123 Main Street, Downtown</Text>
                    </View>
                  </View>
                  <View style={styles.modalDetailConnector} />
                  <View style={styles.modalDetailRow}>
                    <View style={styles.modalDetailIconContainer}>
                      <Icon name="location-on" size={20} color="#FF6B6B" />
                    </View>
                    <View style={styles.modalDetailTextContainer}>
                      <Text style={styles.modalDetailLabel}>Dropoff</Text>
                      <Text style={styles.modalDetailValue}>456 Park Avenue, Uptown</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.modalFareContainer}>
                  <View style={styles.modalFareItem}>
                    <Text style={styles.modalFareLabel}>Distance</Text>
                    <Text style={styles.modalFareValue}>{selectedRequest.distance}</Text>
                  </View>
                  <View style={styles.modalFareDivider} />
                  <View style={styles.modalFareItem}>
                    <Text style={styles.modalFareLabel}>Estimated Fare</Text>
                    <Text style={[styles.modalFareValue, styles.modalFareHighlight]}>{selectedRequest.fare}</Text>
                  </View>
                  <View style={styles.modalFareDivider} />
                  <View style={styles.modalFareItem}>
                    <Text style={styles.modalFareLabel}>Time</Text>
                    <Text style={styles.modalFareValue}>{selectedRequest.time}</Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={styles.modalDeclineButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.modalDeclineText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.modalAcceptButton}
                    onPress={() => handleAcceptRequest(selectedRequest)}
                  >
                    <LinearGradient
                      colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                      style={styles.modalAcceptGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={styles.modalAcceptText}>Accept Ride</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <SidebarMenu
        visible={sidebarVisible}
        onClose={() => setSidebarVisible(false)}
      />
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
    marginTop:34
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
  },
  greeting: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    fontWeight: '400',
  },
  driverName: {
    fontSize: 22,
    fontWeight: '700',
    color: BLACK,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: cardBg,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.accentText,
    fontSize: 16,
    fontWeight: '700',
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF6B6B',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  notificationBadgeText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '700',
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  profileGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: WHITE,
    marginHorizontal: 20,
    marginVertical: 16,
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
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  statusOnline: {
    backgroundColor: '#4ECDC4',
  },
  statusLabel: {
    color: GRAY_MEDIUM,
    fontSize: 12,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  onlineText: {
    color: '#4ECDC4',
  },
  offlineText: {
    color: '#FF6B6B',
  },
  statusButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  statusButtonGradient: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineButton: {
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  offlineButton: {
    borderWidth: 1,
    borderColor: YELLOW_PRIMARY,
  },
  statusButtonText: {
    color: WHITE,
    fontWeight: '600',
    fontSize: 14,
  },
  activeRideBanner: {
    marginHorizontal: 20,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeRideBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  activeRideBannerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.8,
  },
  mapSection: {
    marginHorizontal: 20,
    marginBottom: 16,
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: BLACK,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    color: YELLOW_PRIMARY,
    fontWeight: '500',
  },
  mapContainer: {
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
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
  requestCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  requestCounterText: {
    color: WHITE,
    fontSize: 12,
    fontWeight: '500',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerGradient: {
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  statCard: {
    width: '48%',
    backgroundColor: WHITE,
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statValue: {
    color: BLACK,
    fontSize: 18,
    fontWeight: '700',
  },
  statTitle: {
    color: GRAY_MEDIUM,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '500',
    color: YELLOW_PRIMARY,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 10,
  },
  actionCardWrapper: {
    width: '30%',
  },
  actionCard: {
    backgroundColor: WHITE,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  actionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF6B6B',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBadgeText: {
    color: WHITE,
    fontSize: 10,
    fontWeight: '700',
  },
  actionTitle: {
    color: GRAY_DARK,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  recentActivityContainer: {
    backgroundColor: WHITE,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 10,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GRAY_LIGHT,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: YELLOW_PRIMARY + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    color: BLACK,
    fontSize: 14,
    fontWeight: '500',
  },
  activityDetail: {
    color: GRAY_MEDIUM,
    fontSize: 12,
    marginTop: 2,
  },
  activityTime: {
    color: GRAY_MEDIUM,
    fontSize: 11,
    fontWeight: '400',
  },
  noActivityContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noActivityText: {
    color: GRAY_DARK,
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  noActivitySubtext: {
    color: GRAY_MEDIUM,
    fontSize: 13,
    marginTop: 4,
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
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalPassengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalPassengerImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  modalPassengerName: {
    fontSize: 18,
    fontWeight: '700',
    color: BLACK,
  },
  modalRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalRating: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: insetBg,
    marginBottom: 16,
  },
  modalDetails: {
    marginBottom: 16,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  modalDetailIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: YELLOW_PRIMARY + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDetailTextContainer: {
    flex: 1,
  },
  modalDetailLabel: {
    fontSize: 12,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  modalDetailValue: {
    fontSize: 14,
    color: BLACK,
    fontWeight: '500',
    marginTop: 2,
  },
  modalDetailConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#E0E0E0',
    marginLeft: 17,
    marginVertical: 4,
  },
  modalFareContainer: {
    flexDirection: 'row',
    backgroundColor: GRAY_LIGHT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  modalFareItem: {
    flex: 1,
    alignItems: 'center',
  },
  modalFareLabel: {
    fontSize: 11,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  modalFareValue: {
    fontSize: 14,
    color: BLACK,
    fontWeight: '600',
    marginTop: 2,
  },
  modalFareHighlight: {
    color: YELLOW_PRIMARY,
    fontSize: 16,
  },
  modalFareDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalDeclineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDeclineText: {
    fontSize: 16,
    fontWeight: '600',
    color: GRAY_MEDIUM,
  },
  modalAcceptButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalAcceptGradient: {
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAcceptText: {
    fontSize: 16,
    fontWeight: '600',
    color: WHITE,
  },
  });
};

export default DriverDashboardScreen;