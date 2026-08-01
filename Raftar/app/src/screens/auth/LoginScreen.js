import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TextInput,
  Animated,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
// FIX: Import the login action
import { login } from '../../redux/slices/authSlice'; // Adjust the path as needed
import { useTheme } from '../../context/ThemeContext';

const { width, height } = Dimensions.get('window');

const LoginScreen = () => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { loading } = useSelector(state => state.auth);
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

  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
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

  const validate = () => {
    const newErrors = {};
    if (!phoneNumber || phoneNumber.length < 10) {
      newErrors.phoneNumber = 'Valid phone number is required';
    }
    if (!password || password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    try {
      // FIX: Dispatch the imported login action
      await dispatch(login({ phoneNumber, password })).unwrap();
      // Navigation will be handled by your AppNavigator based on auth state
    } catch (error) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    }
  };

  const handleOTPLogin = () => {
    navigation.navigate('OTP', { phoneNumber });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Animated Header */}
          <Animated.View
            style={[
              styles.header,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.logoContainer}>
              <View style={styles.logoWrapper}>
                <Animated.View
                  style={{
                    transform: [{ scale: scaleAnim }],
                  }}
                >
                  <Text style={styles.logoText}>Raftar</Text>
                </Animated.View>
                <Text style={styles.subtitle}>Har Safar, Aap Ke Saath</Text>
              </View>
            </View>
          </Animated.View>

          {/* Form Section */}
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.form}>
              <Text style={styles.welcomeText}>Welcome Back!</Text>
              <Text style={styles.welcomeSubtext}>
                Sign in to continue your journey
              </Text>

              {/* Phone Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Icon name="phone" size={22} color={palette.secondary} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Phone Number"
                  placeholderTextColor={palette.secondary}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  maxLength={13}
                />
                {phoneNumber.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setPhoneNumber('')}
                    style={styles.clearButton}
                  >
                    <Icon name="close" size={18} color={palette.secondary} />
                  </TouchableOpacity>
                )}
              </View>
              {errors.phoneNumber && (
                <Text style={styles.errorText}>{errors.phoneNumber}</Text>
              )}

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <View style={styles.inputIcon}>
                  <Icon name="lock" size={22} color={palette.secondary} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={palette.secondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Icon
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={palette.secondary}
                  />
                </TouchableOpacity>
              </View>
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}

              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => navigation.navigate('ForgotPassword')}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Login Button */}
              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                activeOpacity={0.8}
                disabled={loading}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <View style={styles.loader} />
                    <Text style={styles.loginButtonText}>Signing in...</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* OTP Button */}
              <TouchableOpacity
                style={styles.otpButton}
                onPress={handleOTPLogin}
                activeOpacity={0.7}
              >
                <Icon name="security" size={22} color={palette.accent} />
                <Text style={styles.otpButtonText}>Login with OTP</Text>
              </TouchableOpacity>

              {/* Register Link */}
              <View style={styles.registerContainer}>
                <Text style={styles.registerText}>Don&apos;t have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                  <Text style={styles.registerLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>

          <Text style={styles.version}>Version 1.0.0</Text>
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
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 50,
    fontWeight: '800',
    color: palette.accent,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  subtitle: {
    fontSize: 16,
    color: palette.secondary,
    marginTop: 6,
    letterSpacing: 1,
    fontWeight: '500',
  },
  formContainer: {
    width: '100%',
  },
  form: {
    width: '100%',
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 6,
  },
  welcomeSubtext: {
    fontSize: 15,
    color: palette.secondary,
    marginBottom: 30,
    fontWeight: '400',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.cards,
    borderRadius: 14,
    marginBottom: 6,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: palette.border,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
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
    marginTop: 2,
    marginBottom: 10,
    marginLeft: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: 4,
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: palette.text,
    borderRadius: 14,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  loginButtonText: {
    color: palette.bg,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: palette.bg,
    borderTopColor: palette.accent,
    borderRadius: 10,
    marginRight: 10,
    ...Platform.select({
      ios: {
        animation: 'spin 0.8s linear infinite',
      },
    }),
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.border,
  },
  dividerText: {
    color: palette.secondary,
    paddingHorizontal: 16,
    fontSize: 13,
    fontWeight: '500',
  },
  otpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.cards,
    borderRadius: 14,
    height: 56,
    borderWidth: 1.5,
    borderColor: palette.accent,
    gap: 10,
  },
  otpButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerText: {
    color: palette.secondary,
    fontSize: 15,
  },
  registerLink: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  socialLogin: {
    marginTop: 28,
    alignItems: 'center',
  },
  socialLoginText: {
    color: palette.secondary,
    fontSize: 13,
    marginBottom: 16,
    fontWeight: '400',
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.cards,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  version: {
    color: palette.secondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    fontWeight: '400',
  },
});

export default LoginScreen;