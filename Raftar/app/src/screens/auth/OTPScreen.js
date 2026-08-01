import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import { useDispatch } from 'react-redux';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import OTPTextInput from 'react-native-otp-textinput';
import Button from '../../components/common/Button';
import { verifyOTP, sendOTP } from '../../redux/slices/authSlice';
import api from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

const OTPScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const dispatch = useDispatch();
  const otpInput = useRef(null);
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
  
  const { phoneNumber } = route.params || {};
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (!phoneNumber) {
      navigation.goBack();
    }
    startTimer();
  }, []);

  const startTimer = () => {
    setCanResend(false);
    setResendTimer(30);
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length < 4) {
      Alert.alert('Error', 'Please enter the OTP');
      return;
    }

    setLoading(true);
    try {
      await dispatch(verifyOTP({ phoneNumber, otp })).unwrap();
      // Navigation handled by AppNavigator
    } catch (error) {
      Alert.alert('Verification Failed', error.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!canResend) return;
    
    try {
      await api.post('/auth/send-otp', { phoneNumber });
      Alert.alert('Success', 'OTP resent successfully');
      startTimer();
    } catch (error) {
      Alert.alert('Error', 'Failed to resend OTP');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color={palette.text} />
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconContainer}>
            <Icon name="verified" size={60} color={palette.accent} />
          </View>
          <Text style={styles.title}>Verify Your Phone</Text>
          <Text style={styles.subtitle}>
            We&apos;ve sent a verification code to {'\n'}
            <Text style={styles.phoneNumber}>{phoneNumber}</Text>
          </Text>
        </View>

        <View style={styles.otpContainer}>
          <OTPTextInput
            ref={otpInput}
            handleTextChange={setOtp}
            inputCount={6}
            autoFocus
            tintColor={palette.accent}
            offTintColor={palette.border}
            textInputStyle={styles.otpInput}
            containerStyle={styles.otpContainerStyle}
          />
        </View>

        <Button
          title="Verify"
          onPress={handleVerifyOTP}
          loading={loading}
          size="large"
          style={styles.verifyButton}
        />

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>
            Didn&apos;t receive the code? 
          </Text>
          {canResend ? (
            <TouchableOpacity onPress={handleResendOTP}>
              <Text style={styles.resendLink}> Resend</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.timerText}> Resend in {resendTimer}s</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.changeNumber}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.changeNumberText}>Change Phone Number</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (palette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  backButton: {
    padding: 8,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: palette.cards,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: palette.accent,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: palette.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: palette.secondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  phoneNumber: {
    color: palette.accent,
    fontWeight: 'bold',
  },
  otpContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  otpContainerStyle: {
    width: '100%',
    justifyContent: 'center',
  },
  otpInput: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: palette.cards,
    color: palette.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  verifyButton: {
    marginBottom: 20,
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    color: palette.secondary,
    fontSize: 14,
  },
  resendLink: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: 'bold',
  },
  timerText: {
    color: palette.secondary,
    fontSize: 14,
  },
  changeNumber: {
    alignSelf: 'center',
    marginTop: 20,
  },
  changeNumberText: {
    color: palette.secondary,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});

export default OTPScreen;