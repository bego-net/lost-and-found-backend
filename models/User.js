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
  },

  googleId: {
    type: String,
  },

  avatar: {
    type: String,
  },

  profileImage: {
    type: String,
    default: "/uploads/default-profile.png",
  },

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },

  isBanned: {
    type: Boolean,
    default: false,
  },

  resetToken: {
    type: String,
  },

  resetTokenExpire: {
    type: Date,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

}, { timestamps: true });

export default mongoose.model("User", UserSchema);