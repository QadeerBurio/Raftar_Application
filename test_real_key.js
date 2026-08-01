async function testPlaces() {
  const apiKey = 'AIzaSyAZs8JQxEHJoKvfRkof791lRQNEpsGvARA';
  
  try {
    console.log("Testing Legacy Autocomplete...");
    const legacyResponse = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=karachi&key=${apiKey}&components=country:pk`);
    const legacyData = await legacyResponse.json();
    console.log("Legacy Response:");
    console.log(JSON.stringify(legacyData, null, 2));

    console.log("\nTesting New Autocomplete...");
    const newResponse = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
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
    const newData = await newResponse.json();
    console.log("New Response:");
    console.log(JSON.stringify(newData, null, 2));

  } catch (err) {
    console.error(err);
  }
}

testPlaces();
