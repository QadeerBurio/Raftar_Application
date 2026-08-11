import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Switch,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  Easing,
  ActivityIndicator
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import IconIonic from 'react-native-vector-icons/Ionicons';
import IconFA from 'react-native-vector-icons/FontAwesome5';
import IconMCI from 'react-native-vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { logout } from '../../redux/slices/authSlice';
import { updateProfile } from '../../redux/slices/userSlice';
import { useTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

const SidebarMenu = ({ visible, onClose }) => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { user } = useSelector(state => state.auth);

  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState('English');
  const [isImageLoading, setIsImageLoading] = useState(false);
  const { isDark, toggleTheme } = useTheme();

  const sidebarTranslateX = useRef(new Animated.Value(width)).current;
  const sidebarOverlayOpacity = useRef(new Animated.Value(0)).current;
  const sidebarScale = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(sidebarTranslateX, {
          toValue: 0,
          duration: 350,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(sidebarOverlayOpacity, {
          toValue: 0.5,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(sidebarScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(sidebarTranslateX, {
          toValue: width,
          duration: 300,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(sidebarOverlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);

  const handleLogout = () => {
    onClose();
    setTimeout(() => {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              if (window.locationInterval) {
                clearInterval(window.locationInterval);
                window.locationInterval = null;
              }
              await dispatch(logout());
              navigation.reset({
                index: 0,
                routes: [{ name: 'Auth' }],
              });
            }
          }
        ]
      );
    }, 300);
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow access to your photo library');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled) {
        setIsImageLoading(true);
        try {
          await dispatch(updateProfile({ profilePhoto: result.assets[0].uri })).unwrap();
          Alert.alert('Success', 'Profile photo updated successfully');
        } catch (error) {
          Alert.alert('Error', 'Failed to update profile photo');
        } finally {
          setIsImageLoading(false);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const getIcon = (icon, iconType, size, color) => {
    switch (iconType) {
      case 'material': return <Icon name={icon} size={size} color={color} />;
      case 'ionicon': return <IconIonic name={icon} size={size} color={color} />;
      case 'material-community': return <IconMCI name={icon} size={size} color={color} />;
      case 'fontawesome': return <IconFA name={icon} size={size} color={color} />;
      default: return <Icon name="circle" size={size} color={color} />;
    }
  };

  const sidebarMenuItems = [
    { icon: 'person-outline', iconType: 'ionicon', label: 'My Profile', onPress: () => { onClose(); navigation.navigate('Profile'); } },
    { icon: 'time-outline', iconType: 'ionicon', label: 'Ride History', count: 12, onPress: () => { onClose(); navigation.navigate('RideHistory'); } },
    { icon: 'wallet-outline', iconType: 'ionicon', label: 'Wallet', onPress: () => { onClose(); navigation.navigate('Wallet'); } },
    { icon: 'cash-outline', iconType: 'ionicon', label: 'My Spending', onPress: () => { onClose(); navigation.navigate('Spending'); } },
    { icon: 'card-outline', iconType: 'ionicon', label: 'Payment Methods', count: 2, onPress: () => { onClose(); navigation.navigate('PaymentMethods'); } },
    { icon: 'notifications-outline', iconType: 'ionicon', label: 'Push Notifications', isSwitch: true, switchValue: notifications, onSwitchChange: setNotifications },
    { icon: 'moon-outline', iconType: 'ionicon', label: 'Dark Mode', isSwitch: true, switchValue: isDark, onSwitchChange: toggleTheme },
    { icon: 'globe-outline', iconType: 'ionicon', label: 'Language', value: language, onPress: () => { onClose(); Alert.alert('Select Language', 'Choose your preferred language', [{ text: 'English', onPress: () => setLanguage('English') }, { text: 'Urdu', onPress: () => setLanguage('Urdu') }, { text: 'Arabic', onPress: () => setLanguage('Arabic') }, { text: 'Cancel', style: 'cancel' }]); } },
    { icon: 'help-circle-outline', iconType: 'ionicon', label: 'Help & Support', onPress: () => { onClose(); navigation.navigate('HelpCenter'); } },
    { icon: 'information-circle-outline', iconType: 'ionicon', label: 'About Raftar', onPress: () => { onClose(); navigation.navigate('About'); } },
    { icon: 'log-out-outline', iconType: 'ionicon', label: 'Logout', onPress: handleLogout, isDanger: true },
  ];

  return (
    <Modal transparent={true} visible={visible} onRequestClose={onClose} statusBarTranslucent={true}>
      <Animated.View style={[styles.sidebarOverlay, { opacity: sidebarOverlayOpacity }]}>
        <Pressable style={styles.sidebarPressable} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sidebarContainer, { transform: [{ translateX: sidebarTranslateX }, { scale: sidebarScale }] }]}>
        <LinearGradient colors={['#F9C349', '#F8B82A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sidebarHeader}>
          <TouchableOpacity style={styles.sidebarCloseButton} onPress={onClose}>
            <Icon name="close" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.sidebarUserInfo}>
            <TouchableOpacity style={styles.sidebarAvatarContainer} onPress={pickImage}>
              <Image source={{ uri: user?.profilePhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop&crop=face' }} style={styles.sidebarAvatar} />
              <View style={styles.sidebarCameraIcon}>
                <Icon name="camera-alt" size={12} color="#000" />
              </View>
            </TouchableOpacity>
            <Text style={styles.sidebarUserName} numberOfLines={1}>{user?.name || 'Guest User'}</Text>
            <Text style={styles.sidebarUserEmail} numberOfLines={1}>{user?.email || 'No email'}</Text>
          </View>
          <View style={styles.sidebarStats}>
            <View style={styles.sidebarStat}><Text style={styles.sidebarStatValue}>12</Text><Text style={styles.sidebarStatLabel}>Rides</Text></View>
            <View style={styles.sidebarStatDivider} />
            <View style={styles.sidebarStat}><Text style={styles.sidebarStatValue}>4.8</Text><Text style={styles.sidebarStatLabel}>Rating</Text></View>
            <View style={styles.sidebarStatDivider} />
            <View style={styles.sidebarStat}><Text style={styles.sidebarStatValue}>2.3k</Text><Text style={styles.sidebarStatLabel}>Points</Text></View>
          </View>
        </LinearGradient>
        <ScrollView style={styles.sidebarMenu} showsVerticalScrollIndicator={false}>
          {sidebarMenuItems.map((item, index) => (
            <TouchableOpacity key={index} style={[styles.sidebarMenuItem, item.isDanger && styles.sidebarMenuItemDanger]} onPress={item.onPress} activeOpacity={0.7} disabled={item.isSwitch}>
              <View style={styles.sidebarMenuItemLeft}>
                <View style={[styles.sidebarMenuItemIcon, item.isDanger && styles.sidebarMenuItemIconDanger]}>
                  {getIcon(item.icon, item.iconType, 22, item.isDanger ? '#FF3B30' : '#F9C349')}
                </View>
                <View style={styles.sidebarMenuItemTextContainer}>
                  <Text style={[styles.sidebarMenuItemText, item.isDanger && styles.sidebarMenuItemTextDanger]}>{item.label}</Text>
                  {item.value && <Text style={styles.sidebarMenuItemValue}>{item.value}</Text>}
                </View>
              </View>
              <View style={styles.sidebarMenuItemRight}>
                {item.count && <View style={styles.sidebarMenuBadge}><Text style={styles.sidebarMenuBadgeText}>{item.count}</Text></View>}
                {item.isSwitch ? (
                  <Switch value={item.switchValue} onValueChange={item.onSwitchChange} trackColor={{ false: '#E0E0E0', true: '#F9C349' }} thumbColor={item.switchValue ? '#FFF' : '#999'} ios_backgroundColor="#E0E0E0" />
                ) : (
                  <Icon name="chevron-right" size={20} color="#CCC" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sidebarFooter}>
          <Text style={styles.sidebarVersion}>Version 2.0.0</Text>
          <View style={styles.sidebarSocialIcons}>
            <TouchableOpacity style={styles.sidebarSocialIcon}><IconMCI name="facebook" size={20} color="#888" /></TouchableOpacity>
            <TouchableOpacity style={styles.sidebarSocialIcon}><IconMCI name="twitter" size={20} color="#888" /></TouchableOpacity>
            <TouchableOpacity style={styles.sidebarSocialIcon}><IconMCI name="instagram" size={20} color="#888" /></TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
  },
  sidebarPressable: {
    flex: 1,
  },
  sidebarContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: width * 0.85,
    backgroundColor: '#FFFFFF',
    zIndex: 1001,
    borderTopLeftRadius: 30,
    borderBottomLeftRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 20,
  },
  sidebarHeader: {
    paddingTop: 50,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  sidebarCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  sidebarUserInfo: {
    marginTop: 10,
  },
  sidebarAvatarContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  sidebarAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 35,
  },
  sidebarCameraIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sidebarUserName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#000',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  sidebarUserEmail: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    fontWeight: '500',
  },
  sidebarStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  sidebarStat: {
    flex: 1,
    alignItems: 'center',
  },
  sidebarStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  sidebarStatValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
  },
  sidebarStatLabel: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
    fontWeight: '600',
    marginTop: 4,
  },
  sidebarMenu: {
    flex: 1,
    paddingTop: 12,
  },
  sidebarMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  sidebarMenuItemDanger: {
    marginTop: 12,
    marginBottom: 24,
    backgroundColor: '#FFF0F0',
    marginHorizontal: 16,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  sidebarMenuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarMenuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  sidebarMenuItemIconDanger: {
    backgroundColor: 'transparent',
    width: 32,
    marginRight: 12,
  },
  sidebarMenuItemTextContainer: {
    justifyContent: 'center',
  },
  sidebarMenuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  sidebarMenuItemTextDanger: {
    color: '#FF3B30',
  },
  sidebarMenuItemValue: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    fontWeight: '500',
  },
  sidebarMenuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarMenuBadge: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  sidebarMenuBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sidebarFooter: {
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  sidebarVersion: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 16,
    letterSpacing: 1,
  },
  sidebarSocialIcons: {
    flexDirection: 'row',
    gap: 16,
  },
  sidebarSocialIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});

export default SidebarMenu;
