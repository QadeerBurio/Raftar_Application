import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  TextInput,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { autocompletePlaces, getPlaceDetails } from '../../services/maps';

const CustomPlacesAutocomplete = forwardRef(({ 
  placeholder, 
  onPress, 
  styles: customStyles, 
  placeholderTextColor,
  renderRightButton
}, ref) => {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceTimeout = useRef(null);
  const latestQuery = useRef('');

  useImperativeHandle(ref, () => ({
    setAddressText: (text) => {
      setQuery(text);
    }
  }));

  const fetchPredictions = async (text) => {
    latestQuery.current = text;
    if (!text.trim()) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      // Handles legacy-vs-new Places API selection and logs the real Google
      // error (disabled API, key restriction, billing) when it fails.
      const results = await autocompletePlaces(text);

      // A slower earlier keystroke must not overwrite newer results.
      if (latestQuery.current !== text) return;

      setPredictions(
        results.map(p => ({
          place_id: p.placeId,
          description: p.description,
          primaryText: p.primaryText,
          secondaryText: p.secondaryText,
        }))
      );
      setShowDropdown(results.length > 0);
    } catch (error) {
      console.error('[Autocomplete] Unexpected error:', error);
      setPredictions([]);
    } finally {
      if (latestQuery.current === text) setLoading(false);
    }
  };

  const handleTextChange = (text) => {
    setQuery(text);
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      fetchPredictions(text);
    }, 300);
  };

  const handleSelectPrediction = async (prediction) => {
    setQuery(prediction.description);
    setShowDropdown(false);
    setPredictions([]);
    
    try {
      const placeDetails = await getPlaceDetails(prediction.place_id);

      if (placeDetails?.location?.lat != null) {
        const address = placeDetails.address || prediction.description;
        setQuery(address);

        onPress(
          { description: address, place_id: placeDetails.placeId },
          {
            // Legacy shape kept so every existing caller keeps working.
            geometry: {
              location: {
                lat: placeDetails.location.lat,
                lng: placeDetails.location.lng,
              },
            },
          }
        );
      } else {
        // Details unavailable — the maps service has already logged why.
        console.warn('[Autocomplete] No coordinates for the selected place; selection ignored.');
      }
    } catch (error) {
      console.error('[Autocomplete] Error fetching place details:', error);
    }
  };

  return (
    <View style={[styles.container, customStyles?.container]}>
      <View style={[styles.inputContainer, customStyles?.textInputContainer]}>
        <TextInput
          style={[styles.input, customStyles?.textInput]}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor || '#666'}
          value={query}
          onChangeText={handleTextChange}
        />
        {renderRightButton && renderRightButton()}
        {loading && <ActivityIndicator size="small" color="#FFD700" style={[styles.loader, renderRightButton && { right: 40 }]} />}
      </View>
      
      {showDropdown && predictions.length > 0 && (
        <View style={[styles.dropdown, customStyles?.listView]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {predictions.map((item) => (
              <TouchableOpacity 
                key={item.place_id}
                style={[styles.predictionRow, customStyles?.row]}
                onPress={() => handleSelectPrediction(item)}
              >
                <Text style={[styles.predictionText, customStyles?.description]}>
                  {item.description}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
  },
  loader: {
    position: 'absolute',
    right: 12,
  },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    elevation: 5,
    zIndex: 1000,
  },
  predictionRow: {
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  predictionText: {
    fontSize: 14,
    color: '#333',
  }
});

export default CustomPlacesAutocomplete;
