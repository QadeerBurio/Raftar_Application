async function testPlaces() {
  const apiKey = 'AIzaSyCgHvsDKNJGJp5K58UCXX61kWgz8jsajAI'; // Copied from test_places.js
  
  // Test autocomplete
  try {
    console.log("Testing Autocomplete...");
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey
      },
      body: JSON.stringify({
        input: 'karachi',
        includedRegionCodes: ['pk']
      })
    });
    const data = await response.json();
    console.log("Autocomplete response:");
    console.log(JSON.stringify(data, null, 2));

    if (data.suggestions && data.suggestions.length > 0) {
      const placeId = data.suggestions[0].placePrediction.placeId;
      console.log("\nTesting Place Details for ID:", placeId);
      
      const detailResponse = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'id,formattedAddress,location,displayName'
        }
      });
      const detailData = await detailResponse.json();
      console.log("Details response:");
      console.log(JSON.stringify(detailData, null, 2));
    }

  } catch (err) {
    console.error(err);
  }
}

testPlaces();
