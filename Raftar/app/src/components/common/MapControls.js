import React, { useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';

const MapControls = ({ onZoomIn, onZoomOut, onCenterMap }) => {
  const { colors, isDark } = useTheme();

  const styles = useMemo(() => {
    return StyleSheet.create({
      container: {
        position: 'absolute',
        right: 16,
        bottom: 16, 
        zIndex: 10,
        alignItems: 'center',
      },
      controlGroup: {
        backgroundColor: isDark ? colors.card : '#FFF',
        borderRadius: 8,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
        marginBottom: 16,
      },
      button: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
      },
      divider: {
        height: 1,
        backgroundColor: colors.border,
        width: '100%',
      },
      centerButton: {
        backgroundColor: isDark ? colors.card : '#FFF',
        borderRadius: 22,
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
      }
    });
  }, [colors, isDark]);

  return (
    <View style={styles.container}>
      <View style={styles.controlGroup}>
        <TouchableOpacity style={styles.button} onPress={onZoomIn} activeOpacity={0.7}>
          <IconMC name="plus" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.button} onPress={onZoomOut} activeOpacity={0.7}>
          <IconMC name="minus" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity style={styles.centerButton} onPress={onCenterMap} activeOpacity={0.7}>
        <IconMC name="crosshairs-gps" size={22} color={colors.primary || '#4A90E2'} />
      </TouchableOpacity>
    </View>
  );
};

export default MapControls;
