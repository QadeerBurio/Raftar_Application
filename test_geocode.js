async function testGeocode() {
  const apiKey = 'AIzaSyAZs8JQxEHJoKvfRkof791lRQNEpsGvARA';
  
  try {
    console.log("Testing Geocoding...");
    const geocodeResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=karachi&key=${apiKey}`);
    const geocodeData = await geocodeResp.json();
    console.log(JSON.stringify(geocodeData, null, 2));
    
    console.log("Testing Distance Matrix...");
    const distResp = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?origins=24.8607,67.0011&destinations=24.9056,67.0822&key=${apiKey}`);
    const distData = await distResp.json();
    console.log(JSON.stringify(distData, null, 2));
  } catch (err) {
    console.error(err);
  }
}

testGeocode();
