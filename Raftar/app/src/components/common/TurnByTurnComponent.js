import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';

const TurnByTurnComponent = ({ instruction, distance, eta }) => {
  const { colors, isDark } = useTheme();
  
  const styles = useMemo(() => {
    return StyleSheet.create({
      container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary || '#1E1E1E',
        padding: 16,
        borderRadius: 12,
        marginHorizontal: 16,
        marginTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 6,
        position: 'absolute',
        top: 20,
        left: 0,
        right: 0,
        zIndex: 10,
      },
      iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
      },
      textContainer: {
        flex: 1,
      },
      instruction: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
      },
      detailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
      },
      detailText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '500',
        opacity: 0.9,
      },
      dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#FFF',
        marginHorizontal: 8,
        opacity: 0.6,
      }
    });
  }, [colors, isDark]);

  if (!instruction) return null;

  // Determine icon based on instruction text
  let iconName = 'arrow-up-bold';
  const lowerInst = instruction.toLowerCase();
  if (lowerInst.includes('left')) iconName = 'arrow-left-bold';
  else if (lowerInst.includes('right')) iconName = 'arrow-right-bold';
  else if (lowerInst.includes('u-turn')) iconName = 'u-turn-direction';
  else if (lowerInst.includes('arrive') || lowerInst.includes('destination')) iconName = 'map-marker-check';

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <IconMC name={iconName} size={28} color="#FFF" />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.instruction} numberOfLines={2}>{instruction}</Text>
        <View style={styles.detailsRow}>
          {distance && <Text style={styles.detailText}>{distance}</Text>}
          {distance && eta && <View style={styles.dot} />}
          {eta && <Text style={styles.detailText}>{eta}</Text>}
        </View>
      </View>
    </View>
  );
};

export default TurnByTurnComponent;
