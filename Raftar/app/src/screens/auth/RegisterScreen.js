import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Image,
  Animated,
  Dimensions,
  SafeAreaView,
  TextInput,
  StatusBar,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { register, clearError } from '../../redux/slices/authSlice';
import { validatePhoneNumber, validatePassword } from '../../utils/validators';
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const RegisterScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);
  const { isDark } = useTheme();

  const palette = React.useMemo(() => ({
    bg: isDark ? '#0F0F0F' : '#FFFFFF',
    cards: isDark ? '#1A1A1A' : '#F5F5F5',
    text: isDark ? '#FFFFFF' : '#111111',
    secondary: isDark ? '#8A8A8A' : '#6A6A6A',
    accent: '#FFC107',
    border: isDark ? '#333333' : '#F0F0F0',
  }), [isDark]);

  const styles = React.useMemo(() => createStyles(palette), [palette]);
  
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    gender: 'male',
    role: 'passenger',
    profilePhoto: ''
  });
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
    if (error) {
      dispatch(clearError());
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please allow access to your photo library to set a profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setProfilePhoto(result.assets[0]);
        setFormData({ ...formData, profilePhoto: result.assets[0].uri });
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name || formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (formData.name.trim().length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }
    
    if (!formData.phoneNumber) {
      newErrors.phoneNumber = 'Phone number is required';
    } else if (!validatePhoneNumber(formData.phoneNumber)) {
      newErrors.phoneNumber = 'Invalid phone number format (e.g., 03XXXXXXXXX)';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!validatePassword(formData.password)) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    dispatch(clearError());
    
    if (!validate()) {
      const firstError = Object.keys(errors)[0];
      if (firstError) {
        Alert.alert('Validation Error', errors[firstError]);
      }
      return;
    }

    setIsSubmitting(true);

    try {
      const userData = {
        name: formData.name.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        password: formData.password,
        role: formData.role,
        gender: formData.gender,
        profilePhoto: profilePhoto?.uri || formData.profilePhoto || undefined
      };

      const result = await dispatch(register(userData)).unwrap();
      
      if (result && result.success) {
        Alert.alert(
          'Registration Successful',
          'Your account has been created successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Main' }],
                });
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Registration error:', error);
      
      let errorMessage = 'Registration failed. Please try again.';
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (error.error) {
        errorMessage = error.error;
      }

      if (errorMessage.toLowerCase().includes('already exists')) {
        errorMessage = 'This phone number is already registered. Please login instead.';
      } else if (errorMessage.toLowerCase().includes('network')) {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      Alert.alert('Registration Failed', errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = (field, label, placeholder, icon, options = {}) => {
    const isPassword = field === 'password' || field === 'confirmPassword';
    const isSecure = isPassword && 
      (field === 'password' ? !showPassword : !showConfirmPassword);
    const togglePassword = field === 'password' 
      ? () => setShowPassword(!showPassword)
      : () => setShowConfirmPassword(!showConfirmPassword);

    return (
      <Animated.View
        style={[
          styles.inputWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <Text style={styles.inputLabel}>{label}</Text>
        <View style={[
          styles.inputContainer,
          errors[field] && styles.inputContainerError
        ]}>
          <View style={styles.inputIcon}>
            <Icon name={icon} size={22} color={palette.secondary} />
          </View>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={palette.secondary}
            value={formData[field]}
            onChangeText={(value) => handleChange(field, value)}
            secureTextEntry={isSecure}
            keyboardType={options.keyboardType || 'default'}
            autoCapitalize={options.autoCapitalize || 'none'}
            editable={!isSubmitting}
            {...options}
          />
          {isPassword && (
            <TouchableOpacity onPress={togglePassword} style={styles.eyeButton}>
              <Icon 
                name={isSecure ? 'visibility-off' : 'visibility'} 
                size={22} 
                color={palette.secondary} 
              />
            </TouchableOpacity>
          )}
          {!isPassword && formData[field]?.length > 0 && (
            <TouchableOpacity
              onPress={() => handleChange(field, '')}
              style={styles.clearButton}
            >
              <Icon name="close" size={18} color={palette.secondary} />
            </TouchableOpacity>
          )}
        </View>
        {errors[field] && (
          <Text style={styles.errorText}>{errors[field]}</Text>
        )}
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={palette.bg} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo Section */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            
          </Animated.View>

          {/* Welcome Header */}
          <Animated.View
            style={[
              styles.welcomeContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <Text style={styles.welcomeTitle}>Create Account</Text>
            <Text style={styles.welcomeSubtitle}>Join our community and start your journey</Text>
            <Image 
              source={require('../../assets/raftar.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Form */}
          <View style={styles.form}>
            {renderInput('name', 'Full Name *', 'Enter your full name', 'person')}
            {renderInput('phoneNumber', 'Phone Number *', '03XX-XXXXXXX', 'phone', { keyboardType: 'phone-pad' })}
            {renderInput('password', 'Password *', 'Create a password (min 6 chars)', 'lock')}
            {renderInput('confirmPassword', 'Confirm Password *', 'Confirm your password', 'lock-outline')}

            {/* Role Selection */}
            <Animated.View
              style={[
                styles.roleSection,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.roleLabel}>Register as *</Text>
              <View style={styles.roleButtons}>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    formData.role === 'passenger' && styles.roleButtonActive
                  ]}
                  onPress={() => handleChange('role', 'passenger')}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Icon 
                    name="person" 
                    size={24} 
                    color={formData.role === 'passenger' ? palette.accent : palette.secondary} 
                  />
                  <Text style={[
                    styles.roleText,
                    formData.role === 'passenger' && styles.roleTextActive
                  ]}>Passenger</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleButton,
                    formData.role === 'driver' && styles.roleButtonActive
                  ]}
                  onPress={() => handleChange('role', 'driver')}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Icon 
                    name="directions-car" 
                    size={24} 
                    color={formData.role === 'driver' ? palette.accent : palette.secondary} 
                  />
                  <Text style={[
                    styles.roleText,
                    formData.role === 'driver' && styles.roleTextActive
                  ]}>Driver</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Profile Photo Input Field */}
            {/* <Animated.View
              style={[
                styles.inputWrapper,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.inputLabel}>Profile Photo</Text>
              <TouchableOpacity
                style={[
                  styles.inputContainer,
                  styles.photoInputContainer,
                  profilePhoto && styles.photoInputActive
                ]}
                onPress={pickImage}
                disabled={isSubmitting}
                activeOpacity={0.7}
              >
                <View style={styles.inputIcon}>
                  <Icon name="photo-camera" size={22} color="#666" />
                </View>
                <View style={styles.photoInputContent}>
                  {profilePhoto ? (
                    <>
                      <Image 
                        source={{ uri: profilePhoto.uri }} 
                        style={styles.photoPreview}
                      />
                      <Text style={styles.photoInputText} numberOfLines={1}>
                        {profilePhoto.uri.split('/').pop() || 'Photo selected'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.photoPlaceholderText}>
                      Tap to select profile photo
                    </Text>
                  )}
                </View>
                {profilePhoto && (
                  <TouchableOpacity
                    onPress={() => {
                      setProfilePhoto(null);
                      setFormData({ ...formData, profilePhoto: '' });
                    }}
                    style={styles.clearButton}
                  >
                    <Icon name="close" size={18} color="#888" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              <Text style={styles.photoHint}>Optional - Add a profile photo</Text>
            </Animated.View> */}

            {/* Error Container */}
            {error && (
              <Animated.View
                style={[
                  styles.errorContainer,
                  {
                    opacity: fadeAnim,
                  },
                ]}
              >
                <Icon name="error-outline" size={20} color="#FF3B30" />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            )}

            {/* Register Button */}
            <Animated.View
              style={[
                styles.buttonWrapper,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.registerButton,
                  isSubmitting && styles.registerButtonDisabled
                ]}
                onPress={handleRegister}
                disabled={isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <View style={styles.loadingContainer}>
                    <View style={styles.loader} />
                    <Text style={styles.registerButtonText}>Creating Account...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.registerButtonText}>Create Account</Text>
                    <Icon name="arrow-forward" size={24} color={palette.bg} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Login Link */}
            <Animated.View
              style={[
                styles.loginContainer,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate('Login')}
                disabled={isSubmitting}
              >
                <Text style={styles.loginLink}>Sign In</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (palette) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 30,
  },
  
  // Logo Section
  logoContainer: {
    alignItems: 'center',
    marginBottom: 46,
    marginTop: 5,
  },
  logo: {
    width: 120,
    height: 80,
  },

  // Welcome Header
  welcomeContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: palette.text,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: palette.secondary,
    marginTop: 4,
    fontWeight: '400',
    lineHeight: 20,
  },

  // Form
  form: {
    flex: 1,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    color: palette.text,
    fontSize: 14,
    marginBottom: 6,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cards,
    borderRadius: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: palette.border,
    height: 54,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  inputContainerError: {
    borderColor: '#FF3B30',
    borderWidth: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: palette.text,
    height: '100%',
    fontWeight: '400',
  },
  clearButton: {
    padding: 4,
  },
  eyeButton: {
    padding: 4,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 2,
    marginLeft: 4,
  },

  // Role Selection
  roleSection: {
    marginBottom: 18,
    marginTop: 4,
  },
  roleLabel: {
    color: palette.text,
    fontSize: 14,
    marginBottom: 10,
    fontWeight: '600',
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: palette.cards,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: palette.border,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  roleButtonActive: {
    borderColor: palette.accent,
    backgroundColor: palette.cards,
    shadowColor: palette.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  roleText: {
    color: palette.secondary,
    fontSize: 14,
    fontWeight: '500',
  },
  roleTextActive: {
    color: palette.text,
    fontWeight: '600',
  },

  // Profile Photo Input
  photoInputContainer: {
    paddingVertical: 8,
    height: 54,
  },
  photoInputActive: {
    borderColor: palette.accent,
    backgroundColor: palette.cards,
  },
  photoInputContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoPreview: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  photoInputText: {
    fontSize: 14,
    color: palette.text,
    flex: 1,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: palette.secondary,
    flex: 1,
  },
  photoHint: {
    color: palette.secondary,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },

  // Register Button
  buttonWrapper: {
    marginTop: 6,
  },
  registerButton: {
    backgroundColor: palette.text,
    borderRadius: 14,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    gap: 8,
  },
  registerButtonDisabled: {
    opacity: 0.7,
  },
  registerButtonText: {
    color: palette.bg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: 22,
    height: 22,
    borderWidth: 2.5,
    borderColor: palette.bg,
    borderTopColor: palette.accent,
    borderRadius: 11,
    marginRight: 12,
  },

  // Login Link
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 22,
    paddingBottom: 10,
  },
  loginText: {
    color: palette.secondary,
    fontSize: 15,
    fontWeight: '400',
  },
  loginLink: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: '700',
  },

  // Error Container
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cards,
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#FFD1D1',
    gap: 8,
  },
});

export default RegisterScreen;