import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,

    lowercase: true,
  },

  password: {
    type: String,
    required: true,
  },

  profileImage: {
  type: String,
  default: "/uploads/default-profile.png"
},


  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("User", UserSchema);
