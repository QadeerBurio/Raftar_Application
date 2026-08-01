async function testPlaces() {
  const apiKey = 'AIzaSyCgHvsDKNJGJp5K58UCXX61kWgz8jsajAI';
  
  try {
    console.log("Testing Legacy Autocomplete...");
    const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=karachi&key=${apiKey}&components=country:pk`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));

  } catch (err) {
    console.error(err);
  }
}

testPlaces();
