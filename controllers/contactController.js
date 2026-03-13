import ContactMessage from "../models/ContactMessage.js";
import nodemailer from "nodemailer";

/* =========================================
   SEND CONTACT MESSAGE (USER)
========================================= */
export const sendContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Save message to database
    const newMessage = new ContactMessage({
      name,
      email,
      message
    });

    await newMessage.save();

    // Send email notification to admin
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
  from: email,
  to: process.env.EMAIL_USER,
  subject: "New Contact Message",
  text: `
Name: ${name}
Email: ${email}

Message:
${message}
`
});

    res.json({ message: "Message sent successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send message" });
  }
};


/* =========================================
   GET ALL CONTACT MESSAGES (ADMIN)
========================================= */
export const getMessages = async (req, res) => {
  try {

    const messages = await ContactMessage
      .find()
      .sort({ createdAt: -1 });

    res.json(messages);

  } catch (error) {

    res.status(500).json({ error: "Failed to fetch messages" });

  }
};

/* =========================================
   ADMIN REPLY TO MESSAGE
========================================= */
export const replyMessage = async (req, res) => {
  try {
    const { messageId, reply } = req.body;

    if (!messageId || !reply) {
      return res.status(400).json({ error: "messageId and reply are required" });
    }

    const message = await ContactMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: message.email,
      subject: "Re: Your contact message",
      text: reply
    });

    message.status = "read";
    await message.save();

    res.json({ message: "Reply sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send reply" });
  }
};

