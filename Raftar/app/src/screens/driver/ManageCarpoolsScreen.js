import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Image,
  RefreshControl,
  StatusBar,
  Platform,
  Dimensions,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Animatable from 'react-native-animatable';
import { acceptCarpoolRequest, acceptPassengerCarpoolRequest, rejectCarpoolRequest, startCarpool } from '../../redux/slices/bookingSlice';
import api from '../../services/api';
import CarpoolMapPreview from '../../components/common/CarpoolMapPreview';

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

const ManageCarpoolsScreen = () => {
  const { colors, isDark } = useTheme();
  const { YELLOW_PRIMARY, YELLOW_SECONDARY, WHITE, BLACK, GRAY_DARK, GRAY_MEDIUM, GRAY_LIGHT, GRAY_BG } = useMemo(() => getThemePalette(colors, isDark), [colors, isDark]);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [acceptedCarpools, setAcceptedCarpools] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const route = useRoute();

  const isIntercity = route.params?.isIntercity || false;

  useEffect(() => {
    fetchDriverCarpools();
  }, []);

  const fetchDriverCarpools = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/bookings/driver-carpools?isIntercity=${isIntercity}`);
      setAcceptedCarpools(response.data.acceptedCarpools || []);
      setPendingRequests(response.data.pendingRequests || []);
    } catch (error) {
      console.log('Fetch driver carpools error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDriverCarpools();
  };

  const handleAccept = async (carpoolId, passengerId, isRequest = false) => {
    try {
      if (isRequest) {
        await dispatch(acceptPassengerCarpoolRequest(carpoolId)).unwrap();
      } else {
        await dispatch(acceptCarpoolRequest({ carpoolId, passengerId })).unwrap();
      }
      fetchDriverCarpools();
    } catch (e) {
      Alert.alert('Error', typeof e === 'string' ? e : 'Failed to accept');
    }
  };

  const handleReject = async (carpoolId, passengerId) => {
    Alert.alert(
      'Reject Request',
      'Are you sure you want to reject this passenger?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(rejectCarpoolRequest({ carpoolId, passengerId })).unwrap();
              fetchDriverCarpools();
            } catch (e) {
              Alert.alert('Error', 'Failed to reject');
            }
          }
        }
      ]
    );
  };

  const handleStart = async (carpoolId) => {
    try {
      await dispatch(startCarpool(carpoolId)).unwrap();
      const carpool = acceptedCarpools.find(c => c._id === carpoolId);
      navigation.navigate('CarpoolExecution', { carpool });
    } catch (e) {
      Alert.alert('Error', 'Failed to start');
    }
  };

  const handleCancel = async (carpoolId) => {
    Alert.alert(
      'Cancel Carpool',
      'Are you sure you want to cancel this carpool?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await api.delete(`/bookings/carpool/${carpoolId}`);
              if (res.data?.success) {
                Alert.alert('Success', 'Carpool cancelled.');
                fetchDriverCarpools();
              }
            } catch (error) {
              Alert.alert('Error', error.response?.data?.error || 'Failed to cancel carpool');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'searching': return '#A29BFE';
      case 'available': return '#4ECDC4';
      case 'full': return YELLOW_PRIMARY;
      case 'accepted': return '#45B7D1';
      case 'in-progress': return '#FF6B6B';
      case 'completed': return '#4ECDC4';
      case 'cancelled': return GRAY_MEDIUM;
      default: return GRAY_MEDIUM;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'searching': return 'Pending';
      case 'available': return 'Available';
      case 'full': return 'Full';
      case 'accepted': return 'Accepted';
      case 'in-progress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const renderPassenger = (passenger, carpoolId) => {
    const user = passenger.user || {};
    return (
      <View style={styles.passengerItem} key={user._id || Math.random()}>
        <View style={styles.passengerInfo}>
          {user.profileImage ? (
            <Image source={{ uri: user.profileImage }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Icon name="person" size={18} color={WHITE} />
            </View>
          )}
          <View style={styles.passengerDetails}>
            <Text style={styles.passengerText}>{user.name || 'Unknown Passenger'}</Text>
            <View style={styles.passengerMeta}>
              <Icon name="star" size={12} color={YELLOW_PRIMARY} />
              <Text style={styles.passengerSubText}>
                {user.stats?.rating || user.rating || 0}
              </Text>
              <View style={styles.metaDot} />
              <View style={[styles.statusDot, { backgroundColor: passenger.status === 'pending' ? YELLOW_PRIMARY : '#4ECDC4' }]} />
              <Text style={styles.passengerSubText}>
                {passenger.status.charAt(0).toUpperCase() + passenger.status.slice(1)}
              </Text>
            </View>
          </View>
        </View>

        {passenger.pickup && passenger.dropoff && (
          <View style={{ marginTop: 12 }}>
            <View style={styles.routeContainer}>
              <View style={styles.routePoint}>
                <View style={styles.routeIconGreen}>
                  <Icon name="my-location" size={12} color={WHITE} />
                </View>
                <Text style={styles.routeText} numberOfLines={1}>
                  {passenger.pickup?.address || 'Pickup location'}
                </Text>
              </View>
              <View style={styles.routeConnector}>
                <View style={styles.routeLine} />
                <View style={styles.routeDot} />
              </View>
              <View style={styles.routePoint}>
                <View style={styles.routeIconRed}>
                  <Icon name="location-on" size={12} color={WHITE} />
                </View>
                <Text style={styles.routeText} numberOfLines={1}>
                  {passenger.dropoff?.address || 'Dropoff location'}
                </Text>
              </View>
            </View>
            <CarpoolMapPreview 
              pickup={passenger.pickup} 
              dropoff={passenger.dropoff} 
              style={[styles.mapPreview, { height: 100, marginTop: 8 }]} 
            />
          </View>
        )}

        {passenger.status === 'pending' && (
          <View style={[styles.actionButtons, { marginTop: 16 }]}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.acceptActionBtn]} 
              onPress={() => handleAccept(carpoolId, user._id)}
              activeOpacity={0.7}
            >
              <Icon name="check" size={16} color={WHITE} />
              <Text style={styles.btnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.rejectActionBtn]} 
              onPress={() => handleReject(carpoolId, user._id)}
              activeOpacity={0.7}
            >
              <Icon name="close" size={16} color={WHITE} />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderCarpool = ({ item, index }) => {
    const isRequest = !!item.passengerId;
    const requestedBy = isRequest ? item.passengerId : null;
    const passengerCount = item.carpool?.passengers?.length || 0;
    const totalSeats = item.carpool?.totalSeats || 4;

    return (
      <Animatable.View 
        animation="fadeInUp" 
        duration={500} 
        delay={index * 100}
        style={styles.card}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={styles.dateBadge}>
              <Icon name="event" size={14} color={YELLOW_PRIMARY} />
              <Text style={styles.dateText}>
                {item.carpool?.departureTime ? 
                  new Date(item.carpool.departureTime).toLocaleString([], { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  }) : 'Invalid Date'}
              </Text>
            </View>
          </View>
          <View style={styles.cardHeaderRight}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '15' }]}>
              <View style={[styles.statusDotSmall, { backgroundColor: getStatusColor(item.status) }]} />
              <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
            {item.status !== 'completed' && item.status !== 'cancelled' && (
              <TouchableOpacity 
                onPress={() => handleCancel(item._id)}
                style={styles.cancelButton}
                activeOpacity={0.7}
              >
                <Icon name="close" size={18} color={GRAY_MEDIUM} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {isRequest && requestedBy && (
          <View style={styles.requesterSection}>
            <Text style={styles.requesterLabel}>Requested by:</Text>
            <View style={styles.requesterInfo}>
              {requestedBy.profileImage ? (
                <Image source={{ uri: requestedBy.profileImage }} style={styles.avatarSmall} />
              ) : (
                <View style={styles.avatarPlaceholderSmall}>
                  <Icon name="person" size={14} color={WHITE} />
                </View>
              )}
              <Text style={styles.requesterName}>
                {requestedBy.name || 'Passenger'}
              </Text>
              <View style={styles.requesterRating}>
                <Icon name="star" size={12} color={YELLOW_PRIMARY} />
                <Text style={styles.requesterRatingText}>
                  {requestedBy.stats?.rating || requestedBy.rating || 0}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.routeContainer}>
          <View style={styles.routePoint}>
            <View style={styles.routeIconGreen}>
              <Icon name="my-location" size={12} color={WHITE} />
            </View>
            <Text style={styles.routeText} numberOfLines={1}>
              {item.pickup?.address || 'Pickup location'}
            </Text>
          </View>
          <View style={styles.routeConnector}>
            <View style={styles.routeLine} />
            <View style={styles.routeDot} />
          </View>
          <View style={styles.routePoint}>
            <View style={styles.routeIconRed}>
              <Icon name="location-on" size={12} color={WHITE} />
            </View>
            <Text style={styles.routeText} numberOfLines={1}>
              {item.dropoff?.address || 'Dropoff location'}
            </Text>
          </View>
        </View>

        <CarpoolMapPreview 
          pickup={item.pickup} 
          dropoff={item.dropoff} 
          style={styles.mapPreview} 
        />

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <IconMC name="seat" size={16} color={YELLOW_PRIMARY} />
            <Text style={styles.statText}>
              {totalSeats - passengerCount} / {totalSeats} seats
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Icon name="attach-money" size={16} color={YELLOW_PRIMARY} />
            <Text style={styles.statText}>Rs. {item.carpool?.pricePerSeat || 0}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Icon name="people" size={16} color={YELLOW_PRIMARY} />
            <Text style={styles.statText}>{passengerCount} joined</Text>
          </View>
        </View>

        {!isRequest && (
          <View style={styles.passengersList}>
            <Text style={styles.subtitle}>Passengers</Text>
            {!item.carpool?.passengers || item.carpool.passengers.length === 0 ? (
              <View style={styles.emptyPassengers}>
                <IconMC name="account-multiple" size={32} color={GRAY_MEDIUM} />
                <Text style={styles.noData}>No passengers yet</Text>
              </View>
            ) : (
              item.carpool.passengers.map(p => renderPassenger(p, item._id))
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          {item.status === 'searching' && isRequest ? (
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => handleAccept(item._id, item.passengerId?._id, isRequest)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="check" size={20} color={WHITE} />
                <Text style={styles.actionButtonText}>Accept Request</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (item.status === 'available' || item.status === 'full' || item.status === 'accepted' || item.status === 'confirmed') ? (
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => handleStart(item._id)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="play-arrow" size={20} color={WHITE} />
                <Text style={styles.actionButtonText}>Start Carpool</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : item.status === 'in-progress' ? (
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => navigation.navigate('CarpoolExecution', { carpool: item })}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#4ECDC4', '#44B39D']}
                style={styles.actionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Icon name="directions-car" size={20} color={WHITE} />
                <Text style={styles.actionButtonText}>Continue Execution</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}
        </View>
      </Animatable.View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={YELLOW_PRIMARY} />
          <Text style={styles.loadingText}>Loading carpools...</Text>
        </View>
      </SafeAreaView>
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
            <Text style={styles.headerTitle}>
              {isIntercity ? 'Intercity Carpools' : 'Manage Carpools'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {activeTab === 'pending' ? pendingRequests.length : acceptedCarpools.length} carpools
            </Text>
          </View>
          <TouchableOpacity style={styles.filterButton} onPress={onRefresh}>
            <Icon name="refresh" size={22} color={GRAY_DARK} />
          </TouchableOpacity>
        </View>

        {/* 50/50 Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'pending' && styles.activeTab]} 
            onPress={() => setActiveTab('pending')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={activeTab === 'pending' ? [YELLOW_PRIMARY, YELLOW_SECONDARY] : ['transparent', 'transparent']}
              style={[styles.tabGradient, activeTab === 'pending' && styles.tabGradientActive]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.tabContent}>
                <View style={styles.tabIconContainer}>
                  <IconMC 
                    name="clock-time-four" 
                    size={18} 
                    color={activeTab === 'pending' ? WHITE : GRAY_MEDIUM} 
                  />
                </View>
                <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
                  Pending
                </Text>
                {(pendingRequests.length + acceptedCarpools.filter(c => !c.passengerId && c.carpool?.passengers?.some(p => p.status === 'pending')).length) > 0 && (
                  <View style={[styles.tabBadge, activeTab === 'pending' && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === 'pending' && styles.tabBadgeTextActive]}>
                      {pendingRequests.length + acceptedCarpools.filter(c => !c.passengerId && c.carpool?.passengers?.some(p => p.status === 'pending')).length}
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.tab, activeTab === 'accepted' && styles.activeTab]} 
            onPress={() => setActiveTab('accepted')}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={activeTab === 'accepted' ? [YELLOW_PRIMARY, YELLOW_SECONDARY] : ['transparent', 'transparent']}
              style={[styles.tabGradient, activeTab === 'accepted' && styles.tabGradientActive]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.tabContent}>
                <View style={styles.tabIconContainer}>
                  <IconMC 
                    name="check-circle" 
                    size={18} 
                    color={activeTab === 'accepted' ? WHITE : GRAY_MEDIUM} 
                  />
                </View>
                <Text style={[styles.tabText, activeTab === 'accepted' && styles.tabTextActive]}>
                  Accepted
                </Text>
                {acceptedCarpools.filter(c => c.passengerId || !c.carpool?.passengers?.some(p => p.status === 'pending')).length > 0 && (
                  <View style={[styles.tabBadge, activeTab === 'accepted' && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, activeTab === 'accepted' && styles.tabBadgeTextActive]}>
                      {acceptedCarpools.filter(c => c.passengerId || !c.carpool?.passengers?.some(p => p.status === 'pending')).length}
                    </Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <FlatList
          data={activeTab === 'pending' 
            ? [...pendingRequests, ...acceptedCarpools.filter(c => !c.passengerId && c.carpool?.passengers?.some(p => p.status === 'pending'))] 
            : acceptedCarpools.filter(c => c.passengerId || !c.carpool?.passengers?.some(p => p.status === 'pending'))}
          renderItem={renderCarpool}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <IconMC name="car-search" size={56} color={GRAY_LIGHT} />
              </View>
              <Text style={styles.emptyTitle}>No {activeTab} Carpools</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'pending' 
                  ? 'You have no pending requests right now.' 
                  : 'Your accepted carpools will appear here.'}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={YELLOW_PRIMARY}
              colors={[YELLOW_PRIMARY]}
            />
          }
          showsVerticalScrollIndicator={false}
        />

        {/* FAB */}
        <TouchableOpacity 
          style={styles.fab}
          onPress={() => navigation.navigate('CreateCarpool', { isIntercity })}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[YELLOW_PRIMARY, YELLOW_SECONDARY]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Icon name="add" size={24} color={WHITE} />
            <Text style={styles.fabText}>Create</Text>
          </LinearGradient>
        </TouchableOpacity>
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
    marginTop:23
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    padding: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabGradient: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  tabGradientActive: {
    shadowColor: YELLOW_PRIMARY,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: GRAY_MEDIUM,
  },
  tabTextActive: {
    color: WHITE,
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: GRAY_LIGHT,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: GRAY_MEDIUM,
  },
  tabBadgeTextActive: {
    color: WHITE,
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
    color: GRAY_DARK,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GRAY_LIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requesterSection: {
    padding: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: GRAY_LIGHT,
  },
  requesterLabel: {
    fontSize: 12,
    color: GRAY_MEDIUM,
    fontWeight: '500',
  },
  requesterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 10,
  },
  requesterName: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  requesterRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: WHITE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  requesterRatingText: {
    fontSize: 12,
    fontWeight: '500',
    color: GRAY_DARK,
  },
  routeContainer: {
    padding: 16,
    paddingTop: 12,
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
  mapPreview: {
    height: 140,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GRAY_LIGHT,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E0E0E0',
  },
  statText: {
    fontSize: 13,
    color: GRAY_DARK,
    fontWeight: '500',
  },
  passengersList: {
    padding: 16,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    marginBottom: 10,
  },
  emptyPassengers: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  noData: {
    color: GRAY_MEDIUM,
    fontSize: 13,
    marginTop: 4,
  },
  passengerItem: {
    backgroundColor: GRAY_LIGHT,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  passengerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passengerDetails: {
    flex: 1,
    marginLeft: 10,
  },
  passengerText: {
    fontSize: 14,
    fontWeight: '500',
    color: BLACK,
  },
  passengerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  passengerSubText: {
    fontSize: 12,
    color: GRAY_MEDIUM,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: GRAY_MEDIUM,
    marginHorizontal: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GRAY_MEDIUM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlaceholderSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GRAY_MEDIUM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  acceptActionBtn: {
    backgroundColor: '#4ECDC4',
  },
  rejectActionBtn: {
    backgroundColor: '#FF6B6B',
  },
  btnText: {
    color: WHITE,
    fontWeight: '600',
    fontSize: 13,
  },
  cardFooter: {
    padding: 16,
    paddingTop: 0,
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
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
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: BLACK,
  },
  emptyText: {
    fontSize: 14,
    color: GRAY_MEDIUM,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: YELLOW_PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
  },
  fabText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '600',
  },
  });
};

export default ManageCarpoolsScreen;