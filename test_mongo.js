const mongoose = require('mongoose');

console.log("Attempting to connect to MongoDB at mongodb://127.0.0.1:27017/expense_tracker...");

mongoose.connect('mongodb://127.0.0.1:27017/expense_tracker', {
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log("SUCCESS: Connected to MongoDB!");
    process.exit(0);
})
.catch(err => {
    console.error("ERROR: Failed to connect to MongoDB.");
    console.error(err);
    process.exit(1);
});
