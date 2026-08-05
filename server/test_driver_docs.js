const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/raftar').then(async () => {
  const Driver = require('./models/Driver');
  const d = await Driver.findOne({ documents: { $exists: true } });
  console.log(JSON.stringify(d?.documents, null, 2));
  process.exit(0);
});
