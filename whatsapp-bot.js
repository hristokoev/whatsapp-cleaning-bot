const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
require("dotenv").config();

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000/api";
const API_KEY = process.env.API_KEY; // Same API key as your cleaning API
const AUTHORIZED_NUMBERS = process.env.AUTHORIZED_NUMBERS
  ? process.env.AUTHORIZED_NUMBERS.split(",").map((num) => num.trim())
  : [];
const COMMAND_PREFIX = process.env.COMMAND_PREFIX || "!"; // Default to '!' but configurable
const ALLOWED_GROUPS = process.env.ALLOWED_GROUPS
  ? process.env.ALLOWED_GROUPS.split(",").map((group) => group.trim())
  : [];
const ALLOW_DIRECT_MESSAGES = process.env.ALLOW_DIRECT_MESSAGES === "true";

// Create WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "cleaning-bot",
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
});

// Helper function to make API calls
const callAPI = async (endpoint, method = "GET", data = null) => {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {},
    };

    if (data) {
      config.data = data;
      config.headers["Content-Type"] = "application/json";
    }

    // Add API key for protected endpoints
    if (method !== "GET") {
      config.headers["X-API-Key"] = API_KEY;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error("API Error:", error.response?.data || error.message);
    throw new Error(error.response?.data?.error || "API request failed");
  }
};

// Helper function to format date for display
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  };
  return date.toLocaleDateString("en-US", options);
};

// Helper function to check if message is from allowed location
const isAllowedLocation = (message) => {
  const isDirectMessage = !message.isGroupMsg;
  const isFromGroup = message.isGroupMsg;

  // If no group restrictions set, allow everything
  if (ALLOWED_GROUPS.length === 0 && !ALLOW_DIRECT_MESSAGES) {
    return true; // No restrictions
  }

  // Check direct messages
  if (isDirectMessage) {
    return ALLOW_DIRECT_MESSAGES;
  }

  // Check group messages
  if (isFromGroup) {
    if (ALLOWED_GROUPS.length === 0) {
      return true; // No group restrictions, allow all groups
    }

    // Check if this group is in the allowed list
    const groupId = message.from;
    return ALLOWED_GROUPS.some((allowedGroup) =>
      groupId.includes(allowedGroup)
    );
  }

  return false;
};

// Command handlers
const handleCurrentCommand = async () => {
  try {
    const data = await callAPI("/current");

    const startDate = formatDate(data.periodStart);
    const endDate = formatDate(data.periodEnd);

    return (
      `🧹 *Current Cleaning Schedule*\n\n` +
      `👤 *${data.currentPerson}* is responsible\n` +
      `📅 ${startDate} - ${endDate}\n`
    );
  } catch (error) {
    return `❌ Error getting current schedule: ${error.message}`;
  }
};

const handleScheduleCommand = async () => {
  try {
    const data = await callAPI("/schedule");

    let message = `📋 *Cleaning Schedule Overview*\n\n`;
    message += `👥 *People:* ${data.people.join(", ")}\n`;
    message += `📅 *Started:* ${formatDate(data.startDate)}\n\n`;

    // Current rotation
    const current = data.currentRotation;
    message += `🎯 *Current: ${current.currentPerson}*\n`;
    message += `${formatDate(current.periodStart)} - ${formatDate(
      current.periodEnd
    )}\n\n`;

    // Upcoming rotations
    message += `🔮 *Upcoming Rotations:*\n`;
    data.upcomingRotations.slice(0, 3).forEach((rotation, index) => {
      message += `${rotation.person}: ${formatDate(rotation.periodStart)}\n`;
    });

    return message;
  } catch (error) {
    return `❌ Error getting schedule: ${error.message}`;
  }
};

const handleUpcomingCommand = async () => {
  try {
    const data = await callAPI("/schedule");

    let message = `🔮 *Upcoming Cleaning Rotations*\n\n`;

    data.upcomingRotations.forEach((rotation, index) => {
      message += `*${rotation.person}*\n`;
      message += `📅 ${formatDate(rotation.periodStart)} - ${formatDate(
        rotation.periodEnd
      )}\n`;
    });

    return message;
  } catch (error) {
    return `❌ Error getting upcoming schedule: ${error.message}`;
  }
};

const handleUpdatePeopleCommand = async (peopleString) => {
  try {
    const people = peopleString
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name);

    if (people.length === 0) {
      return `❌ Please provide a list of people separated by commas.\nExample: Robb, Daenerys, Jon, Arya`;
    }

    await callAPI("/schedule", "PUT", { people });

    return `✅ *People updated successfully!*\n\n👥 New list: ${people.join(
      ", "
    )}`;
  } catch (error) {
    return `❌ Error updating people: ${error.message}`;
  }
};

const handleUpdateStartDateCommand = async (dateString) => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return `❌ Invalid date format. Please use: YYYY-MM-DD\nExample: 2024-03-17`;
    }

    await callAPI("/schedule", "PUT", { startDate: date.toISOString() });

    return `✅ *Start date updated successfully!*\n\n📅 New start date: ${formatDate(
      date.toISOString()
    )}`;
  } catch (error) {
    return `❌ Error updating start date: ${error.message}`;
  }
};

const handleHelpCommand = () => {
  return (
    `🤖 *Cleaning Schedule Bot Commands*\n\n` +
    `📋 *Public Commands:*\n` +
    `• \`${COMMAND_PREFIX}current\` - Who's cleaning now?\n` +
    `• \`${COMMAND_PREFIX}schedule\` - Full schedule overview\n` +
    `• \`${COMMAND_PREFIX}upcoming\` - Next rotations\n` +
    `• \`${COMMAND_PREFIX}help\` - Show this help\n\n` +
    `🔐 *Admin Commands:*\n` +
    `• \`${COMMAND_PREFIX}update people Robb, Daenerys, Jon\` - Update people list\n` +
    `• \`${COMMAND_PREFIX}update date 2024-03-17\` - Update start date\n\n` +
    `💡 *Tips:*\n` +
    `• Each person cleans for exactly 2 weeks\n` +
    `• Rotation goes Monday to Sunday`
  );
};

// Event: QR Code for authentication
client.on("qr", (qr) => {
  console.log("🔗 Scan this QR code with your phone:");
  qrcode.generate(qr, { small: true });
  console.log(
    "📱 Open WhatsApp -> Settings -> Linked Devices -> Link a Device"
  );
});

// Event: Client ready
client.on("ready", () => {
  console.log("✅ WhatsApp bot is ready!");
  console.log(`🔗 Connected and listening for messages...`);
  console.log(`🌐 API URL: ${API_BASE_URL}`);
  console.log(`🔑 API Key configured: ${!!API_KEY}`);
  console.log(
    `👥 Authorized numbers: ${
      AUTHORIZED_NUMBERS.length > 0
        ? AUTHORIZED_NUMBERS.join(", ")
        : "All numbers"
    }`
  );
  console.log(`⚡ Command prefix: ${COMMAND_PREFIX}`);
  console.log(
    `📱 Direct messages: ${ALLOW_DIRECT_MESSAGES ? "Allowed" : "Blocked"}`
  );
  console.log(
    `🏠 Allowed groups: ${
      ALLOWED_GROUPS.length > 0 ? ALLOWED_GROUPS.join(", ") : "All groups"
    }`
  );
});

// Event: Authentication success
client.on("authenticated", () => {
  console.log("🔐 WhatsApp authentication successful");
});

// Event: Authentication failure
client.on("auth_failure", (message) => {
  console.error("❌ WhatsApp authentication failed:", message);
});

// Event: Disconnected
client.on("disconnected", (reason) => {
  console.log("📴 WhatsApp disconnected:", reason);
});

// Helper function to check if user is authorized for admin commands
const isAuthorized = (number) => {
  if (AUTHORIZED_NUMBERS.length === 0) return true; // If no restriction set, allow all
  return AUTHORIZED_NUMBERS.some((authNum) => number.includes(authNum));
};

// Event: Message received
client.on("message", async (message) => {
  // Skip if message is from status broadcast
  if (message.from === "status@broadcast") {
    return;
  }

  // Skip if message is not text
  if (message.type !== "chat") {
    return;
  }

  // Check if message is from allowed location (group/DM restrictions)
  if (!isAllowedLocation(message)) {
    console.log(
      `🚫 Ignoring message from restricted location: ${message.from} (Group: ${message.isGroupMsg})`
    );
    return;
  }

  const content = message.body.trim();
  const senderNumber = message.from;

  // Check if message starts with command prefix
  if (!content.startsWith(COMMAND_PREFIX)) {
    return; // Ignore messages that don't start with the prefix
  }

  // Remove prefix and convert to lowercase for command matching
  const command = content.slice(COMMAND_PREFIX.length).toLowerCase().trim();

  // List of valid commands
  const validCommands = [
    "test",
    "ping",
    "current",
    "who",
    "now",
    "schedule",
    "all",
    "upcoming",
    "next",
    "help",
    "commands",
  ];

  // Check for admin commands
  const isUpdateCommand =
    command.startsWith("update people ") || command.startsWith("update date ");
  const isValidCommand = validCommands.includes(command) || isUpdateCommand;

  // If not a valid command, ignore silently
  if (!isValidCommand) {
    console.log(`🤐 Ignoring invalid command: "${COMMAND_PREFIX}${command}"`);
    return;
  }

  console.log(
    `📨 Valid command from ${senderNumber}: "${COMMAND_PREFIX}${command}"`
  );

  let response = "";

  try {
    // Test command for debugging
    if (command === "test" || command === "ping") {
      response = "🏓 Pong! Bot is working!";
    }
    // Public commands
    else if (command === "current" || command === "who" || command === "now") {
      response = await handleCurrentCommand();
    } else if (command === "schedule" || command === "all") {
      response = await handleScheduleCommand();
    } else if (command === "upcoming" || command === "next") {
      response = await handleUpcomingCommand();
    } else if (command === "help" || command === "commands") {
      response = handleHelpCommand();
    }
    // Admin commands (require authorization)
    else if (command.startsWith("update people ")) {
      if (!isAuthorized(senderNumber)) {
        response = "🔒 Sorry, you are not authorized to use admin commands.";
      } else {
        const peopleString = content.slice(
          (COMMAND_PREFIX + "update people ").length
        ); // Remove prefix + "update people "
        response = await handleUpdatePeopleCommand(peopleString);
      }
    } else if (command.startsWith("update date ")) {
      if (!isAuthorized(senderNumber)) {
        response = "🔒 Sorry, you are not authorized to use admin commands.";
      } else {
        const dateString = content.slice(
          (COMMAND_PREFIX + "update date ").length
        ); // Remove prefix + "update date "
        response = await handleUpdateStartDateCommand(dateString);
      }
    }
    // Unknown command
    else {
      response = `🤔 Unknown command: \`${COMMAND_PREFIX}${command}\`\n\nType \`${COMMAND_PREFIX}help\` to see available commands.`;
    }

    // Send response if we have one
    if (response) {
      console.log(`💬 Sending response: ${response.substring(0, 50)}...`);
      await message.reply(response);
      console.log(`✅ Successfully replied to ${senderNumber}`);
    }
  } catch (error) {
    console.error("❌ Error processing message:", error);
    try {
      await message.reply(
        "❌ Sorry, something went wrong. Please try again later."
      );
      console.log(`⚠️ Sent error message to ${senderNumber}`);
    } catch (replyError) {
      console.error("❌ Failed to send error reply:", replyError);
    }
  }
});

// Error handling
client.on("error", (error) => {
  console.error("❌ WhatsApp client error:", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down WhatsApp bot...");
  await client.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Shutting down WhatsApp bot...");
  await client.destroy();
  process.exit(0);
});

// Start the client
console.log("🚀 Starting WhatsApp Cleaning Schedule Bot...");
client.initialize();
